"""Vapi API client for assistant management and phone number provisioning."""

import httpx
import os
from sqlalchemy import select
from ..models import Client

VAPI_BASE_URL = "https://api.vapi.ai"


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

    return [
        {
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
        },
    ]


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
    """Import a Twilio number into Vapi and link to assistant. Returns vapi phone number ID."""
    async with httpx.AsyncClient() as http:
        r = await http.post(
            f"{VAPI_BASE_URL}/phone-number",
            headers=_vapi_headers(),
            json={
                "provider": "twilio",
                "number": twilio_number,
                "twilioAccountSid": os.environ["TWILIO_ACCOUNT_SID"],
                "twilioAuthToken": os.environ["TWILIO_AUTH_TOKEN"],
                "assistantId": assistant_id,
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
