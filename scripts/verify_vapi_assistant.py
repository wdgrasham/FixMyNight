"""Verify an existing Vapi assistant has the correct config.

Usage:
    python scripts/verify_vapi_assistant.py <VAPI_ASSISTANT_ID>

Requires env var: VAPI_API_KEY

Checks:
- Model is gpt-4o with temperature 0.3
- Voice is ElevenLabs
- Both tools (transferCall, logCall) present with correct parameters
- Prompt contains key elements (recording disclosure, business name, fee, etc.)
"""

import sys
import os
import httpx
import json

VAPI_BASE_URL = "https://api.vapi.ai"


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/verify_vapi_assistant.py <VAPI_ASSISTANT_ID>")
        sys.exit(1)

    assistant_id = sys.argv[1]
    api_key = os.environ.get("VAPI_API_KEY")
    if not api_key:
        print("ERROR: VAPI_API_KEY environment variable not set.")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {api_key}"}

    with httpx.Client() as http:
        r = http.get(
            f"{VAPI_BASE_URL}/assistant/{assistant_id}",
            headers=headers,
            timeout=30,
        )
        if r.status_code != 200:
            print(f"ERROR: GET failed with status {r.status_code}")
            print(r.text)
            sys.exit(1)

        data = r.json()

    print(f"Assistant: {data.get('name', 'unnamed')}")
    print(f"ID: {assistant_id}")
    print()

    # Model checks
    model = data.get("model", {})
    prompt = model.get("systemPrompt", "")

    # Tools (Vapi stores tools inside model.tools)
    tools = model.get("tools", []) or data.get("tools", [])
    tool_map = {}
    for t in tools:
        fn = t.get("function", {})
        tool_map[fn.get("name")] = fn

    transfer_tool = tool_map.get("transferCall")
    log_tool = tool_map.get("logCall")

    checks = []

    # Model
    checks.append(("Model provider", model.get("provider") == "openai", model.get("provider")))
    checks.append(("Model is gpt-4o", model.get("model") == "gpt-4o", model.get("model")))
    checks.append(("Temperature is 0.3", model.get("temperature") == 0.3, model.get("temperature")))

    # Voice
    voice = data.get("voice", {})
    checks.append(("Voice provider is 11labs", voice.get("provider") == "11labs", voice.get("provider")))

    # Transcriber
    transcriber = data.get("transcriber", {})
    checks.append(("Transcriber is deepgram", transcriber.get("provider") == "deepgram", transcriber.get("provider")))

    # Tools
    checks.append(("transferCall tool present", transfer_tool is not None, "present" if transfer_tool else "MISSING"))
    checks.append(("logCall tool present", log_tool is not None, "present" if log_tool else "MISSING"))

    if transfer_tool:
        req = transfer_tool.get("parameters", {}).get("required", [])
        checks.append(("transferCall requires caller_phone", "caller_phone" in req, req))
        checks.append(("transferCall requires issue_summary", "issue_summary" in req, req))

    if log_tool:
        req = log_tool.get("parameters", {}).get("required", [])
        checks.append(("logCall requires issue_summary", "issue_summary" in req, req))
        checks.append(("logCall requires is_emergency", "is_emergency" in req, req))
        checks.append(("logCall requires call_type", "call_type" in req, req))
        # Check call_type enum
        ct_prop = log_tool.get("parameters", {}).get("properties", {}).get("call_type", {})
        enum_vals = set(ct_prop.get("enum", []))
        expected = {"emergency", "routine", "message", "wrong_number", "hangup", "unknown"}
        checks.append(("logCall call_type has all 6 enum values", enum_vals == expected, enum_vals))

    # Prompt content
    checks.append(("Prompt: recording disclosure", "recorded for quality" in prompt, ""))
    checks.append(("Prompt: greeting with business name", "Thank you for calling" in prompt, ""))
    checks.append(("Prompt: intent question", "calling about service" in prompt, ""))
    checks.append(("Prompt: message flow", "make sure they get your message" in prompt, ""))
    checks.append(("Prompt: wrong number", "No problem. Have a good night" in prompt, ""))
    checks.append(("Prompt: silence/hangup", "Are you still there" in prompt, ""))
    checks.append(("Prompt: emergency disclaimer", "unsafe" in prompt, ""))
    checks.append(("Prompt: no DTMF", "DTMF" in prompt, ""))
    checks.append(("Prompt: return call handling", "missed call from this number" in prompt, ""))

    # Print results
    passed = 0
    failed = 0
    for label, result, detail in checks:
        status = "PASS" if result else "FAIL"
        if result:
            passed += 1
        else:
            failed += 1
        extra = f" ({detail})" if detail and not result else ""
        print(f"  [{status}] {label}{extra}")

    print()
    print(f"Results: {passed} passed, {failed} failed out of {len(checks)} checks")

    if failed == 0:
        print("\nVapi assistant is fully configured and spec-compliant!")
    else:
        print("\nWARNING: Some checks failed. Run push_vapi_prompt.py to fix.")

    # Print prompt length
    print(f"\nPrompt length: {len(prompt)} chars, ~{len(prompt.split())} words")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
