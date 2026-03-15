# FixMyNight — Claude Code Project Context

## What This Project Is

FixMyNight is an AI-powered after-hours answering system for service contractors
and trade businesses (HVAC, plumbing, electrical, locksmith, and more). An AI
voice agent (default name Sarah, configurable per client) answers after-hours
calls, determines caller intent, and handles the call: dispatching on-call
technicians for emergencies, logging routine calls for morning callbacks, taking
messages, and screening junk calls.

The first client is Stellar HVAC. The product lives at fixmyday.ai.

This is a multi-tenant SaaS system. Every client business is a fully isolated tenant.

## Specification Documents

All spec files live in `/specs/` at the project root. There are 9 files and they
are the **sole source of truth** for what gets built. Do not guess — read the spec.

| File | Purpose |
|------|---------|
| `MASTER-SPEC.md` | System overview, complete call flow, time window logic, all business rules |
| `DATABASE-SCHEMA.md` | PostgreSQL DDL, ORM expectations, indexes, seed data, validation queries |
| `BACKEND-SPEC.md` | FastAPI project structure, all endpoints, webhook handlers, cron jobs, services |
| `VAPI-PROMPT-SPEC.md` | AI voice agent prompt template, tools, assistant config, prompt builder logic |
| `FRONTEND-SPEC.md` | Admin portal + client portal pages, fields, URL structure, state management |
| `DEPLOYMENT-SPEC.md` | Railway, Vercel, Twilio, Vapi, SendGrid setup and environment variables |
| `QA-AND-LAUNCH.md` | Every test scenario, pass/fail criteria, go/no-go launch checklist |
| `DECISIONS-AND-CHANGES.md` | Why things were designed this way — architectural decision log |
| `CLAUDE-SESSION-GUIDE.md` | Session startup guide, build order, current status, Stellar HVAC values |

**Always read specs from disk** — never rely on cached versions. Specs may be
updated between sessions.

## Infrastructure

| Service | Provider | Purpose |
|---------|----------|---------|
| Backend API | Railway (FastAPI, Python 3.11) | Business logic, webhooks, cron |
| Database | Railway PostgreSQL | All persistent data |
| Frontend | Vercel | fixmyday.ai |
| Voice AI | Vapi (GPT-4o + ElevenLabs) | AI voice agent |
| Phone/SMS | Twilio | Inbound calls + SMS on-call management |
| Email | SendGrid | Morning summary delivery |

## 11 Architecture Rules — Never Violate These

1. **All primary keys are UUID.** Use `gen_random_uuid()`. Never SERIAL or integer PKs.
2. **Single `audit_logs` table.** JSONB metadata, event-log style. Not `audit_log` (singular).
3. **`admin_sms_numbers` is a JSONB array.** Never comma-separated. Always `json.loads()`.
4. **Transfer before DB write.** Emergency transfer attempt FIRST, then write the call record. A DB failure must never block a live transfer.
5. **Three time windows per client:** `business_hours`, `evening`, `sleep`. Sleep has highest priority. See MASTER-SPEC.md for the full decision tree.
6. **Always-on system.** FixMyNight never checks the clock to decide whether to answer. The contractor controls routing via their own call forwarding.
7. **No safety advice of any kind.** FixMyNight is an answering service, not a safety authority. No emergency services recommendation, no "leave your building," no "turn off valves." Empathy only: "I am sorry that you are having an issue."
8. **One on-call tech per client.** Enforced by partial unique index. Backend sets current on-call to FALSE before setting new to TRUE.
9. **Unknown SMS senders: silent ignore.** No reply, no error, no log entry.
10. **JWT errors:** `ExpiredSignatureError` → `SESSION_EXPIRED`. All other `JWTError` → `TOKEN_INVALID`. Must be caught separately.
11. **NEVER set `assistantId` on Vapi phone numbers.** The system uses `assistant-request` webhooks to dynamically generate prompts per-call based on client config, time window, and on-call status. Setting `assistantId` bypasses this entirely and breaks all dynamic behavior. The fallback assistant exists only as a Vapi-level fallback if the webhook fails — it must not be assigned to phone numbers.

## Build Phases

Work through in order. Do not skip ahead.

1. **Database** — Schema, migration, seed data, validation
2. **Backend** — FastAPI app, auth, endpoints, webhooks, services, cron
3. **Vapi** — Push V1.6 prompt to existing assistant, confirm tools
4. **Frontend** — Admin portal + client portal, wired to backend
5. **Wire & Test** — End-to-end QA against QA-AND-LAUNCH.md scenarios

## Key Patterns to Enforce

- `{agent_name}` is always dynamic — never hardcode "Sarah"
- 7 call types: `emergency`, `routine`, `message`, `wrong_number`, `hangup`, `business_hours_missed`, `unknown`
- `emergency_enabled` defaults FALSE — smart voicemail is baseline, dispatch is opt-in
- `clients.status` is TEXT (`pending`/`active`/`inactive`/`failed`) — not a boolean
- Morning summary groups: EMERGENCIES → CALLBACKS NEEDED → MESSAGES → "Also received" one-liner
- Vapi rebuild triggers: any change to the fields in `VAPI_REBUILD_TRIGGERS` set
- The `routing_rules` table is for cron jobs only — it does NOT gate call routing

## Current Status (2026-03-15)

All 5 build phases are **COMPLETE**. Product repositioned as 24/7 AI voicemail
replacement (not just after-hours). Stripe checkout working with new pricing.

**Deployed and working:**
- Dynamic per-call prompts via assistant-request webhook
- Three time windows: business_hours, evening, sleep
- Business hours: message-taking prompt (basic daytime tier, free for all plans)
- Evening: full AI assistant with emergency detection + dispatch
- Sleep: no transfers, urgent callback flagging
- SMS on-call management (ON/OFF/STATUS)
- Morning summary email (claim-before-send, date-bounded query)
- Missed call SMS notifications (configurable phone list)
- Client portal settings (business hours, sleep window, emergency fee, missed call phones)
- Transcript analysis: extract-only, never reclassifies by topic
- Anti-abuse with caller slang tolerance
- Prompt injection protection
- Stripe checkout ($99/$179/$399 tiers)
- Product page: social proof, ROI callout, speed/simplicity section

**Key patterns:**
- 7 call types: `emergency`, `routine`, `message`, `wrong_number`, `hangup`, `business_hours_missed`, `unknown`
- Basic daytime tier = message-only (no emergency detection, no transfer)
- Transcript analysis extracts and summarizes — never judges relevance

**Deferred to V1.1:** Interruption/endpointing, silence prompt sequencing.
**Deferred to V2:** Daytime upgraded tier (emergency detection, FAQ, scheduling).
See `OPEN-ITEMS.md` for full list.

## Custom Commands Available

Use `/project:fixmynight-audit` through `/project:fixmynight-phase` for spec
management. See `.claude/commands/` for all available commands.
