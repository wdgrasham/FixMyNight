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


def _format_caller_phone_section(caller_phone: str) -> str:
    """Format the caller's phone as individual digits for prompt injection."""
    digits = caller_phone.lstrip("+1") if caller_phone.startswith("+1") else caller_phone.lstrip("+")
    if len(digits) == 10:
        g1 = " ".join(digits[:3])
        g2 = " ".join(digits[3:6])
        g3 = " ".join(digits[6:])
        display_phone = f"{g1}, {g2}, {g3}"
    else:
        display_phone = " ".join(digits)
    return f"\n\n---\n\nCALLER PHONE NUMBER:\nThe caller's phone number is {display_phone}. Use this when confirming their callback number."

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
        caller_phone = body.get("message", {}).get("call", {}).get("customer", {}).get("number")
        client = await get_client_by_vapi_phone(phone_number_id, db)
        if not client:
            logger.warning("No client found for phoneNumberId=%s", phone_number_id)
            return {"error": "Client not found"}
        time_window = get_time_window(client)
        first_message = build_first_message(client, time_window)

        # Business hours: minimal prompt, no transfers, quick message only
        if time_window == "business_hours":
            from ..services.prompt_builder import build_business_hours_prompt
            prompt = build_business_hours_prompt(client)
            if caller_phone:
                prompt += _format_caller_phone_section(caller_phone)
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
                    },
                    "firstMessage": first_message,
                    "firstMessageMode": "assistant-speaks-first",
                    "endCallFunctionEnabled": True,
                    "endCallMessage": None,
                    "endCallPhrases": ["Have a great day", "Have a good day"],
                    "silenceTimeoutSeconds": 30,
                },
            }
            print(f"[VAPI] assistant-request: client={client.business_name}, tw={time_window}, caller={caller_phone}", file=sys.stderr, flush=True)
            return response

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
        # No transfers during sleep window or when no tech is on-call
        transfer_dest = on_call_tech.phone if on_call_tech and time_window != "sleep" else None
        prompt = build_sarah_prompt(client, time_window, has_on_call_tech=bool(transfer_dest))

        # Inject caller's phone number
        if caller_phone:
            prompt += _format_caller_phone_section(caller_phone)

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
                "silenceTimeoutSeconds": 30,
            },
        }
        print(f"[VAPI] assistant-request: client={client.business_name}, tw={time_window}, transfer_dest={transfer_dest}, caller={caller_phone}", file=sys.stderr, flush=True)
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

        # Vapi cost from costBreakdown.total (USD)
        cost_breakdown = call_data.get("costBreakdown", {})
        vapi_cost = cost_breakdown.get("total") if cost_breakdown else None

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

        # Check if a Call record already exists (e.g. from transfer handler).
        # If so, we UPDATE it with duration/recording/transcript instead of skipping.
        existing_result = await db.execute(
            select(Call).where(Call.vapi_call_id == vapi_call_id)
        )
        existing_call = existing_result.scalar_one_or_none()

        # Skip very short calls with no transcript (phantom/test calls)
        # — but only if there's no existing record to enrich
        if not existing_call and (not transcript or len(transcript.strip()) < 20):
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

        # Override call_type for business-hours calls (not wrong_number/hangup)
        if time_window == "business_hours" and call_type not in ("wrong_number", "hangup"):
            call_type = "business_hours_missed"

        # All emergencies are flagged urgent regardless of time window
        flagged_urgent = call_type == "emergency" or is_emergency
        requires_callback = call_type in ("emergency", "routine", "business_hours_missed") and not is_transfer

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

        if existing_call:
            # UPDATE existing record (created by transfer handler) with data
            # it didn't have: duration, recording, transcript analysis results
            existing_call.call_started_at = call_started_at
            existing_call.call_ended_at = call_ended_at
            existing_call.duration_seconds = duration_seconds
            existing_call.recording_url = recording_url
            existing_call.vapi_cost = vapi_cost
            existing_call.caller_name = extracted.get("caller_name") or existing_call.caller_name
            existing_call.caller_phone = caller_phone_final or existing_call.caller_phone
            existing_call.issue_summary = extracted.get("issue_summary") or existing_call.issue_summary
            existing_call.call_type = call_type if call_type != "unknown" else existing_call.call_type
            existing_call.is_emergency = is_emergency or existing_call.is_emergency
            existing_call.flagged_urgent = flagged_urgent or existing_call.flagged_urgent
            existing_call.fee_approved = extracted.get("fee_approved") if extracted.get("fee_approved") is not None else existing_call.fee_approved
            # Transfer success from ended_reason is more accurate than the
            # optimistic True set by handle_transfer at transfer time
            if ended_reason:
                existing_call.transfer_success = is_transfer
            if not is_transfer and existing_call.transfer_attempted:
                existing_call.requires_callback = True
            await db.commit()
            print(
                f"[VAPI] end-of-call-report: UPDATED existing call {vapi_call_id} with "
                f"duration={duration_seconds}, recording={'yes' if recording_url else 'no'}, "
                f"type={call_type}, transfer_success={is_transfer}",
                file=sys.stderr, flush=True,
            )
        else:
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
                vapi_cost=vapi_cost,
            )

        await write_audit_log(
            db,
            "call.logged" if not existing_call else "call.enriched",
            "system",
            client_id=client.id,
            metadata={
                "call_id": vapi_call_id,
                "source": "end-of-call-report",
                "updated_existing": bool(existing_call),
                "is_emergency": is_emergency,
                "call_type": call_type,
                "time_window": time_window,
                "ended_reason": ended_reason,
            },
        )

        # --- SMS notifications ---

        # Detect failed emergency transfer: emergency call where dispatch was
        # available but the transfer didn't go through (tech didn't answer).
        transfer_should_have_happened = (
            (call_type == "emergency" or is_emergency)
            and client.emergency_enabled
            and time_window not in ("sleep",)
            and not (time_window == "business_hours" and not client.business_hours_emergency_dispatch)
        )
        failed_emergency_transfer = transfer_should_have_happened and not is_transfer

        if failed_emergency_transfer:
            # Look up on-call tech name for the alert message
            tech_result = await db.execute(
                select(Technician).where(
                    Technician.client_id == client.id,
                    Technician.on_call == True,
                    Technician.is_active == True,
                )
            )
            tech = tech_result.scalar_one_or_none()
            tech_name = tech.name if tech else "on-call tech"

            alert_msg = (
                f"EMERGENCY transfer to {tech_name} failed for {client.business_name}. "
                f"Caller: {extracted.get('caller_name', 'Unknown')} {caller_phone_final} — "
                f"{extracted.get('issue_summary', 'No details')}. "
                f"Please call back {caller_phone_final} ASAP."
            )
            # Send to all fallback SMS numbers
            fallback_numbers = client.admin_sms_numbers
            if isinstance(fallback_numbers, str):
                fallback_numbers = json.loads(fallback_numbers)
            for number in (fallback_numbers or []):
                await send_sms(number, alert_msg, from_number=client.twilio_number)

            print(
                f"[VAPI] failed emergency transfer: sent SMS alert to {len(fallback_numbers or [])} numbers",
                file=sys.stderr, flush=True,
            )

        if time_window == "business_hours" and not is_transfer and not failed_emergency_transfer:
            if call_type not in ("wrong_number", "hangup"):
                label = "URGENT — " if is_emergency else ""
                notify_phones = client.missed_call_notify_phones
                if isinstance(notify_phones, str):
                    notify_phones = json.loads(notify_phones)
                if not notify_phones:
                    notify_phones = [client.owner_phone]
                msg = (
                    f"{label}Missed call for {client.business_name}: "
                    f"{extracted.get('caller_name', 'Unknown')} {caller_phone_final} — "
                    f"{extracted.get('issue_summary', 'No details')}"
                )
                for number in notify_phones:
                    await send_sms(number, msg, from_number=client.twilio_number)

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

    # Return transfer destination FIRST — before any DB write.
    # Must include full transferPlan so warm transfer + voicemail detection
    # + fallbackPlan message all work correctly.
    transfer_failure_msg = (
        "I wasn't able to reach our on-call technician right now. "
        "I've sent an urgent alert to the team with your information "
        "and someone will call you back as soon as possible. "
        "Have a good night."
    )
    transfer_response = {
        "destination": {
            "type": "number",
            "number": tech.phone,
            "callerId": client.twilio_number,
            "message": "Connecting you with our on-call technician now. Please hold.",
            "transferPlan": {
                "mode": "warm-transfer-experimental",
                "summaryPlan": {
                    "enabled": True,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Summarize the transfer outcome in one sentence. "
                                "State clearly whether the transfer SUCCEEDED or FAILED "
                                "and the reason (e.g. 'no answer', 'voicemail', 'declined')."
                            ),
                        },
                    ],
                },
                "fallbackPlan": {
                    "message": transfer_failure_msg,
                    "endCallEnabled": True,
                },
                "transferAssistant": {
                    "firstMessage": (
                        "Hi, this is the after-hours answering service. "
                        "I have an emergency caller on the line. "
                        "Are you available to take this call?"
                    ),
                    "firstMessageMode": "assistant-waits-for-user",
                    "maxDurationSeconds": 30,
                    "silenceTimeoutSeconds": 10,
                    "model": {
                        "provider": "openai",
                        "model": "gpt-4o-mini",
                        "messages": [{
                            "role": "system",
                            "content": (
                                "You are a transfer assistant for an emergency dispatch service. "
                                "Your ONLY job is to determine if a REAL PERSON answered the phone.\n\n"
                                "LISTEN FIRST. Wait for the other end to speak before you say anything.\n\n"
                                "VOICEMAIL DETECTION — call transferCancel IMMEDIATELY if you hear ANY of these:\n"
                                "- 'Please leave a message'\n"
                                "- 'The person you are trying to reach'\n"
                                "- 'is not available'\n"
                                "- 'at the tone' or 'after the beep'\n"
                                "- 'voicemail' or 'mailbox'\n"
                                "- 'press' followed by a number (IVR menu)\n"
                                "- A long beep or tone\n"
                                "- Music or a pre-recorded greeting\n"
                                "- 'The number you have dialed'\n"
                                "- 'Please try again later'\n"
                                "- Any carrier or automated system message\n\n"
                                "REAL PERSON DETECTION:\n"
                                "- A real person will say something short like 'Hello', 'Yeah', 'This is [name]', 'Who is this?'\n"
                                "- When you hear a real person, speak your firstMessage and ask if they are available\n"
                                "- ONLY call transferSuccessful if they clearly confirm availability\n"
                                "- If they decline — call transferCancel\n\n"
                                "WHEN IN DOUBT — call transferCancel. A missed transfer can be retried. "
                                "A caller stuck on a voicemail box cannot.\n\n"
                                "Keep the interaction under 15 seconds. Be direct. No small talk."
                            ),
                        }],
                        "temperature": 0.1,
                    },
                },
            },
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
    vapi_cost=None,
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
        vapi_cost=vapi_cost,
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
        "IMPORTANT CLASSIFICATION RULES:\n"
        "- Do NOT reclassify calls based on whether the topic seems related to the business's industry. "
        "Contractors receive calls from suppliers, inspectors, insurance companies, and other businesses — "
        "these are all legitimate calls.\n"
        '- Only classify as "wrong_number" if the caller explicitly said they have the wrong number '
        "or asked for a completely different business by name.\n"
        '- Only classify as "hangup" if there was no real conversation (silence, immediate disconnect).\n'
        "- If the caller left any kind of message, classify as \"message\".\n"
        "- Your job is to extract and summarize, not to judge relevance.\n\n"
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
