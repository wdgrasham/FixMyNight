# CLAUDE-CODE-STARTUP.md
# FixMyNight — Claude Code Session Startup & Recovery Guide
# Paste this at the start of every Claude Code session.

---

## What You Are Building

You are building FixMyNight — an AI-powered after-hours answering system for
service contractors and trade businesses. Any trade — HVAC, plumbing, electrical,
locksmith, and more. An AI voice agent (default name Sarah, configurable per
client) answers after-hours calls, determines caller intent, and handles the
call appropriately: dispatching on-call technicians for emergencies, logging
routine calls for morning callbacks, taking messages, and screening junk calls.
Emergency dispatch is opt-in; the baseline product is smart after-hours call
handling with morning summaries. Contractors manage on-call status by texting ON/OFF.

The first client is Stellar HVAC. The product lives at fixmyday.ai.

This is a multi-tenant SaaS system. Every client business is a fully isolated tenant.

---

## The 8 Specification Documents

Everything you need to build is defined in these 8 documents. Read them before
writing any code. They are the source of truth — not your assumptions.

| File | Read When |
|------|-----------|
| `MASTER-SPEC.md` | First — system overview, call flow, all logic |
| `DATABASE-SCHEMA.md` | Before touching the database |
| `BACKEND-SPEC.md` | Before writing any Python/FastAPI code |
| `VAPI-PROMPT-SPEC.md` | Before touching Vapi |
| `FRONTEND-SPEC.md` | Before building any UI |
| `DEPLOYMENT-SPEC.md` | Before deploying anything |
| `QA-AND-LAUNCH.md` | Before calling anything done |
| `DECISIONS-AND-CHANGES.md` | If you need to understand why something was designed a certain way |

---

## Infrastructure

| Service | Provider | Status |
|---------|---------|--------|
| Backend API | Railway (FastAPI, Python 3.11) | Exists — may need rewrite |
| Database | Railway PostgreSQL | Exists — may need migration |
| Frontend | Vercel (fixmyday.ai) | Exists — needs refresh |
| Domain | Porkbun (fixmyday.ai) | Live |
| Voice AI | Vapi | Assistant exists — needs prompt update |
| Phone / SMS | Twilio | Account active, number live |
| Email | SendGrid | Needs setup |

---

## Critical Architecture Rules

Never violate these. They are locked decisions.

1. **All primary keys are UUID.** Never SERIAL or integer PKs. Use `gen_random_uuid()`.
2. **Single `audit_logs` table.** JSONB metadata, event-log style. No `audit_log` (singular) table.
3. **`admin_sms_numbers` is a JSONB array.** Never a comma-separated string. Always `json.loads()`.
4. **Transfer before DB write.** In the Vapi webhook, attempt the emergency transfer FIRST,
   then write the call record. A DB failure must never block a live transfer.
5. **Three time windows per client:** `business_hours`, `evening`, `sleep`.
   Sleep window has highest priority and applies every day of the week.
   See MASTER-SPEC.md — Time Window Logic for the full decision tree and reference Python.
6. **Always-on system.** FixMyNight never checks the clock to decide whether to answer.
   The contractor controls call routing via their own call forwarding. The agent runs the
   same flow whenever a call arrives — time window affects behavior, not whether the agent answers.
7. **No prescriptive safety advice.** The AI agent does not tell callers to leave their
   building, turn off valves, or take specific safety actions. For all emergency calls,
   the agent gives one soft disclaimer: "If you feel the situation may be unsafe, please
   don't hesitate to contact your local emergency services." Then proceeds with normal
   dispatch flow. This applies regardless of what the caller describes. FixMyNight is an
   answering service, not an emergency response authority.
8. **One on-call tech per client.** Enforced by partial unique index in DB.
   Backend must set current on-call to FALSE before setting new one to TRUE.
9. **Unknown SMS senders: silent ignore.** No reply, no error, no log entry.
10. **JWT errors:** `ExpiredSignatureError` → `SESSION_EXPIRED`. All other `JWTError` → `TOKEN_INVALID`.
    These must be caught separately.

---

## Build Order

Work through phases in this exact order. Do not skip ahead.
Complete each phase fully before starting the next.

### Phase 1: Database
- Read DATABASE-SCHEMA.md completely
- Check if Railway PostgreSQL has existing tables
- If tables exist: compare against spec, write migration to fix discrepancies
- If no tables: run the full migration script from DATABASE-SCHEMA.md
- Run validation queries from DATABASE-SCHEMA.md to confirm correctness
- Insert Stellar HVAC seed data (confirm values first)
- **Done when:** All 6 tables exist with correct schema, validation queries all pass

### Phase 2: Backend
- Read BACKEND-SPEC.md completely
- Read MASTER-SPEC.md — Time Window Logic section
- Build or rewrite FastAPI app using the project structure in BACKEND-SPEC.md
- Implement in this order:
  1. Database models and connection
  2. Auth (JWT creation, decode, dependencies)
  3. Admin endpoints
  4. Portal endpoints
  5. Vapi webhook handler (handle_transfer and handle_log_call)
  6. Twilio SMS webhook handler
  7. Services (time_window, prompt_builder, vapi, twilio, onboarding, email)
  8. Cron jobs (morning_summary, oncall_reminder)
  9. Rate limiting
- Deploy to Railway
- Confirm `/health` returns 200
- **Done when:** All endpoints respond, webhook handlers receive test payloads correctly

### Phase 3: Vapi Assistant Update
- Read VAPI-PROMPT-SPEC.md completely
- Get Stellar HVAC's existing Vapi assistant ID (ask user to provide from Vapi dashboard)
- Run `build_sarah_prompt()` with Stellar HVAC's values from DB
- PATCH the existing assistant with new prompt and tool definitions
- Confirm both tools (transferCall, logCall) are correctly configured
- **Done when:** Test call to Twilio number — the AI agent answers, recording disclosure first,
  logCall webhook fires and appears in Railway logs

### Phase 4: Frontend
- Read FRONTEND-SPEC.md completely
- Build admin portal: login, dashboard, client list, onboarding form, client detail
- Build client portal: login, first-time setup, dashboard, calls, settings, team
- Wire all API calls to Railway backend
- Handle JWT state (in-memory only — no localStorage)
- Handle all error codes from BACKEND-SPEC.md error reference
- Deploy to Vercel
- **Done when:** Admin can log in, onboard a client, trigger portal magic link.
  Client can log in and see their dashboard.

### Phase 5: Wire & Test
- Set Twilio SMS webhook to Railway backend URL
- Confirm Vapi webhook URL and secret match
- Run through QA-AND-LAUNCH.md hard block test scenarios
- Fix any failures before proceeding
- **Done when:** All hard block tests in QA-AND-LAUNCH.md pass

---

## Current Status
<!-- UPDATE THIS SECTION AT THE END OF EVERY SESSION -->
<!-- Be specific — what files exist, what endpoints work, what's been tested -->

**Last updated:** 2026-03-08

**Pre-Phase: Spec Audit:** [X] Complete
Notes: V1.5 cross-document audit completed (49 issues). V1.6 changes applied:
universal trade support, redesigned call flow with intent routing, safety
override eliminated, cron batch optimization, 11 architectural decisions locked.
See DECISIONS-AND-CHANGES.md for full record.

**Phase 1 — Database:** [X] Complete
Notes: Old V1.4 tables dropped (SERIAL PKs, wrong schema). All 6 V1.6 tables
created with UUID PKs, correct indexes, partial unique constraint. 19/19
validation queries pass. Stellar HVAC seed data inserted with confirmed values.
Client ID: 49855f38-6fa3-4202-ab19-a242028ec369.

**Phase 2 — Backend:** [X] Complete
Notes: 25 backend files across 7 milestones. FastAPI app with auth, 5 routers
(auth, admin, portal, webhooks, sms), 6 services, 2 cron jobs, rate limiting.
Deployed to Railway at https://fixmynight-api-production.up.railway.app.
Health returns 200, admin login works, Stellar HVAC returned from API.
Deployment fixes: Python 3.11 pin, DATABASE_URL conversion, SQLAlchemy imports,
AuditLog.metadata reserved name, bcrypt compatibility. All env vars set.

**Phase 3 — Vapi:** [X] Complete
Notes: V1.6 evening-window prompt pushed to assistant ecf217ee-e72a-4d75-b40b-c20efd10a38f.
22/22 verification checks passed. Tools (transferCall, logCall) inside model.tools.
Server URL set to Railway webhook endpoint. Webhook secret configured (X-Vapi-Secret).
Stellar HVAC DB record updated with vapi_assistant_id. See DECISIONS-AND-CHANGES.md
for full deployment log.

**Phase 4 — Frontend:** [X] Complete
Notes: Admin portal and client portal built and deployed to Vercel at fixmyday.ai/fixmynight/.
Admin login, client list, onboarding form, client detail, portal login, dashboard, calls,
settings, and team pages all implemented. Wired to Railway backend API.
PWA manifest and service worker added. Client portal link on product page.

**Phase 5 — Wire & Test:** [~] In Progress
Notes (updated 2026-03-08):
- SMS webhook: signature validation fixed (reverse proxy URL reconstruction), ON/OFF/STATUS all pass
- A2P 10DLC: /sms compliance page deployed, campaign resubmitted (pending approval, blocks outbound SMS)
- Transcript analysis: switched from OpenAI GPT-4o-mini to Anthropic Claude Haiku
- Vapi fixes: $189→$150 fee regression, empty tools array, transfer no-answer behavior
- Webhook fixes: flagged_urgent, transfer metadata, recording_url capture (all deployed, need verification)
- Portal fixes: blank dashboard, forgot password, audio playback, date filter, settings auto-save crash
- 9 test calls in DB, all with recording URLs backfilled
- Source control: GitHub private repo wdgrasham/FixMyNight, all work committed and pushed
- **Remaining:** wrong number scenario, hangup scenario, morning summary accuracy check,
  full emergency dispatch cycle, transfer no-answer verification, duration_seconds verification

**Source Control:**
- GitHub: https://github.com/wdgrasham/FixMyNight (private)
- Branch: master
- Last commit: 2026-03-08 (Phase 5 checkpoint + secrets cleanup)

---

## Stellar HVAC — Known Values

These are the confirmed values for the first client. Use these in seed data and testing.

| Field | Value |
|-------|-------|
| Business Name | Stellar HVAC |
| Owner Name | Dan |
| Twilio Number | +1-979-652-5799 (TEST — confirm before production) |
| Timezone | America/Chicago |
| Emergency Enabled | TRUE |
| Emergency Fee | $150.00 |
| Business Hours | 8:00 AM – 6:00 PM, Monday–Friday |
| Sleep Window | 10:00 PM – 8:00 AM |
| Business Hours Emergency Dispatch | ON |
| Morning Summary Time | 7:30 AM |
| Callback Expected Time | 9:00 AM |

**Note:** All phone numbers marked TEST must be replaced with real production numbers
before go-live. Confirm with Dan before inserting seed data.

---

## Environment Variables Reference

All secrets live in Railway environment variables. Never in code.
Full descriptions in DEPLOYMENT-SPEC.md.

Required before backend will run:
- `DATABASE_URL` — auto-set by Railway PostgreSQL plugin
- `VAPI_API_KEY`
- `VAPI_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_DEFAULT_NUMBER`
- `JWT_SECRET`
- `JWT_ALGORITHM` = `HS256`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_PHONE`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `FRONTEND_URL`
- `ENVIRONMENT` = `production`

If any of these are missing, ask the user to set them in Railway before proceeding.

---

## How to Pick Up After a Lost Session

If you are starting a new session mid-project:

1. Read this file completely
2. Check the Current Status section above
3. Read the spec documents relevant to the current phase
4. Look at the existing codebase — read what's been built
5. Compare existing code against the relevant spec document
6. Identify the gap between what exists and what the spec requires
7. Continue from where the last session left off

Do not re-do work that already exists and matches the spec.
Do not make architectural decisions that contradict the spec — refer to
DECISIONS-AND-CHANGES.md if you need to understand why something was designed a certain way.

---

## When to Stop and Ask the User

Stop and ask the user (do not guess) when:
- A credential or API key is needed that isn't in environment variables
- The existing codebase has something that contradicts the spec and you need to know whether to overwrite it
- A test fails and you aren't sure if it's a spec issue or a build issue
- You need the Stellar HVAC Vapi assistant ID from their Vapi dashboard
- Any Railway or Vercel deployment step requires user action in a dashboard

For everything else: proceed autonomously, following the spec.

---

## What Done Looks Like

The system is complete when:

1. Admin logs into fixmyday.ai/fixmynight/admin with password
2. Admin sees Stellar HVAC in client list
3. Admin sends portal magic link to Dan's email
4. Dan clicks link, sets password, logs into fixmyday.ai/fixmynight/portal/{id}
5. Dan sees his dashboard: on-call status, recent calls, settings
6. Dan's tech texts ON to the Twilio number — on-call status updates in portal
7. Caller dials Stellar HVAC Twilio number after hours
8. Agent answers: "This call may be recorded for quality purposes..."
9. Emergency call: fee offered, approved, tech's phone rings
10. Next morning at 7:30 AM: Dan receives overnight summary email
11. Dan logs into portal, sees all calls from the night, makes his callbacks

That is the complete V1 product for Stellar HVAC.
