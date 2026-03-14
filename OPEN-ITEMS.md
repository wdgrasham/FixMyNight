# FixMyNight — Open Items

**Last Updated:** 2026-03-14

---

## Completed (Phase 5 QA — 2026-03-13/14)

- [x] T1.15 — Wrong number quick exit
- [x] T1.17 — Silence/hangup detection
- [x] T1.1 — Recording disclosure in greeting
- [x] T1.8 — Emergency with no tech on-call (fallback message + SMS)
- [x] T1.10 — Sleep window emergency (no transfer, urgent callback)
- [x] Emergency transfer (evening window) — transfer attempted, fallback on failure
- [x] SMS ON/OFF/STATUS commands (tech + owner)
- [x] Owner single-operator mode (auto-create tech record)
- [x] Vapi assistant-request webhook firing correctly (assistantId removed)
- [x] Caller phone injected into prompt for readback
- [x] Anti-abuse exempts caller frustration/slang
- [x] Safety disclaimer fully removed (Architecture Rule 7)
- [x] Vercel auto-deploy from GitHub
- [x] Morning summary duplicate bug fixed (claim-before-send)
- [x] Sleep window checkbox re-enable (stale React state fix)

## Deferred to V1.1

- [ ] **Interruption/endpointing settings** — Sarah doesn't stop talking when the caller interrupts her greeting. Needs `stopSpeakingPlan` config in Vapi. Researched but reverted — needs more testing before deploying. See BUG-004 for related idle hook issues.
- [ ] **Silence prompt sequencing** — Sarah goes straight to goodbye on silence instead of prompting "Hello, are you there?" first. Vapi's `customer.speech.timeout` hook with `exact` array doesn't sequence correctly. See `docs/known-behaviors.md`.
- [ ] **Sleep window default values** — When enabling sleep window in portal, defaults to 22:00-08:00. Consider making these configurable or smarter based on client timezone.
- [ ] **Transfer failure verification** — Config changes made (removed unreliable flags, added full fallback message), but needs a clean end-to-end test where tech doesn't answer.
- [ ] **Phone readback pacing verification** — Comma-separated digit format deployed but not explicitly verified in a clean test.
- [ ] **Daytime upgraded tier (daytime_enabled = TRUE)** — Add emergency detection, qualification questions, FAQ answering, scheduling preferences, urgent SMS for emergencies. Basic tier (FALSE) is message-only.
- [ ] **Daytime emergency fee** — Configurable per client, separate from evening fee. Evaluate after client feedback.
- [ ] **Daytime emergency transfer** — Evaluate whether to attempt transfer or just send urgent SMS during business hours.

## Phase Status

| Phase | Status |
|-------|--------|
| 1. Database | COMPLETE |
| 2. Backend | COMPLETE |
| 3. Vapi | COMPLETE |
| 4. Frontend | COMPLETE |
| 5. Wire & Test | COMPLETE |

## Pre-Launch Remaining

- [ ] Stripe test mode → live mode
- [ ] Final production smoke test (one clean call, end-to-end)
- [ ] Railway auto-deploy from GitHub (if not already configured)
- [ ] Test fallback assistant: break webhook URL, confirm fallback answers
