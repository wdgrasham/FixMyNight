from datetime import datetime, time as dt_time
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional

from ..database import get_db
from ..dependencies import require_portal
from ..models import Client, Technician, Call
from ..schemas import (
    PortalSettingsUpdate,
    ClientResponse,
    TechnicianCreate,
    TechnicianUpdate,
    TechnicianResponse,
    CallResponse,
    CallsListResponse,
    DashboardResponse,
)
from ..utils.audit import write_audit_log
from ..services.vapi import rebuild_vapi_assistant
from ..services.twilio_service import send_verification_sms

router = APIRouter(prefix="/api/v1/portal", tags=["portal"])

PORTAL_EDITABLE_FIELDS = {
    "callback_expected_time",
    "summary_send_time",
    "sleep_window_start",
    "sleep_window_end",
    "business_hours_start",
    "business_hours_end",
    "business_days",
    "business_hours_emergency_dispatch",
    "emergency_fee",
    "emergency_enabled",
    "contact_email",
    "admin_sms_numbers",
}

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

TIME_FIELDS = {
    "business_hours_start",
    "business_hours_end",
    "sleep_window_start",
    "sleep_window_end",
    "summary_send_time",
    "callback_expected_time",
}


def _parse_time(value: str) -> dt_time:
    parts = value.split(":")
    return dt_time(int(parts[0]), int(parts[1]))


@router.get("/{client_id}/dashboard", response_model=DashboardResponse)
async def dashboard(
    client_id: str,
    client: Client = Depends(require_portal),
    db: AsyncSession = Depends(get_db),
):
    # On-call tech
    tech_result = await db.execute(
        select(Technician).where(
            Technician.client_id == client_id,
            Technician.on_call == True,
            Technician.is_active == True,
        )
    )
    on_call_tech = tech_result.scalar_one_or_none()

    # Recent calls
    calls_result = await db.execute(
        select(Call)
        .where(Call.client_id == client_id)
        .order_by(Call.created_at.desc())
        .limit(10)
    )
    recent_calls = calls_result.scalars().all()

    # Total calls today
    from datetime import date
    import pytz

    tz = pytz.timezone(client.timezone)
    today_start = tz.localize(datetime.combine(date.today(), dt_time.min))
    count_result = await db.execute(
        select(func.count())
        .select_from(Call)
        .where(Call.client_id == client_id, Call.created_at >= today_start)
    )
    total_today = count_result.scalar()

    return DashboardResponse(
        business_name=client.business_name,
        on_call_tech=(
            TechnicianResponse.model_validate(on_call_tech)
            if on_call_tech
            else None
        ),
        recent_calls=[CallResponse.model_validate(c) for c in recent_calls],
        total_calls_today=total_today,
        emergency_enabled=client.emergency_enabled,
    )


@router.get("/{client_id}/calls", response_model=CallsListResponse)
async def get_calls(
    client_id: str,
    client: Client = Depends(require_portal),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    query = select(Call).where(Call.client_id == client_id)
    count_query = (
        select(func.count()).select_from(Call).where(Call.client_id == client_id)
    )

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


@router.get("/{client_id}/settings")
async def get_settings(
    client_id: str,
    client: Client = Depends(require_portal),
    db: AsyncSession = Depends(get_db),
):
    return {
        "business_name": client.business_name,
        "contact_email": client.contact_email,
        "timezone": client.timezone,
        "emergency_enabled": client.emergency_enabled,
        "emergency_fee": client.emergency_fee,
        "admin_sms_numbers": client.admin_sms_numbers,
        "business_hours_start": client.business_hours_start,
        "business_hours_end": client.business_hours_end,
        "business_days": client.business_days,
        "business_hours_emergency_dispatch": client.business_hours_emergency_dispatch,
        "sleep_window_start": client.sleep_window_start,
        "sleep_window_end": client.sleep_window_end,
        "summary_send_time": client.summary_send_time,
        "callback_expected_time": client.callback_expected_time,
        "agent_name": client.agent_name,
    }


@router.patch("/{client_id}/settings")
async def update_settings(
    client_id: str,
    payload: PortalSettingsUpdate,
    client: Client = Depends(require_portal),
    db: AsyncSession = Depends(get_db),
):
    updated_fields = payload.model_dump(exclude_unset=True)
    if not updated_fields:
        return {"status": "no_changes"}

    # Reject any fields not in PORTAL_EDITABLE_FIELDS
    disallowed = set(updated_fields.keys()) - PORTAL_EDITABLE_FIELDS
    if disallowed:
        raise HTTPException(
            status_code=400,
            detail=f"Fields not editable via portal: {', '.join(disallowed)}",
        )

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
                "portal",
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

    return {"status": "updated"}


@router.get("/{client_id}/technicians")
async def get_technicians(
    client_id: str,
    client: Client = Depends(require_portal),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Technician)
        .where(Technician.client_id == client_id, Technician.is_active == True)
        .order_by(Technician.created_at)
    )
    techs = result.scalars().all()
    return [TechnicianResponse.model_validate(t) for t in techs]


@router.post(
    "/{client_id}/technicians", response_model=TechnicianResponse
)
async def add_technician(
    client_id: str,
    payload: TechnicianCreate,
    client: Client = Depends(require_portal),
    db: AsyncSession = Depends(get_db),
):
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

    try:
        await send_verification_sms(tech, client)
    except Exception as e:
        print(f"[WARNING] Verification SMS failed: {e}")

    await write_audit_log(
        db,
        "tech.added",
        "portal",
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
    "/{client_id}/technicians/{tech_id}",
    response_model=TechnicianResponse,
)
async def update_technician(
    client_id: str,
    tech_id: str,
    payload: TechnicianUpdate,
    client: Client = Depends(require_portal),
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
        await db.refresh(tech)
        try:
            await send_verification_sms(tech, client)
        except Exception as e:
            print(f"[WARNING] Re-verification SMS failed: {e}")

    await db.refresh(tech)
    return TechnicianResponse.model_validate(tech)


@router.delete("/{client_id}/technicians/{tech_id}")
async def delete_technician(
    client_id: str,
    tech_id: str,
    client: Client = Depends(require_portal),
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
