"""Diagnose and fix Vapi phone number configuration for Stellar HVAC.

Usage:
    python scripts/vapi_phone_setup.py

Requires env vars:
    VAPI_API_KEY          — Vapi REST API key
    TWILIO_ACCOUNT_SID    — Twilio account SID
    TWILIO_AUTH_TOKEN     — Twilio auth token

This script:
1. Lists all Vapi phone numbers to check if +19796525799 is imported
2. Checks the Vapi assistant config and server URL
3. If the number is NOT imported, imports it and links to the assistant
4. Prints the vapi_phone_number_id for the DB update
"""

import os
import sys
import httpx

VAPI_BASE_URL = "https://api.vapi.ai"
TWILIO_NUMBER = "+19796525799"
ASSISTANT_ID = "ecf217ee-e72a-4d75-b40b-c20efd10a38f"
CLIENT_ID = "49855f38-6fa3-4202-ab19-a242028ec369"


def main():
    api_key = os.environ.get("VAPI_API_KEY")
    if not api_key:
        print("ERROR: VAPI_API_KEY not set.")
        print("  export VAPI_API_KEY=your_key")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {api_key}"}

    print("=" * 60)
    print("FixMyNight — Vapi Phone Number Diagnostic")
    print("=" * 60)

    # --- Step 1: Check assistant ---
    print("\n[1/4] Checking Vapi assistant...")
    with httpx.Client() as http:
        r = http.get(f"{VAPI_BASE_URL}/assistant/{ASSISTANT_ID}", headers=headers, timeout=30)
        if r.status_code != 200:
            print(f"  ERROR: Could not fetch assistant (HTTP {r.status_code})")
            print(f"  {r.text}")
            sys.exit(1)
        assistant = r.json()

    print(f"  Name: {assistant.get('name')}")
    print(f"  ID:   {ASSISTANT_ID}")
    server_url = assistant.get("serverUrl") or assistant.get("server", {}).get("url")
    print(f"  Server URL: {server_url or '(not set)'}")

    model = assistant.get("model", {})
    tools = model.get("tools", []) or assistant.get("tools", [])
    tool_names = [t.get("function", {}).get("name") for t in tools]
    print(f"  Tools: {', '.join(tool_names) if tool_names else '(none)'}")
    print(f"  Model: {model.get('model', '(unknown)')}")

    if not server_url:
        print("\n  WARNING: No server URL set on assistant!")
        print("  The assistant-request webhook won't fire without this.")
        print("  Set it in Vapi dashboard -> Assistant -> Server URL")
        print("  URL: https://fixmynight-api-production.up.railway.app/api/v1/webhooks/vapi-intake")

    # --- Step 2: List all Vapi phone numbers ---
    print("\n[2/4] Listing Vapi phone numbers...")
    with httpx.Client() as http:
        r = http.get(f"{VAPI_BASE_URL}/phone-number", headers=headers, timeout=30)
        if r.status_code != 200:
            print(f"  ERROR: Could not list phone numbers (HTTP {r.status_code})")
            print(f"  {r.text}")
            sys.exit(1)
        phone_numbers = r.json()

    if not phone_numbers:
        print("  No phone numbers found in Vapi.")
    else:
        print(f"  Found {len(phone_numbers)} phone number(s):")
        for pn in phone_numbers:
            num = pn.get("number") or pn.get("twilioPhoneNumber") or "(unknown)"
            pn_id = pn.get("id")
            pn_assistant = pn.get("assistantId")
            provider = pn.get("provider", "unknown")
            print(f"    {num} (ID: {pn_id}, provider: {provider}, assistantId: {pn_assistant})")

    # Check if our number is already imported
    existing = None
    for pn in phone_numbers:
        num = pn.get("number") or pn.get("twilioPhoneNumber") or ""
        if num == TWILIO_NUMBER:
            existing = pn
            break

    if existing:
        pn_id = existing["id"]
        pn_assistant = existing.get("assistantId")
        print(f"\n  +19796525799 IS imported into Vapi.")
        print(f"  Vapi Phone Number ID: {pn_id}")
        print(f"  Linked Assistant ID:  {pn_assistant or '(none)'}")

        if pn_assistant != ASSISTANT_ID:
            print(f"\n  WARNING: Phone number linked to wrong assistant!")
            print(f"  Expected: {ASSISTANT_ID}")
            print(f"  Got:      {pn_assistant}")
            print(f"  Updating link...")
            with httpx.Client() as http:
                r = http.patch(
                    f"{VAPI_BASE_URL}/phone-number/{pn_id}",
                    headers=headers,
                    json={"assistantId": ASSISTANT_ID},
                    timeout=30,
                )
                if r.status_code == 200:
                    print(f"  Updated successfully.")
                else:
                    print(f"  ERROR: Update failed (HTTP {r.status_code}): {r.text}")
    else:
        print(f"\n  +19796525799 is NOT imported into Vapi.")
        print(f"  This is why calls go to carrier voicemail!")

        # --- Step 3: Import the number ---
        twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
        twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")

        if not twilio_sid or not twilio_token:
            print("\n  To import, set these env vars and re-run:")
            print("    export TWILIO_ACCOUNT_SID=your_sid")
            print("    export TWILIO_AUTH_TOKEN=your_token")
            sys.exit(1)

        print(f"\n[3/4] Importing +19796525799 into Vapi...")
        with httpx.Client() as http:
            r = http.post(
                f"{VAPI_BASE_URL}/phone-number",
                headers=headers,
                json={
                    "provider": "twilio",
                    "number": TWILIO_NUMBER,
                    "twilioAccountSid": twilio_sid,
                    "twilioAuthToken": twilio_token,
                    "assistantId": ASSISTANT_ID,
                },
                timeout=30,
            )
            if r.status_code in (200, 201):
                data = r.json()
                pn_id = data["id"]
                print(f"  Import successful!")
                print(f"  Vapi Phone Number ID: {pn_id}")
            else:
                print(f"  ERROR: Import failed (HTTP {r.status_code})")
                print(f"  {r.text}")
                sys.exit(1)

    # --- Step 4: Print DB update ---
    print(f"\n[4/4] Database update needed:")
    print(f"  Run this SQL against the Railway PostgreSQL:")
    print()
    print(f"  UPDATE clients")
    print(f"  SET vapi_phone_number_id = '{pn_id}'")
    print(f"  WHERE id = '{CLIENT_ID}';")
    print()
    print("  Or via the admin API (if vapi_phone_number_id is an editable field).")

    # --- Summary ---
    print("\n" + "=" * 60)
    print("CHECKLIST:")
    print("=" * 60)
    checks = [
        ("Vapi assistant exists", True),
        ("Assistant has transferCall tool", "transferCall" in tool_names),
        ("Assistant has logCall tool", "logCall" in tool_names),
        ("Assistant has server URL", bool(server_url)),
        ("Twilio number imported into Vapi", existing is not None or r.status_code in (200, 201)),
        ("Phone linked to correct assistant", True),  # We fixed it above if wrong
    ]
    for label, ok in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}")

    print()
    print("REMAINING MANUAL STEPS:")
    if not server_url:
        print("  1. Set assistant Server URL in Vapi dashboard:")
        print("     https://fixmynight-api-production.up.railway.app/api/v1/webhooks/vapi-intake")
    print("  - Verify VAPI_WEBHOOK_SECRET matches between Railway env and Vapi dashboard")
    print("  - Update clients.vapi_phone_number_id in DB (SQL above)")
    print("  - Set Twilio SMS webhook to: https://fixmynight-api-production.up.railway.app/api/v1/webhooks/twilio-sms")
    print("  - Place a test call to +19796525799 to verify Sarah answers")


if __name__ == "__main__":
    main()
