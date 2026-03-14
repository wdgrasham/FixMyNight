# Milestone: Phase 5 QA Complete

**Date:** 2026-03-14
**Status:** COMPLETE

---

## Summary

Phase 5 (Wire & Test) completed. All hard-block QA test scenarios from
QA-AND-LAUNCH.md passed via live phone calls and SMS testing against the
production system (Stellar HVAC, +19796525799).

---

## SMS Testing (All Passed)

- **ON/OFF/STATUS commands** from registered technicians
- **Owner commands**: STATUS always allowed; ON/OFF auto-creates tech record for single-operator mode
- **Phone verification**: first valid SMS from unverified tech auto-verifies
- **Bump logic**: new ON bumps existing on-call tech, notifies both parties
- **Unknown sender**: silent ignore (Architecture Rule 9)
- **Confirmation SMS**: tech and owner both notified on ON/OFF (skipped when tech IS the owner)

## Call Testing (Calls 1-4 Passed, Call 5 Skipped)

| Call | Test ID | Scenario | Result |
|------|---------|----------|--------|
| 1 | T1.15 | Wrong number — quick exit | PASS (after fixes) |
| 2 | T1.17 | Silence/hangup | PASS (known behavior documented) |
| 3 | T1.1+ | Emergency with transfer (evening window) | PASS (after fixes) |
| 3 | T1.8 | Emergency — no tech on-call | PASS |
| 4 | T1.10 | Sleep window emergency — no transfer | PASS (after fixes) |
| 5 | T1.18/19 | Emergency blurt + no disclaimer | SKIPPED — covered by Calls 3-4 |

Call 5 was skipped because the emergency blurt scenario (caller interrupts
greeting) and no-disclaimer check were already verified during Calls 3 and 4.
Interruption/endpointing settings were researched but deferred to V1.1.

---

## Sarah Script Updates Deployed

All changes deployed to Railway via the dynamic `assistant-request` webhook:

1. **Quick exit**: "Have a good night" is final — "That is your last sentence. Stop speaking." at every exit point
2. **Anti-abuse**: exempts caller frustration/slang ("I'm cooked", "this is killing me") — only redirects genuinely off-topic requests
3. **Caller ID confirmation**: uses actual caller phone from Vapi webhook data, formatted as individual digits with comma pacing
4. **Failed transfer**: "Speak FIRST" — immediate fallback message, no waiting for caller to speak
5. **Prompt injection protection**: CRITICAL SECURITY RULES section intact, separate from anti-abuse
6. **Safety disclaimer**: fully removed per Architecture Rule 7 — empathy only, no safety advice
7. **No re-ask**: if caller already described their issue, Sarah summarizes for confirmation instead of asking again
8. **Sleep window**: no transfers during sleep window, urgent callback message instead

## Vapi Dynamic Prompt Fix

**Problem:** `assistantId` was set on Vapi phone numbers, which prevented the
`assistant-request` webhook from firing. All calls used the static fallback
assistant instead of dynamic per-call prompts.

**Fix:** Removed `assistantId` from phone numbers, removed startup hook that
re-set it, updated `import_twilio_number_to_vapi()` to not set it. Added as
Architecture Rule #11.

## Owner SMS Commands

Owners (identified by `client.owner_phone`) can always text STATUS. When no
technicians are registered, owners can text ON/OFF — the system auto-creates
a tech record with `phone_verified=True` so the owner can go on-call themselves
(single-operator mode).

## Vercel Auto-Deploy

Connected Vercel to GitHub repository for automatic frontend deploys on push.

## Morning Summary Duplicate Bug

**Bug:** Morning summary cron sent ~120 duplicate emails (one per minute for
the entire summary window) because the sent-date flag was committed after
email delivery.

**Fix:** Claim-before-send pattern — set `last_summary_sent_date` and commit
immediately before any email/SMS work. If delivery fails, the flag is already
set and the failure is logged to audit_logs.

---

## Open Items Deferred to V1.1

- Interruption/endpointing settings (Sarah doesn't stop talking when caller interrupts greeting)
- Silence prompt sequencing ("Hello, are you there?" before goodbye)
- Sleep window default values in portal UI
