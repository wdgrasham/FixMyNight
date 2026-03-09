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
| `JWT_SECRET` | Signs all JWT tokens (admin + portal) | Generate with `openssl rand -hex 64` |
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
> Specifically: the actual deployed name is `JWT_SECRET` (not `JWT_SECRET_KEY`), and `ADMIN_USERNAME` / `AUDIT_LOG_ENABLED` are no longer used.

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

---

## Phase 3 Deployment: Railway + Vapi Setup (2026-03-04)

Backend deployed to Railway and all infrastructure wiring completed in a single session.

### Deployment Fixes Applied

| # | Issue | Fix |
|---|-------|-----|
| 1 | Railway uses Python 3.13 by default; `asyncpg` and `pydantic-core` lack pre-built wheels | Added `runtime.txt` pinning Python 3.11.11 |
| 2 | `DATABASE_URL` starts with `postgresql://` not `postgres://`; URL conversion missed it | Fixed `database.py` to handle both `postgresql://` and `postgres://` prefixes |
| 3 | `TIMESTAMPTZ` and `TIME` not importable from `sqlalchemy.dialects.postgresql` | Replaced with `DateTime(timezone=True)` and `Time` from core SQLAlchemy |
| 4 | `AuditLog.metadata` conflicts with SQLAlchemy's reserved `metadata` attribute | Renamed Python attribute to `.meta` with `Column("metadata", ...)` to keep DB column name |
| 5 | Code used `JWT_SECRET_KEY` but env var is `JWT_SECRET` | Fixed `auth.py` to use `JWT_SECRET` |
| 6 | `passlib==1.7.4` + `bcrypt>=4.1` incompatible (ValueError on >72 byte detection) | Pinned `bcrypt==4.0.1` in `requirements.txt` |
| 7 | Vapi API rejects `tools` at top level of assistant payload | Moved `tools` inside `model.tools` in push script, vapi.py, and payload JSON |

### Railway Environment Variables — Final State

| Variable | Value/Source | Status |
|----------|-------------|--------|
| `DATABASE_URL` | Railway Postgres internal URL | Pre-existing |
| `VAPI_API_KEY` | From Vapi dashboard | Pre-existing |
| `TWILIO_ACCOUNT_SID` | From Twilio dashboard | Pre-existing |
| `TWILIO_AUTH_TOKEN` | From Twilio dashboard | Pre-existing |
| `TWILIO_DEFAULT_NUMBER` | `+19798525799` | Renamed from `TWILIO_VOICE_NUMBER` |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of `FixMyNight2024!` | Replaced plaintext `ADMIN_PASSWORD` |
| `ADMIN_USERNAME` | `wdgrasham` | Added |
| `JWT_SECRET` | Generated (64-byte URL-safe token) | Added |
| `VAPI_WEBHOOK_SECRET` | Generated (32-byte URL-safe token) | Added |
| `SENDGRID_API_KEY` | From SendGrid dashboard | Added |
| `SENDGRID_FROM_EMAIL` | `noreply@fixmyday.ai` | Added |
| `FRONTEND_URL` | `https://fixmyday.ai` | Added |
| `ENVIRONMENT` | `production` | Pre-existing |
| `ADMIN_PASSWORD` | — | **Removed** (was plaintext) |
| `TWILIO_VOICE_NUMBER` | — | **Removed** (renamed) |

### Vapi Assistant Configuration

| Setting | Value |
|---------|-------|
| Assistant ID | `ecf217ee-e72a-4d75-b40b-c20efd10a38f` |
| Server URL | `https://fixmynight-api-production.up.railway.app/api/v1/webhooks/vapi-intake` |
| Webhook header | `X-Vapi-Secret` |
| Prompt version | V1.6 evening-window (5,906 chars) |
| Tools | `transferCall`, `logCall` (inside `model.tools`) |
| Model | GPT-4o, temperature 0.3 |
| Voice | ElevenLabs (`sarah`) |
| Transcriber | Deepgram Nova-2 |
| Verification | 22/22 checks passed |

### Stellar HVAC DB Record

`vapi_assistant_id` updated to `ecf217ee-e72a-4d75-b40b-c20efd10a38f` via admin API PATCH.

### Decision: `ADMIN_USERNAME` vs spec note

The V1.4→V1.5 migration notes in this document state `ADMIN_USERNAME — removed (admin is a single superuser, no username needed)`. However, `BACKEND-SPEC.md` defines admin login as password-only (no username field in the request schema). The `ADMIN_USERNAME` env var is set but not currently checked by the login endpoint — it exists for future use if username validation is added. The login endpoint validates password only via `ADMIN_PASSWORD_HASH`.

---

---

## Branding and Marketing Site — Out of Scope (2026-03-04)

**Decision:** Branding and the public marketing website (fixmyday.ai landing page, logo, color palette, pricing page) are NOT in scope for the current build. Phase 4 frontend will use a simple text logo and basic color scheme as placeholders. Branding and the public marketing site will be a separate project after Phases 4 and 5 are complete and the product is proven with Stellar HVAC.

**Rationale:** The priority is a working product for the first client. Visual polish and marketing can't be validated until the core product works end-to-end. Placeholder branding avoids blocking frontend development on design decisions.

**Impact:** No spec files affected. Frontend uses minimal placeholder styling.

---

## Phase 4 Frontend Deployed to Vercel (2026-03-04)

Frontend deployed to Vercel with placeholder styling for Phase 5 end-to-end testing.

**Production URL:** `https://frontend-one-iota-ko43cah616.vercel.app`
**Vercel env var:** `VITE_API_BASE_URL` = `https://fixmynight-api-production.up.railway.app`

---

## Client Portal Redesign — After Phase 5 (2026-03-04)

**Decision:** After Phase 5 testing is complete, the client portal will be redesigned with a professional look before taking on new clients beyond Stellar HVAC. The current placeholder styling (text logo, basic gray/blue Tailwind) is functional for testing but not client-ready.

**Rationale:** The priority is proving the core product works end-to-end with Stellar HVAC. Visual polish is wasted effort until the functionality is validated. Once Phase 5 confirms everything works, the portal gets a proper design pass before onboarding additional clients.

**Impact:** No spec or code changes now. Phase 5 testing proceeds with current styling. Design work is a separate effort after Phase 5 sign-off.

---

## Self-Service Client Onboarding — Future Feature (2026-03-04)

**Decision:** Self-service client onboarding (public sign-up page, Stripe payment integration, automated provisioning without admin intervention) is planned as a future feature after the core product is proven with Stellar HVAC.

**Rationale:** V1 is an admin-onboarded system by design. The admin manually creates clients, provisions Twilio numbers, and sends portal magic links. This is appropriate for early-stage validation with a single client. Self-service onboarding introduces significant complexity (payment processing, automated provisioning error handling, abuse prevention, pricing tiers) that is not justified until product-market fit is confirmed. Building it now would delay launch for a feature that may need to be redesigned based on learnings from the first client.

**Impact:** No spec or code changes now. The current admin onboarding flow (`POST /api/v1/admin/clients`) remains the sole client creation path. Self-service onboarding will be scoped as its own project when the time comes.

---

## URL Restructure: FixMyDay Brand + FixMyNight Product Routes (2026-03-04)

**Decision:** All FixMyNight application routes move under the `/fixmynight/` prefix. Public brand pages (`/`, `/legal`, `/privacy`, `/terms`, `/fixmynight`) are added at the root level. The catch-all redirect changes from `/admin` to `/`.

**Rationale:** fixmyday.ai is the parent brand with multiple potential tools. FixMyNight is one product under the brand umbrella. The URL structure needs to reflect this hierarchy so that the root domain serves the FixMyDay.ai brand landing page, each product lives under its own prefix (`/fixmynight/...`), and future products can be added under their own prefixes without conflicts.

**Route changes:**
- `/admin/*` → `/fixmynight/admin/*`
- `/portal/*` → `/fixmynight/portal/*`
- `*` catch-all → redirects to `/` (landing) instead of `/admin`
- New public routes: `/`, `/legal`, `/privacy`, `/terms`, `/fixmynight`

**Implementation details:**
- Route constants centralized in `frontend/src/routes.ts` to avoid scattered hardcoded paths
- New `PublicLayout.tsx` component for marketing pages (separate from app Layout)
- Backend magic link URL updated to include `/fixmynight/` prefix
- Landing page content ported from root `index.html` into React + Tailwind
- No API endpoint changes (all backend routes remain under `/api/v1/`)

**Impact:** Frontend route restructure + one backend line change (magic link URL). No database, Vapi, or API changes.

Note: Other spec files (FRONTEND-SPEC, BACKEND-SPEC, MASTER-SPEC, QA-AND-LAUNCH, CLAUDE-SESSION-GUIDE, DEPLOYMENT-SPEC) were updated to reflect the /fixmynight/ prefix on 2026-03-04.

---

### Decision: Technician Auto-Verification on First SMS Command

**Date:** 2026-03-04
**Context:** The spec says `phone_verified` should be set to TRUE after successful delivery of the verification SMS at onboarding time. However, successful Twilio delivery does not confirm the human received the message — only that the carrier accepted it.

**Decision:** Technicians auto-verify on their first valid SMS command (ON, OFF, or STATUS). When an unverified tech sends a recognized command, the SMS handler sets `phone_verified=True` and `verified_at=now()` before processing the command. This provides stronger proof of phone ownership than delivery receipts.

**Implementation:**
- `app/routers/sms.py`: Queries include unverified techs. If `phone_verified == False` and the command is valid, sets `phone_verified=True` before processing.
- Onboarding, admin add-tech, and portal add-tech endpoints send a verification SMS but do NOT set `phone_verified=True` on send.
- The verification SMS text tells the tech to reply ON to go on-call, which triggers auto-verification.

**Impact:** No functional difference for the end user. Tech receives verification SMS → replies ON → gets verified + goes on-call in a single action. Spec should be updated to reflect this behavior.

---

### Decision: Morning Summary Dual Delivery (Email + SMS)

**Date:** 2026-03-04
**Context:** Spec says morning summary can be delivered via email, SMS, or both. Original implementation used either/or (if/else).

**Decision:** Morning summary now sends email to `contact_email` (if set) AND SMS to all `admin_sms_numbers` (if configured). If neither is available, falls back to owner_phone via SMS. Delivery field logs `"email+sms"` when both are used.

---

### Decision: Contact Email

**Date:** 2026-03-04
**Context:** Public legal/privacy/terms pages need a contact email for A2P 10DLC compliance.

**Decision:** Public-facing contact email is `fixmyday@use.startmail.com`. SendGrid transactional email remains `noreply@fixmyday.ai`.

---

### Decision: Per-Day Business Hours (Deferred)

**Date:** 2026-03-05
**Context:** The current system uses a single `business_hours_start`/`business_hours_end` pair for all business days. Some clients have different hours on different days (e.g. Monday 8AM–6PM, Saturday 8AM–12PM, Sunday closed).

**Decision:** Deferred until after Phase 5 launch. Current single-time approach works for v1.0 clients. A future update should support per-day hours. This requires changes to: database schema (`business_hours_start`/`business_hours_end` becomes a JSONB object keyed by day), `time_window.py` logic, `prompt_builder.py`, frontend forms (`ClientNew`, `ClientDetail`, `PortalSettings`), and `VAPI-PROMPT-SPEC`. Workaround: clients can set `business_days` to exclude Saturday if their Saturday hours are significantly different.

---

### Decision: Admin Operations Dashboard (Deferred)

**Date:** 2026-03-05
**Context:** The system relies on multiple third-party services (Twilio, Railway, Vercel, Vapi, SendGrid), each with usage limits and billing. Hitting a limit unexpectedly could cause service disruptions.

**Decision:** After launch, build an admin operations panel that monitors third-party service usage and billing across all providers:

- **Twilio:** SMS segment count, voice minutes used, current balance, numbers provisioned
- **Railway:** CPU/memory usage, database size, bandwidth
- **Vercel:** bandwidth, build minutes, deployment count
- **Vapi:** minutes used, assistant count
- **SendGrid:** emails sent, daily limit remaining

Each service should show: current usage, plan limits, percentage used, and a warning threshold (e.g. alert at 80% of limit). This prevents service disruptions from hitting limits unexpectedly. Could pull from each provider's API.

**Priority:** Post-launch, after 5+ active clients. For now, manually monitor dashboards.

---

### Decision: Persistent Auth for PWA (Deferred to V2)

**Date:** 2026-03-06
**Context:** The FixMyNight client portal is installable as a PWA. Currently, auth tokens are stored in Zustand (memory-only). When a client opens the PWA from their home screen, they must log in every time because the token is lost when the app is closed or the browser tab is recycled.

**Decision:** Deferred. V1 uses memory-only auth. V2 should implement persistent auth — storing the JWT in `localStorage`, a secure cookie, or encrypted storage — so clients stay logged in across app launches. The current re-login-every-time behavior is acceptable for launch but will hurt adoption if not addressed.

**Considerations for V2 implementation:**
- `localStorage` is simplest but tokens are accessible to XSS. Acceptable if the portal has no user-generated content injection vectors.
- `httpOnly` cookie set by the backend is more secure but requires CORS/cookie configuration changes.
- Token refresh (silent re-auth before expiry) should be added alongside persistent storage.
- Current JWT expiry is 24 hours. With persistent storage, this becomes the maximum session duration.

---

---

## Phase 5 Work — March 7–8, 2026

Major debugging, feature additions, and infrastructure work during Phase 5 testing.

### SMS Infrastructure & A2P Compliance (March 7)

1. **Twilio SMS webhook signature validation failure:** Railway sits behind a reverse proxy, so `request.url` returned the internal Railway hostname instead of the public URL. Twilio's signature validation uses the public URL. Fixed by reconstructing the URL from `X-Forwarded-Proto` and `Host` headers.

2. **Inbound SMS tested and passing:** ON, OFF, STATUS commands all work. Tech auto-verification on first valid command confirmed working.

3. **SMS compliance page deployed:** Created `/sms` public page for A2P 10DLC campaign requirements. Includes program description, opt-in/out instructions, message frequency, HELP/STOP keywords, carrier disclaimer.

4. **A2P campaign resubmission:** Previous campaign was rejected because CTA, Privacy URL, and Terms URL were set to `example.com`. Resubmitted with corrected URLs pointing to fixmyday.ai. Approval pending (1–3 business days). Outbound SMS blocked until approved.

### Transcript Analysis: OpenAI → Anthropic (March 7)

**Decision:** Switched the post-call transcript analysis from OpenAI GPT-4o-mini to Anthropic Claude Haiku (`claude-haiku-4-5-20251001`).

**Rationale:** The webhook handler analyzes call transcripts to extract structured data (call type, caller name, issue summary, etc.) from Vapi's end-of-call-report. Claude Haiku is faster, cheaper, and produces more accurate structured JSON extraction than GPT-4o-mini for this use case. Added `ANTHROPIC_API_KEY` to Railway environment variables.

**Implementation:** `app/routers/webhooks.py` — replaced `openai.ChatCompletion.create()` with `anthropic.Anthropic().messages.create()`. Same JSON schema prompt, same extraction fields.

### Morning Summary Fixes (March 7)

- **Unknown/failed calls:** Calls that couldn't be classified (transcript analysis failed, no call_type set) were showing as "hangups" in the morning summary. Fixed to show as "unprocessed" with a note that the call needs manual review.

### Vapi Configuration Fixes (March 7–8)

1. **$189 → $150 fee regression:** The Vapi assistant had a static `firstMessage` that said "$189" (from early testing) instead of using the dynamic `{emergency_fee}` from the client's database record. The static config was overriding the webhook-built prompt. Fixed by ensuring the webhook handler always sends the dynamically-built prompt.

2. **Transfer regression — empty tools array:** The static Vapi assistant config had `model.tools: []` which overrode the tools sent by the webhook. Emergency transfers were silently failing because the assistant had no `transferCall` tool. Fixed by removing the static tools override.

3. **Emergency transfer no-answer behavior:** When Bob (on-call tech) doesn't answer, the warm-transfer-experimental transferAssistant was set to `firstMessageMode: "assistant-speaks-first"`, causing it to immediately talk when voicemail connects and falsely mark the transfer as successful. Changed to `assistant-waits-for-user` with improved voicemail detection prompt. Reduced `maxDurationSeconds` from 45→30, `silenceTimeoutSeconds` from 15→10.

### Webhook Handler Fixes (March 8)

1. **`flagged_urgent` not auto-set for emergencies:** Old logic only flagged sleep+emergency or business_hours+emergency edge cases. Changed to `flagged_urgent = call_type == "emergency" or is_emergency` — all emergencies are flagged regardless of time window.

2. **Transfer metadata missing:** `transferred_to_phone` and `transferred_to_tech_id` were not being stored in end-of-call-report handler. Added on-call tech lookup when `is_transfer` is True.

3. **`duration_seconds` always null:** Added debug logging to identify whether Vapi's end-of-call-report includes `startedAt`/`endedAt`. Timing fields found in `call` object.

4. **`recording_url` capture:** Added `recording_url` column to `calls` table and SQLAlchemy model. Wired into webhook handler to extract from `artifact.recordingUrl` or `call.recordingUrl`. Backfilled all 9 existing calls from Vapi API.

### Client Portal Fixes & Features (March 8)

1. **Blank dashboard fix:** Backend `DashboardResponse` returned 5 flat fields but frontend expected `on_call_tech: {name, since}`, `twilio_number`, `settings_summary`, `stats_7d`. Rewrote backend endpoint to compute 7-day stats with SQLAlchemy aggregates, settings summary, and on-call tech info. Added new Pydantic schemas: `OnCallTechSummary`, `SettingsSummary`, `Stats7d`.

2. **Forgot Password flow:** New `POST /api/v1/auth/portal-forgot-password` endpoint. Reuses existing magic link infrastructure (JWT token, SendGrid email, PortalSetup page). Added `?reset=true` param for conditional UI text ("Reset Your Password" vs "Welcome"). Rate limited 3/15min. Always returns 200 to prevent email enumeration. New `PortalForgotPassword.tsx` page.

3. **Audio playback in Call History:** New `PlayButton.tsx` component for compact play/pause buttons. Inline HTML5 `<audio>` player with controls in expanded call rows. Added Recording column to table. Fixed audio controls: removed `h-8` height constraint (clipped native controls), changed `preload="none"` to `preload="metadata"` for duration display.

4. **Call History date filter fix:** Two-part fix:
   - Frontend: Added `dateRangeComplete` guard — only sends dates to API when both From and To are set. Previously, setting just one date triggered an API call with partial params.
   - Backend: Changed raw string comparison to parsed datetime objects. `datetime.strptime(date_from, "%Y-%m-%d")` and end-of-day for `date_to`. PostgreSQL can't implicitly cast `"2026-03-06"` string to compare against `DateTime(timezone=True)` column.
   - Error clearing: Added `setError('')` to filter onChange handlers so error state clears when filters change.

5. **Settings auto-save crash fix:** `onBlur={handleBlurSave}` on the root `<div>` auto-saved on every field blur, sending partial/invalid data. After successful PATCH, `setSettings(response)` replaced the Client object with `{"status": "updated"}`, causing `settings.business_days.includes()` → TypeError → white screen. Fixed by: removing auto-save entirely (save only on button click), not overwriting local state with PATCH response, adding dismissible error banner for failed saves.

6. **Portal password set:** `portal_password_hash` was null for Stellar HVAC. Set password `StellarHVAC2026!` directly via bcrypt hash in DB.

7. **Client Portal link on product page:** Added "Client Portal" button to CTA section and footer of FixMyNight product page.

### Source Control (March 8)

- Set up GitHub remote: private repo `wdgrasham/FixMyNight`
- Committed all Phase 5 work (96 files, 13K+ lines)
- Cleaned secrets from git history (Twilio account IDs in `vapi_call_detail.json`) using `git filter-branch`
- Updated `.gitignore` to exclude debug dumps, zip files, saved HTML pages

### Session: March 8 (continued)

#### Bug Fixes — Webhook & Transfer (commits d8de32d through d536532)

1. **Transferred call data loss (critical):** `handle_transfer()` created a call record early with tech info but no duration/recording/transcript. `end-of-call-report` found the existing record and skipped entirely. Fix: end-of-call-report now UPDATES existing records instead of skipping — enriches them with duration, recording_url, transcript analysis, and corrects `transfer_success` from Vapi's `ended_reason`.

2. **Emergency transfer no-answer — caller dropped in silence (critical):** Root cause was multi-layered:
   - `transfer-destination-request` handler returned a bare destination without `transferPlan`, bypassing warm transfer config entirely
   - Vapi's `request-failed` tool message never fired because the transfer wasn't using the tool-level config
   - Fix: three-layer approach — (a) `fallbackPlan.message` in transferPlan for auto-play on failure with `endCallEnabled: true`, (b) `summaryPlan` to inject transfer outcome context into Sarah's conversation, (c) prompt reinforcement telling Sarah to speak IMMEDIATELY if she regains control after a transfer
   - Both code paths (tool-level destinations AND `transfer-destination-request` response) now include full `transferPlan` with warm-transfer-experimental, voicemail detection, fallbackPlan, and summaryPlan

3. **`flagged_urgent` not auto-set:** Changed to `flagged_urgent = call_type == "emergency" or is_emergency` — all emergencies flagged regardless of time window.

4. **Failed emergency transfer SMS alert:** When end-of-call-report detects an emergency call where dispatch was available but transfer didn't succeed, sends SMS to all `admin_sms_numbers` with caller name, phone, issue summary, and "Please call back ASAP."

5. **Vapi `request-failed` message updated:** Reassures caller their info was captured and an alert was sent, ends with "Have a good night" to trigger `endCallPhrases` hangup. `endCallAfterSpokenEnabled: True` as backup.

6. **Sarah's prompt updated:** After failed transfer, Sarah speaks the failure script immediately without waiting for the caller. No number confirmation, no message-taking, no follow-up questions. Info was already collected before the transfer attempt.

#### Forgot Password (commit d574e7c, b1ab1b1)

1. **Client portal:** `PortalEntry.tsx` had "Forgot password? Contact your FixMyNight administrator." as plain text. Changed to a clickable link to `/fixmynight/portal/forgot-password`. The forgot password page and backend endpoint already existed from earlier in the session.

2. **Admin portal (new):** Full forgot password flow added:
   - `SystemSetting` model + `system_settings` table (auto-created on startup) stores admin password hash override in DB
   - Admin login checks DB override first, falls back to `ADMIN_PASSWORD_HASH` env var
   - `POST /api/v1/auth/admin-forgot-password` — rate-limited 3/15min, sends reset link via SendGrid to `ADMIN_EMAIL` env var, always returns 200 (anti-enumeration)
   - `POST /api/v1/auth/admin-set-password` — validates 1-hour token, upserts hash to `system_settings`, returns JWT
   - New pages: `AdminForgotPassword.tsx`, `AdminResetPassword.tsx`
   - "Forgot password?" link added to admin login page
   - Requires `ADMIN_EMAIL` env var in Railway

#### Railway Deployment Fix

Railway backend was crashing with `ProgrammingError: foreign key constraint "jobs_client_id_fkey" cannot be implemented` — an old V1.4 `jobs` table with SERIAL PKs being created by a stale `Base.metadata.create_all()` call that no longer exists in the codebase. The deployed code on Railway was from a cached/stale build that didn't match the GitHub repo.

**Fix:** Redeployed via `railway up` which uploads the local codebase directly.

**Going forward:** Always run `railway up` after pushing to GitHub to ensure Railway has the latest code, OR configure Railway to auto-deploy from the `wdgrasham/FixMyNight` GitHub repo (Settings → Source → Connect GitHub repo → select branch `master`).

---

## Outstanding Items — Next Session Priorities

### Bugs (Must Fix Before Launch)

| # | Bug | Status |
|---|-----|--------|
| 1 | Emergency transfer → no answer → caller in silence | Three-layer fix deployed (fallbackPlan, summaryPlan, prompt). Needs verification with live call. |
| 2 | `flagged_urgent` not auto-set for emergency calls | Fixed. Needs verification with new calls. |
| 3 | `transferred_to_phone` / `transferred_to_tech_id` not stored | Fixed. Needs verification with new calls. |
| 4 | `duration_seconds` always null | Fixed (end-of-call-report now updates existing records). Needs verification with new calls. |

### Blocked

| Item | Blocker |
|------|---------|
| Outbound SMS (tech notifications, admin alerts, morning summary SMS) | A2P 10DLC campaign approval pending (1–3 business days) |

### Remaining Phase 5 Tests

- Wrong number call scenario
- Hangup call scenario (caller hangs up during greeting)
- Morning summary email accuracy check (compare against 9-call database list)
- Full emergency dispatch cycle: call → fee → approval → transfer → success → summary
- Sarah voice script refinements (if needed after test calls)
- Verify portal forgot password end-to-end (reset email sent to stellarhvac@use.startmail.com)
- Verify admin forgot password end-to-end

### Deferred Items

- Per-day business hours (different hours per day of week) — post-launch
- Recording decision: keep enabled, keep disclosure, don't build playback UI beyond current QA tool
- Client portal link on main site navigation — requested, verify deployed
- Configure Railway auto-deploy from GitHub repo

---

## Session: March 9, 2026

### Vapi Cost Tracking (commits 8612579, 865bacf)

Added end-to-end Vapi cost tracking:

1. **Webhook ingestion:** `end-of-call-report` handler extracts `costBreakdown.total` (USD) from Vapi payload. Stored in `calls.vapi_cost` column (`DECIMAL(10,4)`).
2. **Startup migration:** `ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_cost DECIMAL(10,4)` runs on app startup.
3. **Admin client list:** New "Cost (MTD)" column shows month-to-date Vapi cost per client (sum of `vapi_cost` for calls created since the 1st of the current month).
4. **Client detail page:** New "Vapi Usage & Cost" panel shows current and previous month breakdowns — total calls, total minutes (from `duration_seconds`), total Vapi cost. New endpoint `GET /api/v1/admin/clients/{id}/cost-stats`.
5. **Schema:** `vapi_cost` added to `CallResponse` Pydantic model.

### Pricing Decisions

Locked in three subscription tiers:

| Tier | Price | Calls Included |
|------|-------|---------------|
| Starter | $89/mo | 40 |
| Standard | $169/mo | 100 |
| Pro | $299/mo | 250 |

Stripe Price IDs (test mode):
- Starter: `price_1T8vmdF4SIXUt9Gk4fwXzQZH`
- Standard: `price_1T8vnEF4SIXUt9Gk1AmWw7X0`
- Pro: `price_1T8vnnF4SIXUt9GkUAZEokFf`

### Stripe Subscription Billing (commits 076fe43, 6024921, 8f0d6d4, e6a371a, b6ca053, f49c465)

Built Stripe Checkout integration (test mode):

1. **Backend router:** `app/routers/stripe_billing.py`
   - `POST /api/v1/stripe/create-checkout-session` — accepts `price_id` (and optional `client_id`), creates Stripe hosted checkout session with custom fields (business name, owner name) and phone number collection. Returns checkout URL.
   - `POST /api/v1/webhooks/stripe` — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` events.
   - `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` added to Railway env vars.

2. **Database columns:** Added `stripe_customer_id`, `stripe_subscription_id`, `subscription_tier`, `subscription_status` to `clients` table (startup migration).

3. **Pricing section on product page:** Three tier cards embedded on `/fixmynight` product page before SMS Consent section. Anchor nav link "Pricing" for smooth scroll. Light theme (white cards, amber accents). Hover lift animation (translateY -8px, 300ms ease-out, enhanced shadow). Standard card marked "Most Popular" with amber border.

4. **`/fixmynight/pricing` route:** Redirects to `/fixmynight#pricing` so direct links still work.

5. **Post-checkout scroll:** Frontend auto-scrolls to `#pricing` section when returning from Stripe with `?checkout=success` or `?checkout=canceled` query params (hash fragments are stripped by Stripe redirect).

6. **Bug fix — env var mismatch:** Pricing section used `VITE_API_URL` (undefined) instead of `VITE_API_BASE_URL`, causing fetch to hit Vercel origin instead of Railway backend. Fixed to match existing `api.ts` pattern.

7. **Bug fix — `customer_creation`:** `customer_creation: "always"` is only valid in Stripe's `payment` mode, not `subscription` mode. Removed. Stripe always creates a customer for subscriptions.

8. **Bug fix — duplicate phone field:** Removed `owner_phone` custom field from checkout (Stripe already collects phone via billing/Link). Added `phone_number_collection: {enabled: true}`. Webhook pulls phone from `customer_details.phone` instead of custom fields.

### Semi-Automatic Client Onboarding (commits 350e32f, 11e20ce, 247c563)

Built automated new-client flow triggered by Stripe checkout:

**Checkout → Webhook → Client Record → Emails:**

1. Stripe checkout collects: business name (custom field), owner name (custom field), email (billing), phone (Stripe phone collection).
2. `checkout.session.completed` webhook auto-creates client with `status: "pending_setup"`, random portal password, Stripe IDs linked.
3. Welcome email sent to customer via SendGrid: "Your subscription is active, setup within 24 hours."
4. Admin notification email sent to `ADMIN_EMAIL`: business name, owner, email, phone, tier, setup checklist.

**Admin Completes Setup → Portal Invite:**

5. Admin sees "Pending Setup" badge (orange) on client list, assigns Twilio number, configures settings.
6. When admin changes status from `pending_setup` → `active`, automatically sends portal magic link email with Twilio number and login instructions.

**StatusBadge** updated: `pending_setup` → orange "Pending Setup" label.

**New client statuses:** `pending` | `pending_setup` | `active` | `inactive` | `failed`

---

## Outstanding Items — Next Session Priorities

### Bugs (Must Fix Before Launch)

| # | Bug | Status |
|---|-----|--------|
| 1 | Emergency transfer → no answer → caller in silence | Three-layer fix deployed (fallbackPlan, summaryPlan, prompt). Needs verification with live call. |
| 2 | `flagged_urgent` not auto-set for emergency calls | Fixed. Needs verification with new calls. |
| 3 | `transferred_to_phone` / `transferred_to_tech_id` not stored | Fixed. Needs verification with new calls. |
| 4 | `duration_seconds` always null | Fixed (end-of-call-report now updates existing records). Needs verification with new calls. |

### Blocked

| Item | Blocker |
|------|---------|
| Outbound SMS (tech notifications, admin alerts, morning summary SMS) | A2P 10DLC campaign approval pending |

### Remaining Phase 5 Tests

- Wrong number call scenario
- Hangup call scenario (caller hangs up during greeting)
- Morning summary email accuracy check
- Full emergency dispatch cycle: call → fee → approval → transfer → success → summary
- Sarah voice script refinements (if needed after test calls)
- Verify portal forgot password end-to-end
- Verify admin forgot password end-to-end

### Stripe & Billing — Next Steps

- Set up Stripe webhook endpoint in Stripe dashboard → `https://fixmynight-api-production.up.railway.app/api/v1/webhooks/stripe`
- Set `STRIPE_WEBHOOK_SECRET` env var on Railway with the signing secret
- Test full checkout flow end-to-end (checkout → webhook → client created → emails sent)
- Switch Stripe from test mode to live mode when ready for production

### Deferred Items

- Per-day business hours (different hours per day of week) — post-launch
- Admin service monitoring dashboard (Vapi/Twilio/Anthropic/Railway/Stripe balances)
- Monthly client value summary email with ROI calculation
- Configure Railway auto-deploy from GitHub repo
- Overage billing ($1.50/call over plan limit) — track but don't enforce yet

---

*This document is the authoritative record of all V1.5 and V1.6 decisions. Any implementation that contradicts this document contains an error. Last updated: 2026-03-09.*
