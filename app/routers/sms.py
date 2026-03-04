"""Twilio SMS webhook handler.

Processes on-call management commands from technicians:
- ON: Go on-call (bumps existing on-call tech)
- OFF: Go off-call
- STATUS: Reply with current on-call status

Unknown senders are silently ignored (Architecture Rule 9).
"""

import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from twilio.request_validator import RequestValidator

from ..database import get_db
from ..models import Client, Technician
from ..services.twilio_service import send_sms
from ..utils.audit import write_audit_log

router = APIRouter(prefix="/api/v1/webhooks", tags=["sms"])


async def _get_client_by_twilio_number(twilio_number: str, db) -> Client:
    result = await db.execute(
        select(Client).where(
            Client.twilio_number == twilio_number,
            Client.status == "active",
        )
    )
    return result.scalar_one_or_none()


@router.post("/twilio-sms")
async def twilio_sms(request: Request, db: AsyncSession = Depends(get_db)):
    # Validate Twilio request signature
    validator = RequestValidator(os.environ["TWILIO_AUTH_TOKEN"])
    form_data = await request.form()
    signature = request.headers.get("X-Twilio-Signature", "")
    if not validator.validate(str(request.url), dict(form_data), signature):
        raise HTTPException(status_code=401, detail="INVALID_TWILIO_SIGNATURE")

    from_number = form_data.get("From")
    to_number = form_data.get("To")
    body = form_data.get("Body", "").strip().upper()

    client = await _get_client_by_twilio_number(to_number, db)
    if not client:
        return Response(content="", media_type="application/xml")

    result = await db.execute(
        select(Technician).where(
            Technician.phone == from_number,
            Technician.client_id == client.id,
            Technician.is_active == True,
            Technician.phone_verified == True,
        )
    )
    tech = result.scalar_one_or_none()

    # Unknown or unverified sender — silent ignore per Architecture Rule 9
    if not tech:
        return Response(content="", media_type="application/xml")

    if body == "ON":
        await _handle_on_call_on(tech, client, db)
    elif body == "OFF":
        await _handle_on_call_off(tech, client, db)
    elif body == "STATUS":
        await _handle_status_request(tech, client, db)
    # All other messages: silent ignore

    return Response(content="", media_type="application/xml")


async def _handle_on_call_on(tech, client, db):
    """Set tech on-call. Bump existing on-call tech if any."""
    result = await db.execute(
        select(Technician).where(
            Technician.client_id == client.id,
            Technician.on_call == True,
            Technician.id != tech.id,
        )
    )
    current_oncall = result.scalar_one_or_none()

    if current_oncall:
        # Bump — do NOT set on_call_end on bumped tech (intentional per spec)
        await db.execute(
            update(Technician)
            .where(Technician.id == current_oncall.id)
            .values(on_call=False)
        )
        await send_sms(
            current_oncall.phone,
            f"You are no longer on-call for {client.business_name}. "
            f"{tech.name} has taken over.",
            from_number=client.twilio_number,
        )
        await write_audit_log(
            db,
            "tech.bumped",
            "system",
            client_id=client.id,
            metadata={
                "bumped_tech_id": str(current_oncall.id),
                "new_tech_id": str(tech.id),
            },
        )

    await db.execute(
        update(Technician)
        .where(Technician.id == tech.id)
        .values(on_call=True, on_call_start=datetime.utcnow())
    )
    await db.commit()
    await send_sms(
        client.owner_phone,
        f"{tech.name} is now on-call for {client.business_name}.",
        from_number=client.twilio_number,
    )
    await write_audit_log(
        db,
        "tech.on_call_start",
        "technician",
        actor_id=str(tech.id),
        resource_type="technician",
        resource_id=tech.id,
        client_id=client.id,
        metadata={
            "tech_id": str(tech.id),
            "tech_name": tech.name,
            "bumped_tech_id": (
                str(current_oncall.id) if current_oncall else None
            ),
        },
    )


async def _handle_on_call_off(tech, client, db):
    """Set tech off-call manually."""
    await db.execute(
        update(Technician)
        .where(Technician.id == tech.id)
        .values(on_call=False, on_call_end=datetime.utcnow())
    )
    await db.commit()
    await send_sms(
        client.owner_phone,
        f"{tech.name} is no longer on-call for {client.business_name}.",
        from_number=client.twilio_number,
    )
    await write_audit_log(
        db,
        "tech.on_call_end",
        "technician",
        actor_id=str(tech.id),
        resource_type="technician",
        resource_id=tech.id,
        client_id=client.id,
        metadata={
            "tech_id": str(tech.id),
            "tech_name": tech.name,
            "reason": "manual_off",
        },
    )


async def _handle_status_request(tech, client, db):
    """Reply with current on-call status."""
    result = await db.execute(
        select(Technician).where(
            Technician.client_id == client.id,
            Technician.on_call == True,
        )
    )
    oncall_tech = result.scalar_one_or_none()
    if oncall_tech:
        msg = f"{client.business_name} on-call status: {oncall_tech.name} is currently on-call."
    else:
        msg = f"{client.business_name} on-call status: No technician is currently on-call."
    await send_sms(tech.phone, msg, from_number=client.twilio_number)
