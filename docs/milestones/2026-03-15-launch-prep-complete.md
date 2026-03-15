# Milestone: Launch Prep Complete — 2026-03-15

## Summary

Full day of production hardening, bug fixes, and marketing page overhaul.
Business hours call flow built and refined, Stripe checkout fixed, morning
summary query corrected, transcript analysis reclassification bug eliminated,
and product page repositioned from "after-hours answering" to "24/7 AI
voicemail replacement."

---

## Accomplished

### Business Hours Call Flow (Daytime Tier)
- Built `build_business_hours_prompt()` — minimal message-taking script
- Built business-hours first message with natural greeting flow
- Added `time_window` param to `build_first_message()`
- Business-hours calls get separate prompt, no transfer tools, different `endCallPhrases`
- Call type `business_hours_missed` overrides extraction for business-hours calls
- Refined greeting: recording disclosure after name, no "we're open try calling back"
- Fixed "Sure, go ahead" — Sarah now acknowledges what caller already said
- Removed emergency detection from basic tier (deferred to upgraded tier)

### Database & Backend
- Added `daytime_enabled` BOOLEAN column (default FALSE)
- Added `business_faq` JSONB column (default '{}')
- Added `missed_call_notify_phones` JSONB column (default '[]', backfilled to [owner_phone])
- E.164 validation on missed_call_notify_phones
- All three columns added via startup migration with backfill

### Missed Call Notifications
- Configurable phone number list for business-hours SMS notifications
- Portal UI: add/remove phone numbers with PhoneInput component
- Webhook routes SMS to all numbers in list (skips wrong_number/hangup)
- Falls back to owner_phone if list empty

### Morning Summary Fix
- Root cause: query filtered only `morning_summary_sent_at == None` with no date bound
- Fix: captures `prev_summary_date` before claim, adds `Call.created_at >= cutoff`
- Previous summary exists → cutoff = start of that day; first ever → 48h lookback
- Historical/test calls no longer appear in summaries

### Transcript Analysis Fix
- Removed industry context that told Haiku "unrelated calls = wrong_number"
- Added explicit rules: never reclassify by topic, wrong_number only if caller explicitly said so
- Contractors get calls from suppliers, inspectors, insurance — all legitimate

### Admin: Clear Test Data
- `POST /api/v1/admin/clients/{client_id}/clear-test-calls`
- Marks all unsent calls as summary-sent (non-destructive, audit logged)

### Stripe Pricing Update
- Starter: $89/40 calls → $99/50 calls
- Standard: $169/100 calls → $179/100 calls
- Pro: $299/250 calls → $399/250 calls
- New Stripe price IDs created and updated in frontend + backend
- Fixed broken checkout: backend `PRICE_TO_TIER` had old price IDs

### Product Page Repositioning
- Headline: "After-Hours AI Answering" → "Never Miss a Call Again"
- Positioned as 24/7 voicemail replacement, not just after-hours
- 6 features (up from 4): added instant SMS notifications, portal & recordings
- 7 industries (added Glass & Window, General Contractor)
- New social proof section (62% unanswered, $525 lost, 78% call competitor)
- New speed/simplicity section (no fees, no contracts, cancel anytime)
- ROI callout: "One captured job pays for 5 months of service"
- Pricing comparison: "$2.50/minute plus $1,000 setup fees"
- Fixed 1px white gap between hero and stats bar (SVG divider bug)

### SendGrid Monitoring
- Rewrote `_check_sendgrid()` to fetch today + monthly stats + account info in parallel
- Admin services card shows: sent/delivered today, sent/delivered this month, plan, daily limit, bounces

### Other Fixes
- `silenceTimeoutSeconds` reduced from 60 to 30 (was causing 2+ minute silent calls)
- Business-hours SMS now uses `missed_call_notify_phones` instead of just owner_phone

---

## Files Changed (Key)

| File | Change |
|------|--------|
| `app/services/prompt_builder.py` | Business hours prompt + first message |
| `app/routers/webhooks.py` | Business hours flow, transcript analysis fix, SMS routing |
| `app/cron/morning_summary.py` | Date cutoff filter, prev_summary_date capture |
| `app/routers/admin.py` | Clear test calls endpoint |
| `app/routers/stripe_billing.py` | New price IDs + tier call limits |
| `app/models.py` | missed_call_notify_phones column |
| `app/schemas.py` | Validation for new fields |
| `app/routers/portal.py` | Portal settings for new fields |
| `app/services/service_monitor.py` | Enhanced SendGrid monitoring |
| `app/main.py` | Startup migrations for 3 new columns |
| `frontend/src/pages/public/FixMyNightProduct.tsx` | Full page repositioning |
| `frontend/src/pages/portal/PortalSettings.tsx` | Missed call phones + daytime toggle |
| `frontend/src/pages/admin/AdminServices.tsx` | SendGrid stats display |
| `frontend/src/types.ts` | New fields on Client + PortalSettingsPayload |

---

## Commits (chronological)

1. `390ad5e` — Add missed_call_notify_phones for configurable SMS routing
2. `4372b29` — Enhance SendGrid monitoring
3. `e046f89` — Fix business-hours call flow: natural greeting
4. `f6e9c40` — Remove emergency detection from basic daytime tier
5. `155554a` — Update product page: 24/7 positioning, new pricing
6. `396bed4` — Fix pricing copy
7. `505cd60` — Fix Stripe checkout, morning summary, transcript analysis; add marketing sections
