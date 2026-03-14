# BUG-003: Silence After Failed Transfer

**Date Found:** 2026-03-13
**Severity:** High
**Status:** FIXED (config), PARTIALLY VERIFIED (needs clean test)

---

## Symptom

After a transfer to the on-call technician failed (no answer / voicemail),
the caller heard silence. Sarah did not speak the fallback message. The caller
sat in silence until the call timed out.

Occurred 3 times during testing.

## Root Cause

Vapi's `request-failed` message and `fallbackPlan.message` delivery is
unreliable. The `endCallAfterSpokenEnabled` and `endCallEnabled` flags on the
transfer tool's failure message also caused unpredictable behavior.

## Fix

1. Removed `endCallAfterSpokenEnabled` and `endCallEnabled` flags from
   transfer tool configuration
2. Updated the `request-failed` content and `fallbackPlan.message` to include
   the full failure script (not just "Have a good night")
3. Added "AFTER FAILED TRANSFER" section to the prompt with "Speak FIRST"
   instruction — tells the LLM to speak immediately without waiting for
   caller input after a failed transfer
4. The failure message ends with "Have a good night" which triggers
   `endCallPhrases` for auto-hangup

## Failure message

"I'm sorry, I wasn't able to reach our on-call {tech_title} right now. I've
flagged this as an urgent emergency and the team has been notified. Someone
will call you back as soon as possible. Have a good night."
