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
    OnCallTechSummary,
    SettingsSummary,
    Stats7d,
    UsageStatus,
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
    "business_hours_schedule",
    "business_hours_emergency_dispatch",
    "emergency_fee",
    "emergency_enabled",
    "contact_email",
    "admin_sms_numbers",
    "daytime_enabled",
    "missed_call_notify_phones",
}

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
    "industry",
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
    from datetime import date, timedelta

    # On-call tech
    tech_result = await db.execute(
        select(Technician).where(
            Technician.client_id == client_id,
            Technician.on_call == True,
            Technician.is_active == True,
        )
    )
    on_call_tech = tech_result.scalar_one_or_none()
    on_call_summary = None
    if on_call_tech:
        since_str = on_call_tech.on_call_start.isoformat() if on_call_tech.on_call_start else None
        on_call_summary = OnCallTechSummary(name=on_call_tech.name, since=since_str)

    # Recent calls
    calls_result = await db.execute(
        select(Call)
        .where(Call.client_id == client_id)
        .order_by(Call.created_at.desc())
        .limit(10)
    )
    recent_calls = calls_result.scalars().all()

    # 7-day stats
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    stats_result = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Call.call_type == "emergency").label("emergencies"),
            func.count().filter(Call.transfer_success == True).label("transfers"),
            func.count().filter(Call.transfer_attempted == True).label("transfer_attempts"),
        )
        .select_from(Call)
        .where(Call.client_id == client_id, Call.created_at >= seven_days_ago)
    )
    row = stats_result.one()
    total_calls = row.total or 0
    emergencies = row.emergencies or 0
    transfers_completed = row.transfers or 0
    transfer_attempts = row.transfer_attempts or 0
    transfer_success_rate = (
        (transfers_completed / transfer_attempts * 100) if transfer_attempts > 0 else 0.0
    )

    # Settings summary
    def _time_str(t):
        return t.strftime("%H:%M") if t else None

    settings_summary = SettingsSummary(
        summary_send_time=_time_str(client.summary_send_time),
        callback_expected_time=_time_str(client.callback_expected_time),
        emergency_enabled=client.emergency_enabled,
        emergency_fee=client.emergency_fee,
        sleep_window_start=_time_str(client.sleep_window_start),
        sleep_window_end=_time_str(client.sleep_window_end),
    )

    # Usage status (if client has a plan with call limit)
    usage_status = None
    if client.plan_call_limit and client.stripe_subscription_id:
        usage_status = await _get_usage_status(client, db)

    return DashboardResponse(
        on_call_tech=on_call_summary,
        twilio_number=client.twilio_number,
        recent_calls=[CallResponse.model_validate(c) for c in recent_calls],
        settings_summary=settings_summary,
        stats_7d=Stats7d(
            total_calls=total_calls,
            emergencies=emergencies,
            transfers_completed=transfers_completed,
            transfer_success_rate=round(transfer_success_rate, 1),
        ),
        usage_status=usage_status,
    )


async def _get_usage_status(client, db: AsyncSession) -> UsageStatus:
    """Calculate current billing period usage for a client."""
    import asyncio
    import stripe
    import os

    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

    try:
        def _get_period():
            sub = stripe.Subscription.retrieve(client.stripe_subscription_id)
            return (
                datetime.utcfromtimestamp(sub["current_period_start"]),
                datetime.utcfromtimestamp(sub["current_period_end"]),
            )

        period_start, period_end = await asyncio.to_thread(_get_period)
    except Exception:
        # Fallback: use current calendar month
        period_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = datetime.utcnow()

    call_count_result = await db.execute(
        select(func.count())
        .select_from(Call)
        .where(
            Call.client_id == client.id,
            Call.created_at >= period_start,
            Call.created_at < period_end,
        )
    )
    calls_used = call_count_result.scalar() or 0
    calls_included = client.plan_call_limit or 0
    overage = max(0, calls_used - calls_included)
    pct = (calls_used / calls_included * 100) if calls_included > 0 else 0

    return UsageStatus(
        calls_used=calls_used,
        calls_included=calls_included,
        overage_calls=overage,
        usage_percent=round(pct, 1),
        subscription_tier=client.subscription_tier,
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
    call_type: Optional[str] = None,
):
    query = select(Call).where(Call.client_id == client_id)
    count_query = (
        select(func.count()).select_from(Call).where(Call.client_id == client_id)
    )

    if date_from:
        from_dt = datetime.strptime(date_from, "%Y-%m-%d")
        query = query.where(Call.created_at >= from_dt)
        count_query = count_query.where(Call.created_at >= from_dt)
    if date_to:
        # End-of-day so calls on date_to are included
        to_dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        query = query.where(Call.created_at <= to_dt)
        count_query = count_query.where(Call.created_at <= to_dt)
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
        "industry": client.industry,
        "business_hours_schedule": client.business_hours_schedule,
        "daytime_enabled": client.daytime_enabled,
        "missed_call_notify_phones": client.missed_call_notify_phones,
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
        "portal",
        resource_type="technician",
        resource_id=tech.id,
        client_id=tech.client_id,
        metadata={"tech_id": str(tech.id), "tech_name": tech.name},
    )
    return {"status": "deactivated"}
