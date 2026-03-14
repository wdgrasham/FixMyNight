# BUG-001: Vapi assistantId Overriding Dynamic Prompt

**Date Found:** 2026-03-13
**Severity:** Critical
**Status:** FIXED
**Commit:** (multiple commits during Phase 5 session)

---

## Symptom

All calls used the generic fallback assistant instead of per-client dynamic
prompts. Business name missing from greeting, no emergency fee mentioned, no
client-specific behavior.

## Root Cause

`assistantId` was set on Vapi phone numbers. When Vapi sees `assistantId` on a
phone number, it uses that assistant directly and **never fires the
`assistant-request` webhook**. The entire dynamic prompt system (time windows,
on-call tech lookup, client config, caller phone injection) was bypassed.

## Fix

1. Removed `assistantId` from all Vapi phone numbers via API
2. Removed startup hook in `app/main.py` that re-set `assistantId` on boot
3. Updated `import_twilio_number_to_vapi()` to not set `assistantId`
4. Added Architecture Rule #11 to CLAUDE.md

## Prevention

Architecture Rule #11: "NEVER set `assistantId` on Vapi phone numbers."
The fallback assistant exists only as a Vapi-level safety net if the webhook
fails — it must never be assigned to phone numbers.
