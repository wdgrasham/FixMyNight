from datetime import datetime, time as dt_time
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional

from ..database import get_db
from ..dependencies import require_admin
from ..models import Client, Technician, Call
from ..schemas import (
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    TechnicianCreate,
    TechnicianUpdate,
    TechnicianResponse,
    CallResponse,
    CallsListResponse,
)
from ..utils.audit import write_audit_log
from ..services.vapi import rebuild_vapi_assistant
from ..services.twilio_service import send_verification_sms, send_sms
from ..services.onboarding import provision_client

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

VAPI_REBUILD_TRIGGERS = {
    "emergency_fee",
    "emergency_enabled",
    "callback_expected_time",
    "business_hours_start",
    "business_hours_end",
    "business_days",
    "sleep_window_start",
    "sleep_window_end",
    "business_hours_emergency_dispatch",
    "business_name",
    "industry_config",
    "agent_name",
}

# Fields that are stored as TIME in DB but received as strings
TIME_FIELDS = {
    "business_hours_start",
    "business_hours_end",
    "sleep_window_start",
    "sleep_window_end",
    "summary_send_time",
    "callback_expected_time",
}


def _parse_time(value: str) -> dt_time:
    """Parse a time string like '08:00' or '22:30' into a time object."""
    parts = value.split(":")
    return dt_time(int(parts[0]), int(parts[1]))


@router.get("/clients")
async def list_clients(
    admin=Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Client).order_by(Client.created_at.desc()))
    clients = result.scalars().all()
    return [ClientResponse.model_validate(c) for c in clients]


@router.post("/clients", response_model=ClientResponse)
async def create_client(
    payload: ClientCreate,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    client = await provision_client(payload, db)
    await db.refresh(client)
    return ClientResponse.model_validate(client)


@router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: str,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="CLIENT_NOT_FOUND")
    return ClientResponse.model_validate(client)


@router.patch("/clients/{client_id}", response_model=ClientResponse)
async def patch_client(
    client_id: str,
    payload: ClientUpdate,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="CLIENT_NOT_FOUND")

    updated_fields = payload.model_dump(exclude_unset=True)
    if not updated_fields:
        return ClientResponse.model_validate(client)

    needs_rebuild = bool(set(updated_fields.keys()) & VAPI_REBUILD_TRIGGERS)

    # Convert time strings to time objects
    for field in TIME_FIELDS:
        if field in updated_fields and updated_fields[field] is not None:
            updated_fields[field] = _parse_time(updated_fields[field])

    # Audit log each changed field
    for field, new_value in updated_fields.items():
        old_value = getattr(client, field)
        if str(old_value) != str(new_value):
            await write_audit_log(
                db,
                "config.field_changed",
                "admin",
                resource_type="client",
                resource_id=client.id,
                client_id=client.id,
                metadata={
                    "field": field,
                    "old_value": str(old_value),
                    "new_value": str(new_value),
                },
            )

    updated_fields["updated_at"] = datetime.utcnow()
    await db.execute(
        update(Client).where(Client.id == client_id).values(**updated_fields)
    )
    await db.commit()

    if needs_rebuild and client.vapi_assistant_id:
        try:
            await rebuild_vapi_assistant(client_id, db)
        except Exception as e:
            print(f"[WARNING] Vapi rebuild failed: {e}")

    await db.refresh(client)
    return ClientResponse.model_validate(client)


@router.delete("/clients/{client_id}")
async def delete_client(
    client_id: str,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="CLIENT_NOT_FOUND")
    await db.execute(
        update(Client)
        .where(Client.id == client_id)
        .values(status="inactive", updated_at=datetime.utcnow())
    )
    await db.commit()
    await write_audit_log(
        db,
        "config.field_changed",
        "admin",
        resource_type="client",
        resource_id=client.id,
        client_id=client.id,
        metadata={
            "field": "status",
            "old_value": client.status,
            "new_value": "inactive",
        },
    )
    return {"status": "deactivated"}


@router.get("/clients/{client_id}/calls", response_model=CallsListResponse)
async def get_client_calls(
    client_id: str,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    query = select(Call).where(Call.client_id == client_id)
    count_query = select(func.count()).select_from(Call).where(Call.client_id == client_id)

    if date_from:
        query = query.where(Call.created_at >= date_from)
        count_query = count_query.where(Call.created_at >= date_from)
    if date_to:
        query = query.where(Call.created_at <= date_to)
        count_query = count_query.where(Call.created_at <= date_to)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    result = await db.execute(
        query.order_by(Call.created_at.desc()).limit(limit).offset(offset)
    )
    calls = result.scalars().all()
    return {
        "calls": [CallResponse.model_validate(c) for c in calls],
        "total": total,
    }


@router.get("/clients/{client_id}/technicians")
async def get_client_technicians(
    client_id: str,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Technician)
        .where(Technician.client_id == client_id)
        .order_by(Technician.created_at)
    )
    techs = result.scalars().all()
    return [TechnicianResponse.model_validate(t) for t in techs]


@router.post("/clients/{client_id}/technicians", response_model=TechnicianResponse)
async def add_technician(
    client_id: str,
    payload: TechnicianCreate,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Verify client exists
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="CLIENT_NOT_FOUND")

    tech = Technician(
        client_id=client_id,
        name=payload.name,
        phone=payload.phone,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(tech)
    await db.commit()
    await db.refresh(tech)

    # Send verification SMS
    try:
        await send_verification_sms(tech, client)
        await db.execute(
            update(Technician)
            .where(Technician.id == tech.id)
            .values(phone_verified=True, verified_at=datetime.utcnow())
        )
        await db.commit()
        await db.refresh(tech)
    except Exception as e:
        print(f"[WARNING] Verification SMS failed: {e}")

    await write_audit_log(
        db,
        "tech.added",
        "admin",
        resource_type="technician",
        resource_id=tech.id,
        client_id=client.id,
        metadata={
            "tech_id": str(tech.id),
            "tech_name": tech.name,
            "tech_phone": tech.phone,
        },
    )
    return TechnicianResponse.model_validate(tech)


@router.patch(
    "/clients/{client_id}/technicians/{tech_id}",
    response_model=TechnicianResponse,
)
async def update_technician(
    client_id: str,
    tech_id: str,
    payload: TechnicianUpdate,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Technician).where(
            Technician.id == tech_id, Technician.client_id == client_id
        )
    )
    tech = result.scalar_one_or_none()
    if not tech:
        raise HTTPException(status_code=404, detail="TECHNICIAN_NOT_FOUND")

    updates = payload.model_dump(exclude_unset=True)
    phone_changed = "phone" in updates and updates["phone"] != tech.phone

    if phone_changed:
        updates["phone_verified"] = False
        updates["verified_at"] = None

    updates["updated_at"] = datetime.utcnow()
    await db.execute(
        update(Technician).where(Technician.id == tech_id).values(**updates)
    )
    await db.commit()

    if phone_changed:
        client_result = await db.execute(
            select(Client).where(Client.id == client_id)
        )
        client = client_result.scalar_one()
        await db.refresh(tech)
        try:
            await send_verification_sms(tech, client)
            await db.execute(
                update(Technician)
                .where(Technician.id == tech.id)
                .values(phone_verified=True, verified_at=datetime.utcnow())
            )
            await db.commit()
        except Exception as e:
            print(f"[WARNING] Re-verification SMS failed: {e}")

    await db.refresh(tech)
    return TechnicianResponse.model_validate(tech)


@router.delete("/clients/{client_id}/technicians/{tech_id}")
async def delete_technician(
    client_id: str,
    tech_id: str,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Technician).where(
            Technician.id == tech_id, Technician.client_id == client_id
        )
    )
    tech = result.scalar_one_or_none()
    if not tech:
        raise HTTPException(status_code=404, detail="TECHNICIAN_NOT_FOUND")

    # If on-call, clear on-call status first
    if tech.on_call:
        await db.execute(
            update(Technician)
            .where(Technician.id == tech_id)
            .values(on_call=False)
        )

    await db.execute(
        update(Technician)
        .where(Technician.id == tech_id)
        .values(is_active=False, updated_at=datetime.utcnow())
    )
    await db.commit()

    await write_audit_log(
        db,
        "tech.deactivated",
        "admin",
        resource_type="technician",
        resource_id=tech.id,
        client_id=tech.client_id,
        metadata={"tech_id": str(tech.id), "tech_name": tech.name},
    )
    return {"status": "deactivated"}
