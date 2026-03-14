# BUG-004: Idle Message Hooks Killing Transfer Calls

**Date Found:** 2026-03-13
**Severity:** Critical
**Status:** FIXED (removed for V1)

---

## Symptom

During a live transfer to the on-call technician, Sarah's idle message hook
fired and interrupted the transfer — speaking over the ringing or speaking
to the technician mid-handoff.

## Root Cause

Vapi's `customer.speech.timeout` hook fires based on customer silence. During
a transfer, the customer is on hold (silent), so the idle hook triggers. Vapi
does not distinguish between "caller is silent" and "caller is on hold during
transfer."

Additional issues with the idle hook:
- The `exact` array of messages was treated as a random pool, not sequential
- The goodbye message fired on the first silence timeout instead of the
  second, ending calls prematurely

## Fix

Removed all `customer.speech.timeout` hooks from the assistant-request
response. Idle message handling is deferred to V1.1 pending a reliable
implementation approach.

## Impact

Without idle hooks, Sarah does not proactively prompt silent callers. This is
documented as a known behavior in `docs/known-behaviors.md`. The call still
ends via `silenceTimeoutSeconds: 60` if no one speaks.
