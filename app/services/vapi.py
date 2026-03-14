"""Vapi API client for assistant management and phone number provisioning."""

import httpx
import os
from sqlalchemy import select, text
from ..models import Client, SystemSetting

VAPI_BASE_URL = "https://api.vapi.ai"

# ---------------------------------------------------------------------------
# Generic fallback assistant — used when the assistant-request webhook fails
# (e.g. Railway outage). No transfers, no client-specific data.
# ---------------------------------------------------------------------------

FALLBACK_FIRST_MESSAGE = (
    "Thank you for calling. This is Sarah, your after-hours answering service. "
    "This call may be recorded for quality purposes. "
    "How can I help you tonight?"
)

FALLBACK_SYSTEM_PROMPT = """You are Sarah, an after-hours AI answering service assistant.

YOUR ROLE:
You answer after-hours calls professionally. You collect caller information and ensure their message reaches the business team. You do NOT transfer calls, dispatch technicians, or diagnose issues.

---

OPENING:
Your first message (already spoken by the system) asks the caller how you can help. Listen to their response and follow the appropriate flow below.

---

EMERGENCY FLOW:
If the caller describes an emergency, says they need someone tonight, or expresses urgency:
"I understand this is urgent. I've noted this as an emergency and our team will be notified right away. Dispatch fees may apply for after-hours emergency service."

Collect: name, callback number, brief description of the issue.
Read back their number to confirm.

"I've flagged this as urgent and our team will reach out to you as soon as possible. Have a good night."

Do NOT attempt any call transfers.

---

NON-EMERGENCY / MESSAGE FLOW:
If the caller has a routine matter or wants to leave a message:
"Of course, go ahead — I'm listening."

Let the caller speak freely. Do NOT interrupt them.

When they're done:
"Got it. Let me just get your name and a callback number so we can reach you."

Collect: name, callback number.
Read back their number to confirm.

"I'll make sure the team gets your message first thing in the morning. Have a good night."

---

WRONG NUMBER:
"I'm sorry, it looks like you may have the wrong number. This is an after-hours answering service. I hope you find who you're looking for. Goodnight."

---

RETURN CALL HANDLING:
If the caller says they got a missed call from this number:
"This is an after-hours answering service. If someone from the team called you, they'll be available during business hours. Would you like to leave a message?"
Then follow the message flow.

---

SILENCE / NO RESPONSE:
If the caller goes silent after the greeting:
"Are you still there?"
Wait 5 seconds. If still silent:
"It seems like we got disconnected. If you need help, please call us back. Goodnight."

---

PHONE NUMBER VERIFICATION:
After the caller gives you a phone number, always read back the exact digits to confirm.
"I have your number as 7 1 3, 8 5 5, 0 4 4 7 — is that correct?"

If the number doesn't sound complete:
"Could you repeat the full 10-digit number for me?"

---

ENDING THE CALL:
Every closing message ends with "Have a good night" or "Goodnight." The system will automatically end the call when you say those words.

Rules:
- Say your closing message with NO filler.
- Do NOT pause or wait after your closing line.
- Do NOT say anything after "Have a good night" or "Goodnight."
- Never add follow-up questions after a closing.

---

WHAT YOU NEVER DO:
- Never attempt to transfer calls
- Never mention specific technician names or phone numbers
- Never diagnose problems
- Never promise arrival times or specific technicians
- Never engage in topics unrelated to the service call
- Never use DTMF prompts ("Press 1 for...")
- Never skip collecting caller name and phone number
- Never reveal that you are an AI unless directly and sincerely asked""".strip()


def _get_vapi_tools(transfer_destination: str = None):
    """Build tool definitions for Vapi assistant.

    transferCall: built-in Vapi tool type with warm-transfer-experimental mode.
    Uses a transferAssistant to dial the tech, detect voicemail, and return to
    Sarah if the tech doesn't answer. Destinations set dynamically at call start.

    Call logging is handled server-side via the end-of-call-report webhook,
    so Sarah has no logCall tool and never pauses mid-conversation to log.
    """
    # Failure message spoken to caller when transfer doesn't go through.
    # Must end with an endCallPhrases trigger ("Have a good night").
    transfer_failure_msg = (
        "I wasn't able to reach our on-call technician right now. "
        "I've sent an urgent alert to the team with your information "
        "and someone will call you back as soon as possible. "
        "Have a good night."
    )

    # Set destination dynamically if an on-call tech phone is provided
    destinations = []
    if transfer_destination:
        destinations = [{
            "type": "number",
            "number": transfer_destination,
            "transferPlan": {
                "mode": "warm-transfer-experimental",
                "message": "Connecting you with our on-call technician now. Please hold.",
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
                                "- ONLY call transferSuccessful if they clearly confirm availability (e.g. 'yes', 'sure', 'go ahead', 'put them through')\n"
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
        }]

    tools = []

    # Only include transferCall when there's an on-call tech to transfer to.
    # When no tech is on-call, the LLM has no transfer tool and will follow
    # the prompt's fallback script (flag as urgent, promise morning callback).
    if destinations:
        tools.append({
            "type": "transferCall",
            "destinations": destinations,
            "messages": [
                {
                    "type": "request-start",
                    "content": "I'm connecting you with our on-call technician now. Please hold for just a moment.",
                },
                {
                    "type": "request-failed",
                    "content": transfer_failure_msg,
                    "endCallAfterSpokenEnabled": True,
                },
            ],
            "function": {
                "name": "transferCall",
                "description": "Transfer the caller to the on-call technician for emergency dispatch. Only call this after confirming it is an emergency and, if applicable, the caller has approved the emergency fee.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "caller_name": {
                            "type": "string",
                            "description": "Caller's name if provided. Optional.",
                        },
                        "caller_phone": {
                            "type": "string",
                            "description": "Caller's phone number in E.164 format. Required.",
                        },
                        "issue_summary": {
                            "type": "string",
                            "description": "Brief summary of the issue in 1-2 sentences. Required.",
                        },
                    },
                    "required": ["caller_phone", "issue_summary"],
                },
            },
        })

    return tools


# Backward-compatible alias for imports
VAPI_TOOLS = None  # Use _get_vapi_tools() instead


def _vapi_headers():
    return {"Authorization": f"Bearer {os.environ['VAPI_API_KEY']}"}


def _build_first_message(client) -> str:
    """Build the greeting message for the assistant."""
    from .prompt_builder import build_first_message
    return build_first_message(client)


async def create_vapi_assistant(client, prompt: str) -> str:
    """Create a new Vapi assistant. Returns the assistant ID."""
    async with httpx.AsyncClient() as http:
        r = await http.post(
            f"{VAPI_BASE_URL}/assistant",
            headers=_vapi_headers(),
            json={
                "name": f"{client.agent_name} — {client.business_name}",
                "firstMessage": _build_first_message(client),
                "firstMessageMode": "assistant-speaks-first",
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "system", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "tools": _get_vapi_tools(),
                },
                "voice": {
                    "provider": "11labs",
                    "voiceId": "sarah",
                    "stability": 0.5,
                    "similarityBoost": 0.75,
                },
                "transcriber": {
                    "provider": "deepgram",
                    "model": "nova-2",
                    "language": "en-US",
                },
                "maxDurationSeconds": 600,
                "silenceTimeoutSeconds": 30,
                "endCallFunctionEnabled": True,
                "backgroundDenoisingEnabled": True,
                "serverUrl": os.environ.get("VAPI_SERVER_URL", ""),
                "serverUrlSecret": os.environ.get("VAPI_WEBHOOK_SECRET", ""),
            },
        )
        r.raise_for_status()
        return r.json()["id"]


async def rebuild_vapi_assistant(client_id: str, db):
    """Rebuild the Vapi assistant prompt. Uses 'evening' as default since the
    assistant-request webhook dynamically selects the correct variant per call."""
    from .prompt_builder import build_sarah_prompt

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one()
    prompt = build_sarah_prompt(client, time_window="evening")
    async with httpx.AsyncClient() as http:
        r = await http.patch(
            f"{VAPI_BASE_URL}/assistant/{client.vapi_assistant_id}",
            headers=_vapi_headers(),
            json={
                "firstMessage": _build_first_message(client),
                "firstMessageMode": "assistant-speaks-first",
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "system", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "tools": _get_vapi_tools(),
                }
            },
        )
        r.raise_for_status()


async def import_twilio_number_to_vapi(
    twilio_number: str, assistant_id: str
) -> str:
    """Import a Twilio number into Vapi and link to webhook. Returns vapi phone number ID.

    We do NOT set assistantId on the phone number — doing so prevents Vapi
    from sending the assistant-request webhook, which we need for dynamic
    prompt building (time windows, on-call tech, business name, etc.).
    The serverUrl handles all calls via assistant-request.
    """
    async with httpx.AsyncClient() as http:
        r = await http.post(
            f"{VAPI_BASE_URL}/phone-number",
            headers=_vapi_headers(),
            json={
                "provider": "twilio",
                "number": twilio_number,
                "twilioAccountSid": os.environ["TWILIO_ACCOUNT_SID"],
                "twilioAuthToken": os.environ["TWILIO_AUTH_TOKEN"],
                "serverUrl": os.environ.get("VAPI_SERVER_URL", ""),
            },
        )
        r.raise_for_status()
        return r.json()["id"]


async def delete_vapi_assistant(assistant_id: str):
    """Delete a Vapi assistant."""
    async with httpx.AsyncClient() as http:
        await http.delete(
            f"{VAPI_BASE_URL}/assistant/{assistant_id}",
            headers=_vapi_headers(),
        )


# ---------------------------------------------------------------------------
# Fallback assistant lifecycle
# ---------------------------------------------------------------------------


async def create_fallback_assistant() -> str:
    """Create the generic fallback assistant in Vapi. Returns assistant ID."""
    async with httpx.AsyncClient() as http:
        r = await http.post(
            f"{VAPI_BASE_URL}/assistant",
            headers=_vapi_headers(),
            json={
                "name": "Sarah — Fallback (Generic)",
                "firstMessage": FALLBACK_FIRST_MESSAGE,
                "firstMessageMode": "assistant-speaks-first",
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "system", "content": FALLBACK_SYSTEM_PROMPT},
                    ],
                    "temperature": 0.3,
                },
                "voice": {
                    "provider": "11labs",
                    "voiceId": "sarah",
                    "stability": 0.5,
                    "similarityBoost": 0.75,
                },
                "transcriber": {
                    "provider": "deepgram",
                    "model": "nova-2",
                    "language": "en-US",
                },
                "maxDurationSeconds": 600,
                "silenceTimeoutSeconds": 30,
                "endCallFunctionEnabled": True,
                "endCallPhrases": ["Have a good night", "Goodnight"],
                "backgroundDenoisingEnabled": True,
                "serverUrl": os.environ.get("VAPI_SERVER_URL", ""),
                "serverUrlSecret": os.environ.get("VAPI_WEBHOOK_SECRET", ""),
            },
        )
        r.raise_for_status()
        return r.json()["id"]


async def _update_fallback_assistant(assistant_id: str):
    """Sync the fallback assistant's prompt (keeps it up-to-date on redeploys)."""
    async with httpx.AsyncClient() as http:
        r = await http.patch(
            f"{VAPI_BASE_URL}/assistant/{assistant_id}",
            headers=_vapi_headers(),
            json={
                "name": "Sarah — Fallback (Generic)",
                "firstMessage": FALLBACK_FIRST_MESSAGE,
                "firstMessageMode": "assistant-speaks-first",
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "system", "content": FALLBACK_SYSTEM_PROMPT},
                    ],
                    "temperature": 0.3,
                },
                "endCallPhrases": ["Have a good night", "Goodnight"],
            },
        )
        r.raise_for_status()


async def update_phone_number_fallback(vapi_phone_number_id: str, fallback_assistant_id: str):
    """Set a Vapi phone number's assistantId to the fallback assistant.

    When our serverUrl webhook works, it returns dynamic config (overrides this).
    When the webhook fails, Vapi falls back to this assistantId.
    """
    async with httpx.AsyncClient() as http:
        r = await http.patch(
            f"{VAPI_BASE_URL}/phone-number/{vapi_phone_number_id}",
            headers=_vapi_headers(),
            json={
                "assistantId": fallback_assistant_id,
            },
        )
        r.raise_for_status()


async def ensure_fallback_assistant(db) -> str:
    """Ensure the fallback assistant exists and is up-to-date. Returns its ID.

    Checks system_settings for an existing ID. If not found, creates one.
    Always syncs the prompt so code changes propagate on next deploy.
    """
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "vapi_fallback_assistant_id")
    )
    setting = result.scalar_one_or_none()

    if setting and setting.value:
        try:
            await _update_fallback_assistant(setting.value)
            print(f"[VAPI] Fallback assistant synced: {setting.value}")
        except Exception as e:
            print(f"[WARNING] Failed to sync fallback assistant: {e}")
        return setting.value

    # Create new fallback assistant
    assistant_id = await create_fallback_assistant()
    await db.execute(text(
        "INSERT INTO system_settings (key, value) VALUES (:key, :value) "
        "ON CONFLICT (key) DO UPDATE SET value = :value"
    ), {"key": "vapi_fallback_assistant_id", "value": assistant_id})
    await db.commit()
    print(f"[VAPI] Fallback assistant created: {assistant_id}")
    return assistant_id
