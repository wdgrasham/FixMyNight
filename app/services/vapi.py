"""Vapi API client for assistant management and phone number provisioning."""

import httpx
import os
from sqlalchemy import select
from ..models import Client

VAPI_BASE_URL = "https://api.vapi.ai"


def _vapi_headers():
    return {"Authorization": f"Bearer {os.environ['VAPI_API_KEY']}"}


async def create_vapi_assistant(client, prompt: str) -> str:
    """Create a new Vapi assistant. Returns the assistant ID."""
    async with httpx.AsyncClient() as http:
        r = await http.post(
            f"{VAPI_BASE_URL}/assistant",
            headers=_vapi_headers(),
            json={
                "name": f"{client.agent_name} — {client.business_name}",
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "systemPrompt": prompt,
                    "temperature": 0.3,
                    "tools": [
                        {
                            "type": "function",
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
                        {
                            "type": "function",
                            "function": {
                                "name": "logCall",
                                "description": "Log call details for morning follow-up summary. Call this at the end of any call that does not result in a live transfer.",
                                "parameters": {
                                    "type": "object",
                                    "properties": {
                                        "caller_name": {
                                            "type": "string",
                                            "description": "Caller's name if provided. Optional.",
                                        },
                                        "caller_phone": {
                                            "type": "string",
                                            "description": "Caller's phone number, if available.",
                                        },
                                        "issue_summary": {
                                            "type": "string",
                                            "description": "Brief summary of the issue or reason for call. Required.",
                                        },
                                        "is_emergency": {
                                            "type": "boolean",
                                            "description": "True if the caller described an emergency situation. Required.",
                                        },
                                        "call_type": {
                                            "type": "string",
                                            "enum": [
                                                "emergency",
                                                "routine",
                                                "message",
                                                "wrong_number",
                                                "hangup",
                                                "unknown",
                                            ],
                                            "description": "Classification of the call. Required.",
                                        },
                                        "fee_approved": {
                                            "type": "boolean",
                                            "description": "Whether caller approved the emergency fee. Only include if fee was offered.",
                                        },
                                    },
                                    "required": [
                                        "issue_summary",
                                        "is_emergency",
                                        "call_type",
                                    ],
                                },
                            },
                        },
                    ],
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
                "endCallOnSilence": True,
                "backgroundDenoisingEnabled": True,
                "serverUrl": None,
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
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "systemPrompt": prompt,
                    "temperature": 0.3,
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
