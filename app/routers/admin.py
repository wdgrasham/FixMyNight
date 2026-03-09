import os
from datetime import datetime, time as dt_time, timedelta
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
from ..services.email_service import send_summary_email
from ..services.service_monitor import get_all_service_status
from ..auth import create_magic_link_token

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

VAPI_REBUILD_TRIGGERS = {
    "emergency_fee",
    "emergency_enabled",
    "callback_expected_time",
    "business_hours_start",
    "business_hours_end",
    "business_days",
    "business_hours_schedule",
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
    client_ids = [c.id for c in clients]

    # Fetch on-call tech names
    on_call_result = await db.execute(
        select(Technician.client_id, Technician.name).where(
            Technician.client_id.in_(client_ids),
            Technician.on_call == True,
            Technician.is_active == True,
        )
    )
    on_call_map = {row.client_id: row.name for row in on_call_result}

    # Fetch 7-day and 24h call counts
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    calls_7d_result = await db.execute(
        select(Call.client_id, func.count()).where(
            Call.client_id.in_(client_ids),
            Call.created_at >= seven_days_ago,
        ).group_by(Call.client_id)
    )
    calls_7d_map = {row[0]: row[1] for row in calls_7d_result}

    twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
    calls_24h_result = await db.execute(
        select(Call.client_id, func.count()).where(
            Call.client_id.in_(client_ids),
            Call.created_at >= twenty_four_hours_ago,
        ).group_by(Call.client_id)
    )
    calls_24h_map = {row[0]: row[1] for row in calls_24h_result}

    # Fetch month-to-date Vapi cost per client
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cost_mtd_result = await db.execute(
        select(Call.client_id, func.sum(Call.vapi_cost)).where(
            Call.client_id.in_(client_ids),
            Call.created_at >= month_start,
            Call.vapi_cost.isnot(None),
        ).group_by(Call.client_id)
    )
    cost_mtd_map = {row[0]: float(row[1]) for row in cost_mtd_result}

    # Fetch month-to-date call counts per client (for usage tracking)
    calls_mtd_result = await db.execute(
        select(Call.client_id, func.count()).where(
            Call.client_id.in_(client_ids),
            Call.created_at >= month_start,
        ).group_by(Call.client_id)
    )
    calls_mtd_map = {row[0]: row[1] for row in calls_mtd_result}

    response = []
    for c in clients:
        data = ClientResponse.model_validate(c).model_dump()
        data["on_call_tech"] = on_call_map.get(c.id)
        data["calls_7d"] = calls_7d_map.get(c.id, 0)
        data["calls_24h"] = calls_24h_map.get(c.id, 0)
        data["cost_mtd"] = round(cost_mtd_map.get(c.id, 0), 2)
        data["calls_mtd"] = calls_mtd_map.get(c.id, 0)
        data["plan_call_limit"] = c.plan_call_limit
        data["subscription_tier"] = c.subscription_tier
        response.append(data)
    return response


@router.get("/clients/{client_id}/cost-stats")
async def get_client_cost_stats(
    client_id: str,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return call count, total minutes, and total Vapi cost for current and previous month."""
    now = datetime.utcnow()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if current_month_start.month == 1:
        prev_month_start = current_month_start.replace(year=current_month_start.year - 1, month=12)
    else:
        prev_month_start = current_month_start.replace(month=current_month_start.month - 1)

    async def _stats_for_range(start, end):
        result = await db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(Call.duration_seconds), 0),
                func.coalesce(func.sum(Call.vapi_cost), 0),
            ).where(
                Call.client_id == client_id,
                Call.created_at >= start,
                Call.created_at < end,
            )
        )
        row = result.one()
        return {
            "total_calls": row[0],
            "total_minutes": round(float(row[1]) / 60, 1),
            "total_cost": round(float(row[2]), 2),
        }

    current = await _stats_for_range(current_month_start, now)
    previous = await _stats_for_range(prev_month_start, current_month_start)

    return {
        "current_month": {
            "label": now.strftime("%B %Y"),
            **current,
        },
        "previous_month": {
            "label": prev_month_start.strftime("%B %Y"),
            **previous,
        },
    }


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

    # Auto-set plan_call_limit when subscription_tier changes
    TIER_CALL_LIMITS = {"starter": 40, "standard": 100, "pro": 250}
    if "subscription_tier" in updated_fields:
        new_tier = updated_fields["subscription_tier"]
        updated_fields["plan_call_limit"] = TIER_CALL_LIMITS.get(new_tier)

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

    # If status changed from pending_setup to active, send portal magic link
    was_pending = client.status == "pending_setup"
    now_active = updated_fields.get("status") == "active"
    if was_pending and now_active and client.contact_email:
        try:
            token = create_magic_link_token(str(client.id))
            frontend_url = os.environ.get("FRONTEND_URL", "https://fixmyday.ai")
            link = f"{frontend_url}/fixmynight/portal/setup?token={token}"
            await send_summary_email(
                client.contact_email,
                f"Your FixMyNight Portal Is Ready — {client.business_name}",
                f"Hi {client.owner_name},\n\n"
                f"Great news! Your FixMyNight after-hours line is set up and ready to go.\n\n"
                f"Click the link below to set your portal password and log in:\n"
                f"{link}\n\n"
                f"Your after-hours number: {client.twilio_number}\n\n"
                f"Forward your business line to this number when you close for the day, "
                f"and our AI agent will handle everything from there.\n\n"
                f"— The FixMyNight Team",
            )
            print(f"[ADMIN] Portal invite sent to {client.contact_email} for client {client_id}")
        except Exception as e:
            print(f"[WARNING] Portal invite email failed: {e}")

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
    call_type: Optional[str] = None,
):
    query = select(Call).where(Call.client_id == client_id)
    count_query = select(func.count()).select_from(Call).where(Call.client_id == client_id)

    if date_from:
        query = query.where(Call.created_at >= date_from)
        count_query = count_query.where(Call.created_at >= date_from)
    if date_to:
        query = query.where(Call.created_at <= date_to)
        count_query = count_query.where(Call.created_at <= date_to)
    if call_type:
        query = query.where(Call.call_type == call_type)
        count_query = count_query.where(Call.call_type == call_type)

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

    # Check for existing inactive tech with the same phone — reactivate instead of duplicating
    existing = await db.execute(
        select(Technician).where(
            Technician.client_id == client_id,
            Technician.phone == payload.phone,
            Technician.is_active == False,
        )
    )
    inactive_tech = existing.scalar_one_or_none()
    if inactive_tech:
        await db.execute(
            update(Technician)
            .where(Technician.id == inactive_tech.id)
            .values(
                is_active=True,
                name=payload.name,
                updated_at=datetime.utcnow(),
            )
        )
        await db.commit()
        await db.refresh(inactive_tech)
        await write_audit_log(
            db,
            "tech.reactivated",
            "admin",
            resource_type="technician",
            resource_id=inactive_tech.id,
            client_id=client.id,
            metadata={"tech_id": str(inactive_tech.id), "tech_name": payload.name, "via": "add_duplicate"},
        )
        return TechnicianResponse.model_validate(inactive_tech)

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

    # Send verification SMS (tech stays unverified until they reply)
    try:
        await send_verification_sms(tech, client)
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


@router.post(
    "/clients/{client_id}/technicians/{tech_id}/reactivate",
    response_model=TechnicianResponse,
)
async def reactivate_technician(
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
    if tech.is_active:
        raise HTTPException(status_code=400, detail="TECHNICIAN_ALREADY_ACTIVE")

    await db.execute(
        update(Technician)
        .where(Technician.id == tech_id)
        .values(is_active=True, updated_at=datetime.utcnow())
    )
    await db.commit()
    await db.refresh(tech)

    await write_audit_log(
        db,
        "tech.reactivated",
        "admin",
        resource_type="technician",
        resource_id=tech.id,
        client_id=tech.client_id,
        metadata={"tech_id": str(tech.id), "tech_name": tech.name},
    )
    return TechnicianResponse.model_validate(tech)


@router.get("/service-status")
async def service_status(
    admin=Depends(require_admin),
    refresh: bool = Query(False),
):
    """Return health and billing status for all external services."""
    return await get_all_service_status(force_refresh=refresh)


@router.get("/fallback-status")
async def fallback_status(
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return the current Vapi fallback assistant configuration."""
    from ..models import SystemSetting
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "vapi_fallback_assistant_id")
    )
    setting = result.scalar_one_or_none()
    fallback_id = setting.value if setting else None

    # Check which clients have phone numbers
    clients_result = await db.execute(
        select(Client.id, Client.business_name, Client.vapi_phone_number_id).where(
            Client.vapi_phone_number_id.isnot(None),
            Client.status == "active",
        )
    )
    phones = [
        {"client_id": str(r[0]), "business_name": r[1], "vapi_phone_number_id": r[2]}
        for r in clients_result
    ]

    return {
        "fallback_assistant_id": fallback_id,
        "active_phone_numbers": phones,
    }
