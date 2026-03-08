"""Vapi webhook handler.

Handles these event types:
- assistant-request: fires at call start, returns dynamic prompt for current time window
- transfer-destination-request: fires when AI triggers transferCall, returns on-call tech number
- end-of-call-report: fires after every call ends, logs call data from transcript analysis
- tool-calls / function-call: legacy handler for logCall (no longer invoked by Sarah)

CRITICAL: Transfer response is returned BEFORE any DB write (Architecture Rule 4).
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

from ..database import get_db
from ..models import Client, Technician, Call
from ..services.time_window import get_time_window
from ..services.prompt_builder import build_sarah_prompt, build_first_message
from ..services.vapi import _get_vapi_tools
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
    # Validate webhook secret. Phone-number-level webhooks don't send a secret,
    # so we accept missing headers but reject incorrect ones.
    secret = request.headers.get("X-Vapi-Secret")
    if secret is not None and secret != os.environ["VAPI_WEBHOOK_SECRET"]:
        raise HTTPException(status_code=401, detail="INVALID_WEBHOOK_SECRET")

    body = await request.json()
    message_type = body.get("message", {}).get("type")

    # Log EVERY webhook type for debugging
    print(f"[VAPI] type={message_type}", file=sys.stderr, flush=True)
    if message_type and "transfer" in str(message_type).lower():
        print(f"[VAPI] TRANSFER EVENT: {json.dumps(body)[:2000]}", file=sys.stderr, flush=True)

    # --- assistant-request: fires at call start ---
    if message_type == "assistant-request":
        phone_number_id = (
            body.get("message", {}).get("call", {}).get("phoneNumberId")
        )
        client = await get_client_by_vapi_phone(phone_number_id, db)
        if not client:
            logger.warning("No client found for phoneNumberId=%s", phone_number_id)
            return {"error": "Client not found"}
        time_window = get_time_window(client)
        prompt = build_sarah_prompt(client, time_window)
        first_message = build_first_message(client)

        # Look up on-call tech for dynamic transfer destination
        tech_result = await db.execute(
            select(Technician).where(
                Technician.client_id == client.id,
                Technician.on_call == True,
                Technician.phone_verified == True,
                Technician.is_active == True,
            )
        )
        on_call_tech = tech_result.scalar_one_or_none()
        transfer_dest = on_call_tech.phone if on_call_tech else None

        response = {
            "assistantId": client.vapi_assistant_id,
            "assistantOverrides": {
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "system", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "tools": _get_vapi_tools(transfer_destination=transfer_dest),
                },
                "firstMessage": first_message,
                "firstMessageMode": "assistant-speaks-first",
                "endCallFunctionEnabled": True,
                "endCallMessage": None,
                "endCallPhrases": ["Have a good night", "Goodnight"],
                "silenceTimeoutSeconds": 10,
            },
        }
        print(f"[VAPI] assistant-request: client={client.business_name}, tw={time_window}, transfer_dest={transfer_dest}", file=sys.stderr, flush=True)
        return response

    # --- transfer-destination-request: AI triggered transferCall, Vapi asks where to send it ---
    if message_type == "transfer-destination-request":
        msg = body.get("message", {})
        vapi_call_id = msg.get("call", {}).get("id")
        caller_phone = msg.get("call", {}).get("customer", {}).get("number")
        phone_number_id = msg.get("call", {}).get("phoneNumberId")

        client = await get_client_by_vapi_phone(phone_number_id, db)
        if not client:
            logger.warning("transfer-destination-request: no client for phoneNumberId=%s", phone_number_id)
            return {"error": "Client not found"}

        resp = await handle_transfer(client, {}, vapi_call_id, caller_phone, db)
        print(f"[VAPI] transfer-destination-request: response={resp}", flush=True)
        return resp

    # --- tool-calls / function-call: agent invokes logCall ---
    if message_type in ("tool-calls", "function-call"):
        msg = body.get("message", {})

        # Vapi sends toolCallList with {id, type, function: {name, arguments}} per tool call
        tool_calls = msg.get("toolCallList", [])

        # Fallback: legacy functionCall format (single call)
        if not tool_calls:
            legacy_fc = msg.get("functionCall", {})
            if legacy_fc.get("name"):
                tool_calls = [{
                    "id": msg.get("toolCallId", "unknown"),
                    "name": legacy_fc.get("name"),
                    "parameters": legacy_fc.get("parameters", {}),
                }]

        if not tool_calls:
            return {"results": []}

        vapi_call_id = msg.get("call", {}).get("id")
        caller_phone = msg.get("call", {}).get("customer", {}).get("number")
        phone_number_id = msg.get("call", {}).get("phoneNumberId")

        client = await get_client_by_vapi_phone(phone_number_id, db)
        if not client:
            results = [{"toolCallId": tc.get("id", ""), "name": tc.get("name", ""), "result": "Client not found"} for tc in tool_calls]
            return {"results": results}

        results = []
        for tc in tool_calls:
            tool_call_id = tc.get("id", "")
            # OpenAI format: name/arguments nested under "function"
            func_block = tc.get("function", {})
            function_name = func_block.get("name") or tc.get("name", "")
            parameters = func_block.get("arguments") or tc.get("parameters", {})
            if isinstance(parameters, str):
                import json as _json
                try:
                    parameters = _json.loads(parameters)
                except Exception:
                    parameters = {}

            # Skip endCall — Vapi handles it internally
            if function_name == "endCall":
                results.append({"toolCallId": tool_call_id, "name": function_name, "result": "ok"})
                continue

            # Idempotency check
            idempotency_key = f"{vapi_call_id}:{function_name}"
            existing = await db.execute(
                select(Call).where(Call.idempotency_key == idempotency_key)
            )
            if existing.scalar_one_or_none():
                results.append({"toolCallId": tool_call_id, "name": function_name, "result": "Already processed"})
                continue

            if function_name == "logCall":
                resp = await handle_log_call(
                    client, parameters, vapi_call_id, caller_phone, db
                )
                results.append({"toolCallId": tool_call_id, "name": function_name, "result": resp.get("result", "")})
            else:
                logger.warning("Unknown tool function: %s", function_name)
                results.append({"toolCallId": tool_call_id, "name": function_name, "result": "Unknown function"})
        return {"results": results}

    # --- end-of-call-report: fires after every call ends, used for call logging ---
    if message_type == "end-of-call-report":
        msg = body.get("message", {})
        call_data = msg.get("call", {})
        artifact = msg.get("artifact", {})
        vapi_call_id = call_data.get("id")
        caller_phone = call_data.get("customer", {}).get("number")
        phone_number_id = call_data.get("phoneNumberId")
        ended_reason = msg.get("endedReason", call_data.get("endedReason", ""))
        transcript = artifact.get("transcript", "")
        recording_url = artifact.get("recordingUrl") or call_data.get("recordingUrl") or msg.get("recordingUrl")

        # Call timing from Vapi
        started_at_str = call_data.get("startedAt")
        ended_at_str = call_data.get("endedAt")
        call_started_at = _parse_iso(started_at_str)
        call_ended_at = _parse_iso(ended_at_str)
        duration_seconds = None
        cost_duration = msg.get("duration") or call_data.get("duration")
        if cost_duration is not None:
            try:
                duration_seconds = int(float(cost_duration))
            except (ValueError, TypeError):
                pass
        if duration_seconds is None and call_started_at and call_ended_at:
            duration_seconds = int((call_ended_at - call_started_at).total_seconds())

        # Debug: log timing fields to diagnose duration=None
        print(
            f"[VAPI] timing: startedAt={started_at_str}, endedAt={ended_at_str}, "
            f"msg.duration={msg.get('duration')}, call.duration={call_data.get('duration')}, "
            f"computed={duration_seconds}",
            file=sys.stderr, flush=True,
        )

        client = await get_client_by_vapi_phone(phone_number_id, db) if phone_number_id else None
        if not client:
            logger.warning("end-of-call-report: no client for phoneNumberId=%s", phone_number_id)
            return {"ok": True}

        # Skip if a Call record already exists for this vapi_call_id (e.g. from transfer handler)
        existing = await db.execute(
            select(Call).where(Call.vapi_call_id == vapi_call_id)
        )
        if existing.scalar_one_or_none():
            print(f"[VAPI] end-of-call-report: skipping, call already logged for {vapi_call_id}", file=sys.stderr, flush=True)
            return {"ok": True}

        # Skip very short calls with no transcript (phantom/test calls)
        if not transcript or len(transcript.strip()) < 20:
            print(f"[VAPI] end-of-call-report: skipping, no transcript for {vapi_call_id}", file=sys.stderr, flush=True)
            return {"ok": True}

        # Use GPT-4o-mini to analyze transcript and extract structured call data
        try:
            extracted = await _analyze_transcript(transcript, client)
        except Exception as e:
            logger.error("Transcript analysis failed: %s", e)
            extracted = {
                "caller_name": None,
                "caller_phone": None,
                "issue_summary": "Call transcript analysis failed",
                "call_type": "unknown",
                "is_emergency": False,
                "fee_approved": None,
            }

        # Use caller_phone from extracted data if available, fall back to Vapi metadata
        extracted_phone = extracted.get("caller_phone")
        if extracted_phone and len(_digits_only(extracted_phone)) >= 10:
            caller_phone_final = extracted_phone
        else:
            caller_phone_final = caller_phone

        is_transfer = ended_reason == "assistant-forwarded-call"
        is_emergency = extracted.get("is_emergency", False)
        call_type = extracted.get("call_type", "unknown")
        time_window = get_time_window(client)

        # All emergencies are flagged urgent regardless of time window
        flagged_urgent = call_type == "emergency" or is_emergency
        requires_callback = call_type in ("emergency", "routine") and not is_transfer

        # Look up on-call tech for transfer metadata
        transferred_to_phone = None
        transferred_to_tech_id = None
        if is_transfer:
            tech_result = await db.execute(
                select(Technician).where(
                    Technician.client_id == client.id,
                    Technician.on_call == True,
                    Technician.is_active == True,
                )
            )
            tech = tech_result.scalar_one_or_none()
            if tech:
                transferred_to_phone = tech.phone
                transferred_to_tech_id = tech.id

        await _log_call_record(
            db,
            client,
            extracted,
            vapi_call_id,
            caller_phone_final,
            time_window=time_window,
            transfer_attempted=is_transfer,
            transfer_success=is_transfer,
            transferred_to_phone=transferred_to_phone,
            transferred_to_tech_id=transferred_to_tech_id,
            flagged_urgent=flagged_urgent,
            requires_callback=requires_callback,
            call_started_at=call_started_at,
            call_ended_at=call_ended_at,
            duration_seconds=duration_seconds,
            recording_url=recording_url,
        )
        await write_audit_log(
            db,
            "call.logged",
            "system",
            client_id=client.id,
            metadata={
                "call_id": vapi_call_id,
                "source": "end-of-call-report",
                "is_emergency": is_emergency,
                "call_type": call_type,
                "time_window": time_window,
                "ended_reason": ended_reason,
            },
        )

        # SMS notifications
        if time_window == "business_hours" and not is_transfer:
            label = "URGENT — " if is_emergency else ""
            await send_sms(
                client.owner_phone,
                f"{label}Missed call for {client.business_name}: "
                f"{extracted.get('caller_name', 'Unknown')} {caller_phone_final} — "
                f"{extracted.get('issue_summary', 'No details')}",
                from_number=client.twilio_number,
            )

        if time_window == "sleep" and is_emergency:
            await send_sms(
                client.owner_phone,
                f"URGENT overnight call for {client.business_name}: "
                f"{extracted.get('caller_name', 'Unknown')} {caller_phone_final} — "
                f"{extracted.get('issue_summary', 'No details')} "
                f"[Sleep window — no transfer attempted]",
                from_number=client.twilio_number,
            )

        print(
            f"[VAPI] end-of-call-report: logged call {vapi_call_id}, "
            f"type={call_type}, emergency={is_emergency}, transfer={is_transfer}",
            file=sys.stderr, flush=True,
        )
        return {"ok": True}

    # All other event types (speech-update, transcript, status-update, etc.)
    return {"ok": True}


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
            "type": "number",
            "number": tech.phone,
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
        logger.error("DB write failed after transfer: %s", e)

    return transfer_response


def _parse_iso(s):
    """Parse an ISO 8601 timestamp string to a timezone-aware datetime, or None."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, AttributeError):
        return None


def _digits_only(phone: str) -> str:
    """Extract only digits from a phone string."""
    import re
    return re.sub(r"\D", "", phone or "")


async def handle_log_call(client, params, vapi_call_id, caller_phone, db):
    """Handle logCall — log call for morning summary."""
    # Flag incomplete phone numbers
    param_phone = params.get("caller_phone", "")
    digits = _digits_only(param_phone or caller_phone or "")
    if param_phone and len(digits) < 10:
        summary = params.get("issue_summary", "")
        if "(phone number may be incomplete)" not in summary:
            params["issue_summary"] = f"{summary} (phone number may be incomplete)"

    time_window = get_time_window(client)
    is_emergency = params.get("is_emergency", False)
    call_type = params.get("call_type", "unknown")
    # All emergencies are flagged urgent regardless of time window
    flagged_urgent = call_type == "emergency" or is_emergency
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
    call_started_at=None,
    call_ended_at=None,
    duration_seconds=None,
    recording_url=None,
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
        idempotency_key=f"{vapi_call_id}:{'transferCall' if transfer_attempted else 'end-of-call-report'}",
        call_started_at=call_started_at,
        call_ended_at=call_ended_at,
        duration_seconds=duration_seconds,
        recording_url=recording_url,
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


async def _analyze_transcript(transcript: str, client) -> dict:
    """Use Claude Haiku to extract structured call data from a transcript.

    Returns dict with: caller_name, caller_phone, issue_summary, call_type,
    is_emergency, fee_approved.
    """
    import httpx as _httpx

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set, cannot analyze transcript")
        return {
            "caller_name": None, "caller_phone": None,
            "issue_summary": "Transcript analysis unavailable",
            "call_type": "unknown", "is_emergency": False, "fee_approved": None,
        }

    system_prompt = (
        "You analyze call transcripts for an after-hours answering service. "
        "Extract the following fields from the transcript. Return ONLY valid JSON, no markdown.\n\n"
        "Fields:\n"
        '- "caller_name": string or null (the caller\'s name if they gave it)\n'
        '- "caller_phone": string or null (phone number the caller provided verbally, in E.164 format like +1XXXXXXXXXX)\n'
        '- "issue_summary": string (1-2 sentence summary of why they called)\n'
        '- "call_type": one of "emergency", "routine", "message", "wrong_number", "hangup", "unknown"\n'
        '- "is_emergency": boolean (true if the caller described an emergency or urgent situation)\n'
        '- "fee_approved": boolean or null (true if they approved an emergency fee, false if declined, null if no fee was discussed)\n'
    )

    async with _httpx.AsyncClient() as http:
        r = await http.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "system": system_prompt,
                "messages": [
                    {"role": "user", "content": f"Transcript:\n{transcript}"},
                ],
            },
            timeout=15,
        )
        r.raise_for_status()
        content = r.json()["content"][0]["text"]

    # Parse JSON from response (strip markdown fences if present)
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(content)
