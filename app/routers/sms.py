"""Twilio SMS webhook handler.

Processes on-call management commands from technicians and business owners:
- ON: Go on-call (bumps existing on-call tech)
- OFF: Go off-call
- STATUS: Reply with current on-call status

Owners can always use STATUS. Owners can use ON/OFF only when they have
no active technicians registered (single-operator mode).

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
    # Behind Railway's reverse proxy, request.url returns the internal URL.
    # Twilio signs against the public URL, so we must reconstruct it.
    validator = RequestValidator(os.environ["TWILIO_AUTH_TOKEN"])
    form_data = await request.form()
    signature = request.headers.get("X-Twilio-Signature", "")
    proto = request.headers.get("X-Forwarded-Proto", request.url.scheme)
    host = request.headers.get("X-Forwarded-Host", request.headers.get("Host", request.url.hostname))
    public_url = f"{proto}://{host}{request.url.path}"
    if not validator.validate(public_url, dict(form_data), signature):
        raise HTTPException(status_code=401, detail="INVALID_TWILIO_SIGNATURE")

    from_number = form_data.get("From")
    to_number = form_data.get("To")
    body = form_data.get("Body", "").strip().upper()

    print(f"[SMS] From={from_number} To={to_number} Body={body}", flush=True)

    client = await _get_client_by_twilio_number(to_number, db)
    if not client:
        print(f"[SMS] No client for {to_number}", flush=True)
        return Response(content="", media_type="application/xml")

    # Look up tech — include unverified techs so first reply can verify them
    result = await db.execute(
        select(Technician).where(
            Technician.phone == from_number,
            Technician.client_id == client.id,
            Technician.is_active == True,
        )
    )
    tech = result.scalar_one_or_none()

    # If no tech found, check if sender is the business owner
    is_owner = not tech and from_number == client.owner_phone
    print(f"[SMS] tech={tech is not None} is_owner={is_owner} owner_phone='{client.owner_phone}' from='{from_number}'", flush=True)

    # Unknown sender — silent ignore per Architecture Rule 9
    if not tech and not is_owner:
        print(f"[SMS] Silent ignore — unknown sender", flush=True)
        return Response(content="", media_type="application/xml")

    # Valid commands
    if body not in ("ON", "OFF", "STATUS"):
        # Unrecognized message — silent ignore
        return Response(content="", media_type="application/xml")

    # Owner (not in technicians table) handling
    if is_owner:
        if body == "STATUS":
            await _handle_owner_status(client, db)
            return Response(content="", media_type="application/xml")

        # ON/OFF: only if owner has no active technicians
        has_techs = await db.execute(
            select(Technician).where(
                Technician.client_id == client.id,
                Technician.is_active == True,
            )
        )
        if has_techs.scalars().first():
            await send_sms(
                from_number,
                "You have technicians registered. Your on-call tech "
                "can text ON to this number.",
                from_number=client.twilio_number,
            )
            return Response(content="", media_type="application/xml")

        # Single operator — auto-create tech record for owner
        tech = Technician(
            client_id=client.id,
            name=client.owner_name,
            phone=client.owner_phone,
            phone_verified=True,
            verified_at=datetime.utcnow(),
            is_active=True,
        )
        db.add(tech)
        await db.commit()
        await db.refresh(tech)
        # Fall through to normal ON/OFF handling below

    # First valid command from unverified tech → verify them
    if not tech.phone_verified:
        await db.execute(
            update(Technician)
            .where(Technician.id == tech.id)
            .values(phone_verified=True, verified_at=datetime.utcnow())
        )
        await db.commit()
        await db.refresh(tech)

    if body == "ON":
        await _handle_on_call_on(tech, client, db)
    elif body == "OFF":
        await _handle_on_call_off(tech, client, db)
    elif body == "STATUS":
        await _handle_status_request(tech, client, db)

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
    # Skip owner notification if the tech IS the owner (redundant)
    if tech.phone != client.owner_phone:
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
    # Skip owner notification if the tech IS the owner (redundant)
    if tech.phone != client.owner_phone:
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
    msg = await _build_status_message(client, db)
    await send_sms(tech.phone, msg, from_number=client.twilio_number)


async def _handle_owner_status(client, db):
    """Reply with current on-call status to the business owner."""
    msg = await _build_status_message(client, db)
    await send_sms(client.owner_phone, msg, from_number=client.twilio_number)


async def _build_status_message(client, db) -> str:
    """Build the on-call status message."""
    result = await db.execute(
        select(Technician).where(
            Technician.client_id == client.id,
            Technician.on_call == True,
        )
    )
    oncall_tech = result.scalar_one_or_none()
    if oncall_tech:
        return f"{client.business_name} on-call status: {oncall_tech.name} is currently on-call."
    return f"{client.business_name} on-call status: No technician is currently on-call."
