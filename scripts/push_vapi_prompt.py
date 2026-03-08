"""Push V1.6 prompt and tools to the existing Stellar HVAC Vapi assistant.

Usage:
    python scripts/push_vapi_prompt.py <VAPI_ASSISTANT_ID>

Requires env vars: VAPI_API_KEY

This script:
1. Generates the evening-window prompt (default/static) for Stellar HVAC
2. PATCHes the Vapi assistant with the prompt + both tool definitions
3. GETs the assistant to verify tools and prompt are set
4. Prints the assistant config for review
"""

import sys
import os
import httpx
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

VAPI_BASE_URL = "https://api.vapi.ai"

TOOL_TRANSFER_CALL = {
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
}

TOOL_LOG_CALL = {
    "type": "function",
    "function": {
        "name": "logCall",
        "description": "Log call details for the contractor's morning follow-up summary. Call this at the end of any call that does not result in a live transfer.",
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
            "required": ["issue_summary", "is_emergency", "call_type"],
        },
    },
}


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/push_vapi_prompt.py <VAPI_ASSISTANT_ID>")
        print()
        print("Requires VAPI_API_KEY env var to be set.")
        sys.exit(1)

    assistant_id = sys.argv[1]
    api_key = os.environ.get("VAPI_API_KEY")
    if not api_key:
        print("ERROR: VAPI_API_KEY environment variable not set.")
        print("Set it with: export VAPI_API_KEY=your_key_here")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {api_key}"}

    # Step 1: Generate prompt
    from datetime import time

    class StellarHVAC:
        business_name = "Stellar HVAC"
        owner_name = "Dan"
        agent_name = "Sarah"
        industry = "hvac"
        industry_config = {
            "industry_label": "HVAC",
            "emergency_examples": [
                "No heat in freezing weather",
                "No cooling in extreme heat",
                "Water leaking from HVAC unit",
                "System completely non-functional",
                "Unusual burning smell from unit",
            ],
            "routine_examples": [
                "Scheduling maintenance",
                "Requesting a quote",
                "Filter replacement question",
                "Thermostat programming help",
            ],
            "agent_name": "Sarah",
            "service_noun": "HVAC service",
            "tech_title": "technician",
        }
        emergency_enabled = True
        emergency_fee = 150.00
        callback_expected_time = time(9, 0)
        business_hours_start = time(8, 0)
        business_hours_end = time(18, 0)
        business_days = [1, 2, 3, 4, 5]
        business_hours_emergency_dispatch = True
        sleep_window_start = time(22, 0)
        sleep_window_end = time(8, 0)
        timezone = "America/Chicago"
        twilio_number = "+19796525799"

    from app.services.prompt_builder import build_sarah_prompt

    client = StellarHVAC()
    prompt = build_sarah_prompt(client, time_window="evening")

    print(f"[1/3] Generated evening-window prompt ({len(prompt)} chars)")

    # Step 2: PATCH the assistant
    print(f"[2/3] PATCHing Vapi assistant {assistant_id}...")

    patch_payload = {
        "name": "Sarah — Stellar HVAC",
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "systemPrompt": prompt,
            "temperature": 0.3,
            "tools": [TOOL_TRANSFER_CALL, TOOL_LOG_CALL],
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
        "firstMessage": None,
        "endCallMessage": None,
    }

    with httpx.Client() as http:
        r = http.patch(
            f"{VAPI_BASE_URL}/assistant/{assistant_id}",
            headers=headers,
            json=patch_payload,
            timeout=30,
        )
        if r.status_code != 200:
            print(f"ERROR: PATCH failed with status {r.status_code}")
            print(r.text)
            sys.exit(1)

        print(f"  PATCH successful (200 OK)")

    # Step 3: Verify by GET
    print(f"[3/3] Verifying assistant config...")

    with httpx.Client() as http:
        r = http.get(
            f"{VAPI_BASE_URL}/assistant/{assistant_id}",
            headers=headers,
            timeout=30,
        )
        if r.status_code != 200:
            print(f"ERROR: GET failed with status {r.status_code}")
            sys.exit(1)

        data = r.json()

    # Verify tools (Vapi stores tools inside model.tools)
    model = data.get("model", {})
    tools = model.get("tools", []) or data.get("tools", [])
    tool_names = [t.get("function", {}).get("name") for t in tools]

    checks = {
        "transferCall tool present": "transferCall" in tool_names,
        "logCall tool present": "logCall" in tool_names,
        "Model is gpt-4o": data.get("model", {}).get("model") == "gpt-4o",
        "Temperature is 0.3": data.get("model", {}).get("temperature") == 0.3,
        "Voice provider is 11labs": data.get("voice", {}).get("provider") == "11labs",
        "Prompt contains recording disclosure": "recorded for quality" in data.get("model", {}).get("systemPrompt", ""),
        "Prompt contains Stellar HVAC": "Stellar HVAC" in data.get("model", {}).get("systemPrompt", ""),
        "Prompt contains $150": "$150" in data.get("model", {}).get("systemPrompt", ""),
    }

    print()
    print("  Verification:")
    all_pass = True
    for check, result in checks.items():
        status = "PASS" if result else "FAIL"
        if not result:
            all_pass = False
        print(f"    [{status}] {check}")

    print()
    if all_pass:
        print("All checks passed! Vapi assistant is configured correctly.")
        print(f"\nAssistant ID: {assistant_id}")
        print(f"Assistant name: {data.get('name')}")
        print(f"Tools: {', '.join(tool_names)}")
    else:
        print("WARNING: Some checks failed. Review the assistant in the Vapi dashboard.")
        sys.exit(1)

    print()
    print("NEXT STEPS:")
    print(f"  1. Update Stellar HVAC client record in DB:")
    print(f"     UPDATE clients SET vapi_assistant_id = '{assistant_id}'")
    print(f"     WHERE id = '49855f38-6fa3-4202-ab19-a242028ec369';")
    print()
    print(f"  2. Set webhook URL in Vapi dashboard -> Settings -> Webhooks:")
    print(f"     URL: https://[your-railway-domain]/api/v1/webhooks/vapi-intake")
    print(f"     Secret: [same as VAPI_WEBHOOK_SECRET env var]")
    print()
    print(f"  3. Place a test call to verify the agent answers correctly.")


if __name__ == "__main__":
    main()
