# FixMyNight — Decisions & Changes
**Version:** V1.6
**Date:** 2026-03-03
**Status:** LOCKED — All decisions finalized. This document is the authoritative record of every architectural decision made during the V1.4 → V1.5 fork and the V1.6 update. Claude Code and all implementation agents must read this first.

---

## Phase 2 Pre-Flight: Railway Environment Variable Cleanup (2026-03-03)

Before starting Phase 2 (Backend), a review of the existing Railway environment variables on `fixmynight-api` identified mismatches against the DEPLOYMENT-SPEC.md requirements.

### Variables That Need Renaming

| Current Name | Required Name | Action |
|-------------|--------------|--------|
| `ADMIN_PASSWORD` | `ADMIN_PASSWORD_HASH` | Replace plaintext password with bcrypt hash. Backend uses `bcrypt.checkpw()` — plaintext will not work. |
| `TWILIO_VOICE_NUMBER` | `TWILIO_DEFAULT_NUMBER` | Rename to match DEPLOYMENT-SPEC.md. Same value (`+19796525799`). |

### Variables Missing (Must Be Added Before Backend Deploys)

| Variable | Purpose | Notes |
|----------|---------|-------|
| `VAPI_WEBHOOK_SECRET` | Authenticates incoming Vapi webhook requests | Get from Vapi dashboard |
| `JWT_SECRET_KEY` | Signs all JWT tokens (admin + portal) | Generate with `openssl rand -hex 64` |
| `JWT_ALGORITHM` | JWT signing algorithm | Set to `HS256` |
| `ADMIN_PHONE` | Admin's phone for fallback SMS alerts | `+13466911035` (Dan's number for now) |
| `SENDGRID_API_KEY` | Morning summary email delivery | Get from SendGrid dashboard |
| `SENDGRID_FROM_EMAIL` | From address on morning summaries | e.g. `noreply@fixmyday.ai` |
| `FRONTEND_URL` | Used in magic link emails and CORS | `https://fixmyday.ai` |

### Decision

These are not architectural changes — they are deployment prerequisite corrections. The backend code will reference the variable names from DEPLOYMENT-SPEC.md. The user will update Railway dashboard variables before the first deploy.

---

---

## V1.6 Changes (2026-03-02)

### Why V1.6 Exists

V1.5 was scoped as HVAC-only with a hardcoded gas smell safety override. Before
Phase 1 implementation, the decision was made to:
1. Generalize for any service trade from day one (avoid costly retrofit)
2. Eliminate the safety override flow entirely (reduces liability, simplifies code)
3. Redesign the call flow to handle all after-hours caller types
4. Add cron batch optimization for scalability

### Locked Decisions for V1.6

| # | Decision | Answer | Rationale |
|---|----------|--------|-----------|
| D6-1 | Agent Name | Configurable per client, default "Sarah" | One field, maximum flexibility. |
| D6-3 | Emergency Dispatch Default | OFF (opt-in) | Smart voicemail is baseline. Dispatch is the upgrade. |
| D6-5 | Industry Selection | Fixed dropdown + "Other" | Covers 90% of cases. "Other" gets generic config. |
| D6-6 | Emergency Disclaimer | Soft disclaimer before dispatch on all emergencies | No prescriptive advice. Reminder that 911 exists. Protects against liability. |
| D6-7 | Intent Question | Agent asks "calling about service or leaving a message?" | Smart detection skips this if caller already stated purpose. |
| D6-8 | Leave a Message Flow | Name and phone optional. No callback promised. | Handles vendors, other contractors, informational calls. |
| D6-9 | Return Call Handling | "I got a missed call" → identify business, offer message or service | Common caller type that V1.5 didn't address. |
| D6-10 | Quick Exit | wrong_number and hangup as separate call types | Clean data. Junk calls don't clutter morning summary. |
| D6-11 | Morning Summary Structure | Grouped by type: emergencies, callbacks, messages, one-line junk count | Owner sees what matters first. |
| D6-12 | Call Types | 6 values: emergency, routine, message, wrong_number, hangup, unknown | Each type has distinct handling and analytics value. |

### Eliminated Decisions

| # | Original | Why Eliminated |
|---|----------|---------------|
| D6-2 | Safety override editing admin-only | Safety override concept removed entirely. |
| D6-4 | `safety_override` replaces `gas_smell` | No separate call type for dangerous scenarios. Normal emergency flow for everything. |

### What Changed in V1.6

| Area | Change |
|------|--------|
| Safety override | Eliminated. No separate flow. No prescriptive advice. Soft disclaimer on all emergencies instead. |
| Call flow | Redesigned with intent question, smart detection, 5 branches (service, message, return call, wrong number, hangup). |
| Call types | 6 values: emergency, routine, message, wrong_number, hangup, unknown. Replaces former emergency/routine/gas_smell/unknown. |
| Multi-industry | `industry` and `industry_config` on clients. Shipped defaults for 10 industries. |
| Agent name | `agent_name` column. Default "Sarah". Injected into prompt. |
| Emergency dispatch default | `emergency_enabled` defaults FALSE. Smart voicemail is baseline. |
| Morning summary | Restructured: grouped by call type, junk calls as one-line count. |
| Cron optimization | Batch queries + async delivery. `cron_log` table. Error isolation per client. |
| Emergency fee | Clarified as disclosure only. FixMyNight never collects payment. |
| SendGrid | Free tier retired May 2025. Essentials $19.95/mo minimum noted. |
| Frontend | Industry dropdown in onboarding. HVAC labels generalized. 6 call type filters/badges. |
| Vapi prompt | Templatized. Intent question. Message/return-call/wrong-number/hangup flows added. Gas smell section removed. |

### Version Numbers

All 8 spec documents + CLAUDE.md move from V1.5 to V1.6.


## Why This Fork Exists

V1.4 was reviewed against a complete cross-file logic audit. The review found critical issues that would cause runtime failures, security vulnerabilities, and contradictory behavior in production. V1.5 resolves all of them and consolidates 31 documents into 8.

The previous documents also contained references to individual agent/team member names (Casey, Jordan, Taylor, Pat, Riley, Morgan, Jamie, Drew). All of those have been removed. The new documents are role-neutral.


> **V1.6 UPDATE:** The gas smell "safety override" flow described above has been
> eliminated entirely in V1.6. Gas smell calls now go through normal emergency
> classification. There is no "never transfer" rule. Instead, all emergency calls
> receive a soft disclaimer: "If you feel the situation may be unsafe, please don't
> hesitate to contact your local emergency services." No prescriptive safety advice
> is given for any scenario. See V1.6 Changes section above.

---

## What Was Wrong in V1.4 (Critical Issues Fixed)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | `audit_log` vs `audit_logs` — two incompatible schemas in different files | Both tables would be created; code split between them; data gaps | Single `audit_logs` table, JSONB event-log style |
| 2 | `emergency_fee` and `emergency_enabled` missing from `clients` DDL | Runtime crash on first call — `build_sarah_prompt()` reads these columns | Added to `clients` table |
| 3 | SERIAL integer PKs vs UUID in JWT tokens and audit spec | JWT auth broken at runtime — type mismatch between token payload and DB | UUID for all PKs |
| 4 | Gas smell behavior contradicted across 3 files | Unpredictable behavior depending on which file was implemented | Single defined behavior: inform and advise 911, no system transfer |
| 5 | `transferCall` Vapi return format unverified | Transfer may not work at all if format is wrong | Verified format documented |
| 6 | `admin_sms_numbers` comma-string in form spec, JSON parse in code | `json.loads` throws on comma-string during fallback SMS — worst possible moment | JSON array everywhere |
| 7 | `emergency_fee_offered`, `fee_applicable`, `fee_amount` referenced but never defined | Checklist items that can never be verified | Resolved — see schema |
| 8 | `transfer_success` referenced but no column defined | Can't track transfer success rate | Explicit column added |
| 9 | JWT `verify_token` conflates expired vs invalid tokens | Wrong error message to user | Separate exception handling |
| 10 | `idempotency_key` missing from `calls` DDL | Duplicate call records on Vapi webhook retries | Added to schema |
| 11 | Morning cron at 7:30 AM vs Sarah saying "9 AM" | Customer expects 9 AM call, owner gets summary at 7:30 | Two separate configurable variables |
| 12 | `routing_rules` never queried in call flow | Table populated but never used for routing | Role clarified: cron only |
| 13 | Portal auth doesn't validate `client_id` against DB | Disabled client tokens still work | DB validation added |
| 14 | No rate limiting on webhook endpoint | Replay attack creates fraudulent records | Rate limiting added |

---

## All Locked Decisions

### Decision 1: Primary Keys — UUID
**Answer:** UUID for all primary keys across all tables.  
**Rationale:** FixMyNight is a multi-tenant SaaS. SERIAL integers are sequential and guessable — a client with a valid portal login for client ID 3 could trivially attempt to access client IDs 1, 2. UUID eliminates this attack surface. The JWT spec and audit spec already assumed UUID; this aligns the schema with those specs. Performance difference at current scale is negligible.

```sql
-- All tables use:
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- All foreign keys use:
client_id UUID REFERENCES clients(id)
```

---

### Decision 2: Single Audit Table — Event Log Style
**Answer:** One table: `audit_logs`. JSONB metadata. Event-log style. The separate `audit_log` (field-level change tracking) table is deleted.  
**Rationale:** One append-only event log handles all audit needs. Config changes (fee edits, on_call changes) become events with old/new values in metadata JSONB. Call events, transfer events, and login events all use the same table. Simpler for implementation, easier to query from the portal, consistent with how modern SaaS platforms (Stripe, Twilio) handle audit logging.

```sql
-- Config change event example:
{
  "event_type": "config.fee_changed",
  "actor_type": "admin",
  "metadata": { "field": "emergency_fee", "old": 150.00, "new": 200.00 }
}

-- Transfer event example:
{
  "event_type": "transfer.initiated",
  "actor_type": "system",
  "metadata": { "tech_phone": "+13466911035", "customer_phone": "+15551234567" }
}
```

---

### Decision 3: `admin_sms_numbers` Storage Format — JSON Array
**Answer:** Store as JSON array in PostgreSQL.  
**Rationale:** The fallback SMS code uses `json.loads()`. Storing as comma-separated string causes a `JSONDecodeError` during a failed emergency transfer — the worst possible moment for a bug. JSON array is the correct format. The onboarding form serializes to JSON array on submit.

```sql
admin_sms_numbers JSONB DEFAULT '[]'::jsonb
-- Example value: ["+15551234567", "+15559876543"]
```

---

### Decision 4: Transfer Success Tracking — Explicit Column
**Answer:** Add `transfer_success BOOLEAN DEFAULT FALSE` to the `calls` table.  
**Rationale:** Transfer success rate is a key business metric. Deriving it from other columns adds query complexity and fragility. Explicit is always better for something this important.

---

### Decision 5: Gas Smell Behavior — Superseded in V1.6
**Original answer (V1.5):** The agent informed the caller of the hazard, directed them to emergency services, and provided prescriptive safety instructions. The system took no transfer action. Owner received FYI SMS only.
**Rationale:** The caller needs to be on the phone with emergency services, not on hold waiting for a tech transfer. FixMyNight is not an emergency services system.

> **V1.6 UPDATE:** This entire decision has been superseded. The separate hazard-specific flow
> and its prescriptive safety script have been removed. All emergency calls now follow the
> same flow: soft disclaimer, then normal dispatch. There is no special-case behavior for
> any specific hazard type. See V1.6 Changes section above.

---

### Decision 6: System Scope — After-Hours Only, Always-On
**Answer:** FixMyNight V1 is an after-hours system only. The system is always-on and ready to receive calls. The contractor controls when calls reach the system via call forwarding on their end. The system does not time-gate call routing — it runs the appropriate flow for whatever time window is active when a call arrives.  
**Rationale:** Business-hours call handling is a different product with a different sales conversation. V1's value proposition is specific and strong: "Sleep through the night. Never miss an after-hours emergency." Adding business-hours logic in V1 is scope creep.

**`routing_rules` table role:** Used only by cron jobs (T-15min on-call reminder, morning summary timing). Not used for call routing logic.

**V2 consideration:** A dedicated full business-hours answering service mode (where contractors use FixMyNight as their primary business-hours answering system, not just for forwarded overflow calls) is explicitly deferred to V2. Note: V1.5 does handle calls that arrive during business hours with appropriate language and emergency dispatch, but this is for occasional forwarded calls — not a full business-hours product.

---

### Decision 7: `customer_address` in `transferCall` — Not Implemented in V1
**Answer:** `customer_address` was considered as an optional field in the `transferCall` tool schema.
**Rationale:** The tech gets the customer's name and phone number in the transfer. Address is needed for dispatch but can be confirmed on the call.

> **NOTE (V1.5):** This field was NOT added to the V1.5 transferCall tool schema. Sarah's prompt does not instruct her to collect addresses. Address collection is deferred to V2 if needed. The transferCall tool parameters are: `caller_phone` (required), `issue_summary` (required), `caller_name` (optional).

---

### Decision 8: Unknown SMS Sender — Silent Ignore
**Answer:** If a text is received from a phone number not registered in the `technicians` table, the system silently ignores it. No reply sent.  
**Rationale:** Sending a reply to unknown numbers creates unnecessary exposure. Silent ignore is clean and safe for V1.

---

### Decision 9: Three Time Windows + Configurable Variables
**Answer:** The system operates in three distinct time windows, all client-configurable. See TIME-WINDOW-LOGIC section in MASTER-SPEC for full decision tree.

**Five new fields on `clients` table:**
```sql
business_hours_start              TIME        -- e.g., 08:00
business_hours_end                TIME        -- e.g., 18:00
business_days                     INTEGER[]   -- e.g., [1,2,3,4,5] (1=Mon, 7=Sun)
sleep_window_start                TIME        -- e.g., 22:00 (NULL = no sleep window = 24/7 coverage)
sleep_window_end                  TIME        -- e.g., 08:00 (NULL = no sleep window)
summary_send_time                 TIME        -- when morning cron fires, e.g., 07:30
callback_expected_time            TIME        -- what Sarah tells callers, e.g., 09:00
business_hours_emergency_dispatch BOOLEAN     DEFAULT TRUE
```

**Three windows:**
- **Business hours:** business day + within `business_hours_start`/`business_hours_end`
- **Evening window:** after `business_hours_end`, before `sleep_window_start`
- **Sleep window:** after `sleep_window_start`, before `sleep_window_end` (or `business_hours_start` next day)

**Sleep window is optional:** If `sleep_window_start` IS NULL, there is no sleep window. Evening window runs all night. Used for multi-tech operations that want 24/7 emergency coverage.

**Sleep window applies every day of the week** — it is time-based, not day-based. 10 PM on Saturday is sleep window just like 10 PM on Tuesday.

**Weekends:** Saturday and Sunday are not in `business_days`, so they never trigger business hours logic even if the clock falls within `business_hours_start`/`business_hours_end`. Weekends use evening window logic during daytime hours.

**`summary_send_time` and `callback_expected_time` are independent.** The cron fires at `summary_send_time` (e.g., 7:30 AM). Sarah tells callers callbacks happen at `callback_expected_time` (e.g., 9:00 AM). Both set at onboarding. Both editable via client portal.

**Sarah reads `callback_expected_time` dynamically** — if the client changes it in the portal, Sarah's next call reflects the new time automatically (Vapi assistant rebuild triggered).

---

### Decision 10: Double-Send Prevention — `morning_summary_sent_at`
**Answer:** Add `morning_summary_sent_at TIMESTAMP` column to `calls` table.
**Rationale:** If the morning summary cron fails partway and retries, calls already included in a sent summary must not be sent again. This column is set atomically when the summary is sent. The cron queries `WHERE morning_summary_sent_at IS NULL`.

> **V1.6 UPDATE:** The original V1.5 query also filtered `WHERE requires_callback = TRUE`.
> In V1.6, the `requires_callback` filter was removed from the morning summary query because
> all call types (including messages, wrong numbers, and hangups) are now included in the
> summary with type-specific grouping. The `morning_summary_sent_at` column remains the
> sole double-send prevention mechanism.

---

### Decision 11: Business Hours Fields — Onboarding + Portal Editable
**Answer:** All time window fields (`business_hours_start`, `business_hours_end`, `business_days`, `sleep_window_start`, `sleep_window_end`, `summary_send_time`, `callback_expected_time`) are set during admin onboarding and editable via the client portal.  
**Rationale:** Contractors need to adjust these as their business changes (seasonal hours, vacation, new staff). Admin intervention for every change is not sustainable.

---

### Decision 12: `business_hours_emergency_dispatch` Toggle — Default ON
**Answer:** New boolean field on `clients` table. Default TRUE.  
**Rationale:** During business hours, if a call arrives (contractor forwarded manually — at doctor, with customer), should Sarah attempt live transfer for emergencies? Default ON means yes — erring toward the contractor getting the emergency call is safer than missing it. He can always decline the transferred call. Set to OFF for contractors who want to stay in control during business hours and prefer urgent SMS only.

---

### Decision 13: Sleep Window Messaging — Honest
**Answer:** During the sleep window, Sarah is honest with emergency callers. She does not promise a callback "within the hour." She tells them the team will call first thing in the morning and flags it as urgent.  
**Rationale:** A customer told "someone will follow up as soon as possible" who hears nothing until 8 AM will be furious. A customer who knows to expect a morning call will be frustrated but understanding. Honest expectations prevent bad reviews and chargebacks.

**Agent's sleep window emergency script:**

> **NOTE:** The early draft script that appeared here contained prescriptive safety
> directives (directing callers to contact emergency services). Those directives have
> been removed in V1.6. The authoritative sleep window script is in VAPI-PROMPT-SPEC.md
> and MASTER-SPEC.md. The agent acknowledges urgency, flags the call as priority, sets
> expectation for a morning callback, and uses the standard soft disclaimer.

---

### Decision 14: Morning Summary Format — Urgent/Routine Priority Split
**Answer:** Morning summary (SMS + email) separates urgent flagged emergencies from routine callbacks.

```
[Business Name] Morning Summary — [Date]

🔴 URGENT — Emergency calls from overnight:
1. John Smith — +15551234567 — "No heat, indoor temp dropping"
   Called: 2:14 AM

📋 Routine callbacks:
1. Jane Doe — +15559876543 — "AC tune-up quote"
   Called: 11:32 PM

[N] emergency call(s). [N] routine call(s).
— FixMyNight
```

---

## V1 Additions (New in V1.5 — Not in V1.4)

These items were identified during the logic review and added to V1 scope:

### Addition 1: Onboarding Rollback Strategy
If client creation fails partway (Twilio provisioned, Vapi fails), the system must clean up. Client record uses a `status` field: `pending` during creation, `active` on full success. A cleanup cron removes `pending` records older than 1 hour and releases their Twilio numbers.

### Addition 2: Tech Phone Verification SMS
When a technician is added during onboarding, the system sends a welcome SMS to their registered number: "You've been added as a technician for [Business Name] on FixMyNight. Text ON to go on-call, OFF to go off-call, STATUS to check your status." If the SMS fails to deliver (Twilio error), the onboarding form shows a warning: "Could not verify tech phone number. Please confirm +X-XXX-XXX-XXXX is correct."

### Addition 3: Vapi Rebuild Trigger List
Any change to the following `clients` fields triggers a Vapi assistant rebuild:
- `emergency_fee`
- `emergency_enabled`
- `business_name`
- `callback_expected_time`
- `sleep_window_start`
- `sleep_window_end`
- `business_hours_start`
- `business_hours_end`
- `business_days`
- `business_hours_emergency_dispatch`

Changes to other fields (owner_phone, timezone, admin_sms_numbers) do NOT trigger a rebuild.

### Addition 4: Portal Login Flow — Password on First Use
Admin generates a magic link for the client (`POST /api/v1/auth/portal-login`). Client clicks link, sets their own password on first use. Subsequent logins use email + password. Standard SaaS flow. No admin intervention after initial setup.

### Addition 5: Morning Summary Delivery — Email Primary, SMS Backup
Real-time urgent alerts (transfer failed, no tech on call, emergency during sleep window) → SMS only. Morning summary → Email primarily (readable, scannable, client can refer back). SMS backup if no email configured. `contact_email` field on `clients` table used for email delivery.

### Addition 6: Transfer-First, Log-Second Ordering
The webhook handler must return the transfer response to Vapi before attempting any DB write. If the DB is down, the transfer still completes. DB writes use a retry queue. Call record loss is preferable to transfer failure.

### Addition 7: Bumped Tech Notification SMS
When Tech A's ON command bumps Tech B off-call, Tech B receives an SMS: "You are no longer on-call for [Business Name]. [Tech A Name] has taken over on-call coverage."

### Addition 8: Recording Consent Disclosure
Sarah's greeting includes: "This call may be recorded for quality purposes." Added to the first message template. One sentence, covers all states.

---

## V2 Parking Lot

These items were discussed and explicitly deferred:

| Item | Reason Deferred |
|------|----------------|
| Full business-hours answering service mode (dedicated daytime product) | V1 handles forwarded business-hours calls but is not a full daytime answering service. |
| Multiple on-call techs simultaneously | Adds significant complexity. V1 = one on-call tech per client. |
| Client pricing tiers (1-5 vs 5+ techs) | V1 supports up to 5 techs per client. Pricing tiers in V2. |
| Unknown Twilio number graceful fallback | Only matters with multiple clients. V1 = 1-5 clients. |
| Click-to-call in client portal | Nice to have. Frontend-only. V2. |
| Round-robin tech routing | V2 complexity. V1 = one on-call at a time. |
| Client-editable Vapi prompt customization | V2. V1 = admin-managed prompts only. |
| On-call schedule automation / rotation | V2. V1 = manual SMS ON/OFF. |

---

## Document Consolidation Map

31 V1.4 documents consolidated into 8 V1.5 documents:

| New Document | Replaces |
|---|---|
| MASTER-SPEC | SYSTEM-ARCHITECTURE, JORDAN-VOICE-FLOW-PRODUCTION, README |
| DATABASE-SCHEMA | DATABASE-SCHEMA, JORDAN-DB-SCHEMA-NOTES, AUDIT-LOG-SPEC |
| BACKEND-SPEC | BACKEND-ENDPOINTS, JORDAN-VAPI-INTEGRATION-NOTES, JORDAN-EMERGENCY-TRANSFER-IMPL, FALLBACK-FLOWS, ERROR-MESSAGE-TEMPLATES, JWT-AUTH-SPEC |
| VAPI-PROMPT-SPEC | VAPI_PROMPT, TAYLOR-VAPI-PROMPT-TEMPLATES, TAYLOR-VAPI-PROMPT-ITERATIONS, TAYLOR-EMERGENCY-MODEL-UPDATE |
| FRONTEND-SPEC | ADMIN-ONBOARDING-FORM-SPEC, CLIENT-SELF-SERVICE-PORTAL, ON_CALL-FORM-FIELD-SPEC |
| DEPLOYMENT-SPEC | CASEY-RAILWAY-DEPLOYMENT-NOTES, CASEY-VAPI-RAILWAY-SETUP, CASEY-EMERGENCY-TRANSFER-CONFIG |
| QA-AND-LAUNCH | PAT-QA-TEST-SCENARIOS, PAT-VAPI-QA-BRIEF, IMPLEMENTATION-CHECKLIST |
| DECISIONS-AND-CHANGES | V1.4-CHANGE-SUMMARY, RILEY-SPRINT-PLANNING-NOTES, all brief files |

**Dropped entirely (no implementation value):**
- DREW-VAPI-STRATEGY-BRIEF — business strategy
- MORGAN-VAPI-LAUNCH-BRIEF — marketing copy
- JAMIE-COMPLIANCE-CHECKLIST — legal research task
- JAMIE-VAPI-LEGAL-BRIEF — legal research task
- CASEY-VAPI-RAILWAY-SETUP (stub) — was self-referential

---

## Migration from V1.4 to V1.5

### New Environment Variables Required

> **NOTE:** The variable names below are from the V1.4→V1.5 migration notes and some are outdated.
> The authoritative environment variable list is in DEPLOYMENT-SPEC.md.
> Specifically: `JWT_SECRET` is now `JWT_SECRET_KEY`, and `ADMIN_USERNAME` / `AUDIT_LOG_ENABLED` are no longer used.

```bash
JWT_SECRET_KEY=<openssl rand -hex 64>
ADMIN_PASSWORD_HASH=<bcrypt hash of admin password>
SENDGRID_API_KEY=<or equivalent email provider>   # For morning summary email
```

### Deprecated Variables (remove after V1.5 deploy)
```bash
# ADMIN_PASSWORD — replaced by JWT_SECRET_KEY + ADMIN_PASSWORD_HASH
# PORTAL_SECRET — folded into JWT_SECRET_KEY
# ADMIN_USERNAME — removed (admin is a single superuser, no username needed)
# AUDIT_LOG_ENABLED — removed (audit logging is always on)
```

### Pre-Migration Data Check
```sql
-- Run BEFORE applying schema migrations
-- Check for duplicate on_call=TRUE violations
SELECT client_id, COUNT(*) as on_call_count
FROM technicians
WHERE on_call = TRUE
GROUP BY client_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows. Fix any violations before creating unique index.
```

### Key Schema Changes
- All `id` columns: `SERIAL` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- All FK columns: `INTEGER` → `UUID`
- `audit_log` table: deleted, replaced by `audit_logs`
- `clients` table: 8 new columns added (see DATABASE-SCHEMA.md)
- `calls` table: `transfer_success`, `morning_summary_sent_at`, `idempotency_key` added
- `technicians` table: partial unique index on `on_call`

Full migration SQL in DATABASE-SCHEMA.md.

---

## V1.5 Cross-Document Consistency Audit (2026-02-28 → 2026-03-02)

Before beginning Phase 1 implementation, a full cross-document consistency audit was performed across all 8 spec documents. The audit ran across multiple sessions with 6 iterative scan passes.

### Audit Summary

| Scan | Issues Found | Status |
|------|-------------|--------|
| 1st | 32 | All corrected |
| 2nd | 10 | All corrected |
| 3rd | 4 | All corrected |
| 4th | 1 | Corrected |
| 5th | 2 | Corrected |
| 6th (verification) | 0 | Clean — specs confirmed consistent |

**Total: 49 issues found and corrected.**

### Notable Corrections (Scans 4–6, session of 2026-03-02)

All 3 corrections in this session were to MASTER-SPEC.md only. The other 7 documents were already consistent with each other.

| # | Issue | Fix |
|---|-------|-----|
| 1 | Gas smell FYI SMS in MASTER-SPEC was missing `for [Business Name]` and said `"No transfer attempted"` instead of `"No transfer"` | Updated MASTER-SPEC line 138 to match BACKEND-SPEC and DECISIONS: `"Gas smell reported for [Business Name]: caller [phone]. No transfer. 911 advised."` |
| 2 | Gas smell FYI SMS separator in MASTER-SPEC used em dash (—) while BACKEND-SPEC and DECISIONS used colon (:) | Changed MASTER-SPEC separator from `—` to `:` to match |
| 3 | Sleep window emergency script in MASTER-SPEC said `"flagged as a priority"` — missing word `"emergency"` that all 4 other documents included | Added `"emergency"` to MASTER-SPEC line 193: `"flagged as a priority emergency and"` |

### Corrections from Earlier Scans (1–3)

46 issues corrected across the first 3 scans. These included wording alignment across all 8 documents for SMS messages, prompt scripts, field references, error codes, and behavioral descriptions. All corrections followed the same principle: identify the authoritative source for each item, then align all other documents to match.

### Audit Principle Applied

When documents disagreed, the fix was always applied to the document that was out of alignment with the majority. VAPI-PROMPT-SPEC is authoritative for Sarah's scripts. BACKEND-SPEC is authoritative for implementation details. DATABASE-SCHEMA is authoritative for schema. MASTER-SPEC is the system overview and was updated to match the more detailed specs when discrepancies were found.

---

*This document is the authoritative record of all V1.5 and V1.6 decisions. Any implementation that contradicts this document contains an error. Last updated: 2026-03-02.*
