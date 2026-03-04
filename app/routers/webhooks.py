"""Vapi webhook handler.

Handles two event types:
- assistant-request: fires at call start, returns dynamic prompt for current time window
- function-call: fires when agent invokes transferCall or logCall

CRITICAL: Transfer response is returned BEFORE any DB write (Architecture Rule 4).
"""

import os
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import Client, Technician, Call
from ..services.time_window import get_time_window
from ..services.prompt_builder import build_sarah_prompt
from ..services.twilio_service import send_sms
from ..utils.audit import write_audit_log
from ..limiter import limiter

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


async def get_client_by_vapi_phone(vapi_phone_number_id: str, db) -> Client:
    """Look up client by Vapi's internal phone number ID."""
    result = await db.execute(
        select(Client).where(
            Client.vapi_phone_number_id == vapi_phone_number_id,
            Client.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def get_client_by_twilio_number(twilio_number: str, db) -> Client:
    """Look up client by E.164 Twilio number."""
    result = await db.execute(
        select(Client).where(
            Client.twilio_number == twilio_number,
            Client.status == "active",
        )
    )
    return result.scalar_one_or_none()


@router.post("/vapi-intake")
@limiter.limit("60/minute")
async def vapi_intake(request: Request, db: AsyncSession = Depends(get_db)):
    secret = request.headers.get("X-Vapi-Secret")
    if secret != os.environ["VAPI_WEBHOOK_SECRET"]:
        raise HTTPException(status_code=401, detail="INVALID_WEBHOOK_SECRET")

    body = await request.json()
    message_type = body.get("message", {}).get("type")

    # --- assistant-request: fires at call start ---
    if message_type == "assistant-request":
        phone_number_id = (
            body.get("message", {}).get("call", {}).get("phoneNumberId")
        )
        client = await get_client_by_vapi_phone(phone_number_id, db)
        if not client:
            return {"error": "Client not found"}
        time_window = get_time_window(client)
        prompt = build_sarah_prompt(client, time_window)
        return {
            "assistantId": client.vapi_assistant_id,
            "assistantOverrides": {
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "systemPrompt": prompt,
                    "temperature": 0.3,
                }
            },
        }

    # --- function-call: agent invokes transferCall or logCall ---
    function_name = (
        body.get("message", {}).get("functionCall", {}).get("name")
    )
    parameters = (
        body.get("message", {}).get("functionCall", {}).get("parameters", {})
    )
    vapi_call_id = body.get("message", {}).get("call", {}).get("id")
    caller_phone = (
        body.get("message", {})
        .get("call", {})
        .get("customer", {})
        .get("number")
    )
    phone_number_id = (
        body.get("message", {}).get("call", {}).get("phoneNumberId")
    )

    client = await get_client_by_vapi_phone(phone_number_id, db)
    if not client:
        return {"result": "Client not found"}

    # Idempotency check
    idempotency_key = f"{vapi_call_id}:{function_name}"
    existing = await db.execute(
        select(Call).where(Call.idempotency_key == idempotency_key)
    )
    if existing.scalar_one_or_none():
        return {"result": "Already processed"}

    if function_name == "transferCall":
        return await handle_transfer(
            client, parameters, vapi_call_id, caller_phone, db
        )
    elif function_name == "logCall":
        return await handle_log_call(
            client, parameters, vapi_call_id, caller_phone, db
        )
    else:
        return {"result": "Unknown function"}


async def handle_transfer(client, params, vapi_call_id, caller_phone, db):
    """Handle transferCall. CRITICAL: return transfer destination BEFORE DB write."""
    time_window = get_time_window(client)

    result = await db.execute(
        select(Technician).where(
            Technician.client_id == client.id,
            Technician.on_call == True,
            Technician.phone_verified == True,
            Technician.is_active == True,
        )
    )
    tech = result.scalar_one_or_none()

    if not tech:
        await _trigger_fallback_sms(client, params, caller_phone)
        await _log_call_record(
            db,
            client,
            params,
            vapi_call_id,
            caller_phone,
            time_window=time_window,
            transfer_attempted=True,
            transfer_success=False,
        )
        await write_audit_log(
            db,
            "call.transfer_failed",
            "system",
            client_id=client.id,
            metadata={
                "reason": "no_verified_oncall_tech",
                "call_id": vapi_call_id,
                "fallback_triggered": True,
            },
        )
        return {
            "result": "No on-call technician available. Emergency team has been alerted."
        }

    # Return transfer destination FIRST — before any DB write
    transfer_response = {
        "destination": {
            "type": "phoneNumber",
            "phoneNumber": tech.phone,
            "callerId": client.twilio_number,
            "message": "Connecting you with our on-call technician now. Please hold.",
        }
    }

    # DB write after transfer instruction — failure here must not affect the transfer
    try:
        await _log_call_record(
            db,
            client,
            params,
            vapi_call_id,
            caller_phone,
            time_window=time_window,
            transfer_attempted=True,
            transfer_success=True,
            transferred_to_phone=tech.phone,
            transferred_to_tech_id=tech.id,
            requires_callback=False,
        )
        await write_audit_log(
            db,
            "call.transfer_attempted",
            "vapi",
            client_id=client.id,
            metadata={
                "tech_id": str(tech.id),
                "tech_phone": tech.phone,
                "call_id": vapi_call_id,
            },
        )
    except Exception as e:
        print(f"[ERROR] DB write failed after transfer: {e}")

    return transfer_response


async def handle_log_call(client, params, vapi_call_id, caller_phone, db):
    """Handle logCall — log call for morning summary."""
    time_window = get_time_window(client)
    is_emergency = params.get("is_emergency", False)
    call_type = params.get("call_type", "unknown")
    flagged_urgent = (time_window == "sleep" and is_emergency) or (
        time_window == "business_hours"
        and is_emergency
        and not client.business_hours_emergency_dispatch
    )
    # Messages, wrong numbers, and hangups don't need a callback
    requires_callback = call_type in ("emergency", "routine")

    await _log_call_record(
        db,
        client,
        params,
        vapi_call_id,
        caller_phone,
        time_window=time_window,
        flagged_urgent=flagged_urgent,
        requires_callback=requires_callback,
    )
    await write_audit_log(
        db,
        "call.logged",
        "system",
        client_id=client.id,
        metadata={
            "call_id": vapi_call_id,
            "is_emergency": is_emergency,
            "time_window": time_window,
        },
    )

    # Business hours: immediate SMS to contractor
    if time_window == "business_hours":
        label = "URGENT — " if is_emergency else ""
        await send_sms(
            client.owner_phone,
            f"{label}Missed call for {client.business_name}: "
            f"{params.get('caller_name', 'Unknown')} {caller_phone} — "
            f"{params.get('issue_summary', 'No details')}",
            from_number=client.twilio_number,
        )

    # Sleep window emergency: SMS owner
    if time_window == "sleep" and is_emergency:
        await send_sms(
            client.owner_phone,
            f"URGENT overnight call for {client.business_name}: "
            f"{params.get('caller_name', 'Unknown')} {caller_phone} — "
            f"{params.get('issue_summary', 'No details')} "
            f"[Sleep window — no transfer attempted]",
            from_number=client.twilio_number,
        )

    return {"result": "Call logged successfully"}


async def _log_call_record(
    db,
    client,
    params,
    vapi_call_id,
    caller_phone,
    time_window,
    transfer_attempted=False,
    transfer_success=None,
    transferred_to_phone=None,
    transferred_to_tech_id=None,
    flagged_urgent=False,
    requires_callback=True,
):
    """Create a Call record with all fields properly populated."""
    is_emergency = params.get("is_emergency", False)
    call_type = params.get("call_type", "unknown")

    # Determine fee fields from client config + call context
    fee_offered = (
        client.emergency_fee is not None
        and is_emergency
        and time_window == "evening"
    )
    fee_amount = client.emergency_fee if fee_offered else None
    fee_approved = params.get("fee_approved") if fee_offered else None

    call = Call(
        client_id=client.id,
        created_at=datetime.utcnow(),
        caller_phone=caller_phone,
        caller_name=params.get("caller_name"),
        issue_summary=params.get("issue_summary"),
        is_emergency=is_emergency,
        time_window=time_window,
        call_type=call_type,
        fee_offered=fee_offered,
        fee_amount=fee_amount,
        fee_approved=fee_approved,
        transfer_attempted=transfer_attempted,
        transfer_success=transfer_success,
        transferred_to_phone=transferred_to_phone,
        transferred_to_tech_id=transferred_to_tech_id,
        vapi_call_id=vapi_call_id,
        idempotency_key=f"{vapi_call_id}:{'transferCall' if transfer_attempted else 'logCall'}",
        flagged_urgent=flagged_urgent,
        requires_callback=requires_callback,
    )
    db.add(call)
    await db.commit()
    return call


async def _trigger_fallback_sms(client, params, caller_phone):
    """Send emergency alert SMS to all numbers in admin_sms_numbers."""
    numbers = client.admin_sms_numbers
    if isinstance(numbers, str):
        numbers = json.loads(numbers)
    msg = (
        f"EMERGENCY for {client.business_name}: "
        f"{params.get('caller_name', 'Unknown')} {caller_phone} — "
        f"{params.get('issue_summary', 'No details')}"
    )
    for number in numbers:
        await send_sms(number, msg, from_number=client.twilio_number)
