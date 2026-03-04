# MASTER-SPEC.md
# FixMyNight — System Master Specification
# Version: 1.6 | Status: Authoritative Source of Truth

---

## What FixMyNight Is

FixMyNight is an AI-powered after-hours answering system for service contractors and trade businesses. When a business forwards their phone to FixMyNight, an AI voice agent answers the call, determines what the caller needs, and handles it appropriately — dispatching the on-call technician for emergencies, logging routine calls for morning callbacks, taking messages, or screening junk calls.

**Core value proposition:** Contractors sleep through the night without missing emergencies or worrying about calls.

**V1 scope:** Any service trade (HVAC, plumbing, electrical, locksmith, pest control, roofing, appliance repair, general contracting, property management, and others). 1–5 technicians per client. After-hours coverage only. Texas market launch with Stellar HVAC as first client.

**Product home:** FixMyNight lives under fixmyday.ai as a standalone tool. As the product scales across trades, it can be spun off to its own domain without architectural changes.

---

## System Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| AI Voice Agent | Vapi (GPT-4o + ElevenLabs) | Answers calls, converses with callers, triggers transfer or log |
| Backend API | FastAPI (Python) on Railway | Business logic, webhook handling, SMS processing, cron jobs |
| Database | PostgreSQL on Railway | All persistent data |
| Phone Numbers | Twilio | Inbound call routing, SMS for tech on-call management |
| Frontend | Vercel (fixmyday.ai) | Admin onboarding portal, client self-service portal |
| Email Delivery | SendGrid (recommended) | Morning summary email to client |

**Architecture principle:** Vapi handles voice. FastAPI handles logic. PostgreSQL is the source of truth. These three never blur into each other's responsibilities.

---

## Multi-Tenant Architecture

Every client (service business) is fully isolated. Each client has:
- Their own Twilio phone number (callers dial this)
- Their own Vapi assistant (AI agent, configured with their specific settings)
- Their own technicians
- Their own call records
- Their own portal login
- Their own time window configuration

All primary keys are UUID. Client data is scoped by `client_id` on every query. A bug in scope checking exposes nothing guessable — UUID IDs are not enumerable.


---

## Industry Configuration

Each client has an `industry` field and an `industry_config` JSONB object that controls how the AI agent behaves for their specific trade. The system ships with default configs per industry. Every value is overridable per client at onboarding time.

**Industry config structure:**

| Key | Type | Purpose |
|-----|------|---------|
| `industry_label` | string | Display name (e.g. "HVAC", "Plumbing") |
| `emergency_examples` | string[] | What counts as an emergency for this trade |
| `routine_examples` | string[] | What counts as a routine call |
| `agent_name` | string | AI agent name, default "Sarah" |
| `service_noun` | string | e.g. "HVAC service", "plumbing service" |
| `tech_title` | string | e.g. "technician", "plumber", "electrician" |

**Shipped industry defaults:**

| Industry | Example Emergencies | Example Routine |
|----------|-------------------|----------------|
| HVAC | No heat in freezing, no cooling in extreme heat, water leak from unit | Scheduling maintenance, requesting quote |
| Plumbing | Burst pipe, no water to building, sewage backup, water heater failure | Scheduling repair, dripping faucet, slow drain |
| Electrical | Sparking from panel, burning smell from wiring, total power loss | Scheduling inspection, outlet not working |
| Locksmith | Locked out, broken lock, security breach | Key duplication, lock rekey scheduling |
| Pest Control | Active infestation, venomous spider/snake inside, bee nest blocking entry | Scheduling treatment, inspection question |
| Roofing | Active roof leak during rain, storm damage, tree on roof | Scheduling inspection, repair quote |
| Appliance Repair | Refrigerator dead (food spoiling), washing machine flooding, oven won't turn off | Scheduling repair, dishwasher question |
| General Contractor | Water damage requiring immediate repair, structural concern | Project consultation, bid request |
| Property Management | Tenant locked out, major water leak, no heat/cooling | Maintenance request, lease inquiry |
| General (default) | Caller explicitly states emergency or safety concern | Scheduling service, requesting quote |

If `industry_config` is empty (`{}`), the system loads shipped defaults for the client's `industry` value.

---

## Call Flow — Complete Logic

### Step 1: Call Arrives

A caller dials the contractor's Twilio number. Twilio routes to the Vapi assistant configured for that number. Vapi fires an `assistant-request` webhook to the FastAPI backend with Vapi's internal `phoneNumberId`.

Backend looks up the client by `vapi_phone_number_id` (mapped during onboarding when the Twilio number is imported into Vapi). If no client found, the backend returns an error and the call ends. For SMS webhooks, Twilio sends the E.164 number directly and the backend looks up by `twilio_number`.

### Step 2: Recording Disclosure + Greeting

The AI agent begins every call with:
1. "This call may be recorded for quality purposes."
2. "Thank you for calling {business_name}. This is {agent_name}."

### Step 3: Intent Detection (Smart)

After the greeting, the agent determines what the caller needs.

**Smart detection:** If the caller has already stated their purpose during or immediately after the greeting (e.g., "I have an emergency!" or "Just need to leave a message"), the agent proceeds directly to the appropriate branch — no intent question asked.

**Intent question:** If the caller hasn't stated their purpose, the agent asks:
"Are you calling about service, or would you just like to leave a message?"

### Step 4: Branch Based on Caller Response

```
├── SERVICE (caller describes a problem, wants scheduling, quote, etc.)
│     Collect name + phone number
│     Classify: emergency or routine
│     ├── EMERGENCY
│     │     Disclaimer: "If you feel the situation may be unsafe,
│     │       please don't hesitate to contact your local
│     │       emergency services."
│     │     Then → Step 5 (Time Window Evaluation + Emergency Subflow)
│     └── ROUTINE
│           Apply time window language (see Agent's Language by Window)
│           Log call with call_type = "routine"
│
├── MESSAGE (caller wants to leave info, not requesting service)
│     "Of course, go ahead and I'll make sure they get your message."
│     Listen and confirm the message back to caller
│     "Is there a name and number you'd like to leave in case
│      they need to reach you?"
│     (name + phone are OPTIONAL — caller may decline)
│     Log as call_type = "message"
│     No callback time promised
│
├── RETURN CALL ("I got a missed call from this number")
│     "This is the after-hours line for {business_name}.
│      We're a {service_noun} company. If someone from our team
│      called you, they'll be available during business hours.
│      Would you like to leave a message for them, or would
│      you like to schedule service?"
│     → Routes to SERVICE or MESSAGE branch
│
├── WRONG NUMBER (caller says "wrong number" or similar)
│     "No problem. Have a good night."
│     End call. Log as call_type = "wrong_number"
│
└── HANGUP / SILENCE / ROBOCALL
      Extended silence after greeting (5+ seconds) or automated recording
      One prompt: "Are you still there?"
      Wait 5 seconds → end call
      Log as call_type = "hangup"
```

### Step 5: Time Window Evaluation

Backend evaluates the current time in the client's timezone against three possible windows. This happens on every service call. Priority order: sleep window is checked first, then business hours, then evening window as default.

```
1. SLEEP WINDOW (highest priority)
   Condition: sleep_window_start is NOT NULL
              AND (current_time >= sleep_window_start OR current_time < sleep_window_end)
   Note: Applies every day of the week without exception.

2. BUSINESS HOURS
   Condition: current_day is in business_days
              AND current_time >= business_hours_start
              AND current_time < business_hours_end
   Note: Never triggers on days not in business_days.

3. EVENING WINDOW (default — everything else)
```

Sleep window always wins if active. Business hours only triggers on configured business days. Everything else is evening window including weekends during daytime hours.

### Step 6: Emergency Classification

Within any window, the agent classifies using the client's industry-specific emergency and routine examples from `industry_config`. If the caller describes something not on either list, the agent uses judgment: immediate risk to safety, property damage, or total loss of service → emergency. Otherwise → routine.

### Step 7: Window and Emergency Matrix

| Time Window | Emergency | Result |
|------------|-----------|--------|
| Business hours | Yes + dispatch toggle ON | Attempt live transfer |
| Business hours | Yes + dispatch toggle OFF | Flag urgent, SMS contractor, no transfer |
| Business hours | No | Log call, immediate SMS to contractor |
| Evening window | Yes | Disclaimer → Fee offer → approve → attempt transfer → fallback |
| Evening window | No | Log call, morning summary |
| Sleep window | Yes | Log urgent, SMS contractor, honest message to caller, no transfer |
| Sleep window | No | Log call, morning summary |

Note: `emergency_enabled` defaults to FALSE for new clients. Smart voicemail (call logging + morning summary) is the baseline product. Emergency dispatch is an opt-in feature.

### Step 8: Evening Window Emergency Subflow

Primary emergency path. Runs during evening window when `emergency_enabled = TRUE`.

```
Emergency detected + disclaimer delivered
    ↓
Is emergency_fee set on this client?
    ├── YES → Agent discloses the fee amount and requests verbal approval.
    │          (Fee disclosure only — FixMyNight does not collect payment.
    │          The contractor handles billing after service is rendered.)
    │          ├── Approved → proceed to transfer
    │          └── Declined → log call (fee_approved=FALSE), morning summary
    └── NO  → proceed to transfer immediately
    ↓
Find on-call tech
    ├── Tech exists AND phone_verified=TRUE → attempt Vapi transfer
    └── No verified on-call tech → skip to fallback
    ↓
Transfer attempt
    ├── Tech answers → transfer_success=TRUE, log call
    └── No answer (timeout ~30s) → fallback
    ↓
Fallback
    1. SMS all numbers in admin_sms_numbers:
       "Emergency call — [caller_name], [caller_phone], [issue_summary]"
    2. Agent tells caller:
       "I've alerted our emergency team. Someone will call you back within the hour."
    3. Log call: transfer_success=FALSE, transfer_attempted=TRUE
```

**CRITICAL:** Transfer must be attempted BEFORE writing the call record to the DB. A DB failure must never block a live emergency transfer. See BACKEND-SPEC.md for ordering details.

### Call Types

| Value | When Used | Name/Phone Required | Morning Summary Treatment |
|-------|-----------|-------------------|--------------------------|
| `emergency` | Caller needs help now | Yes | Highlighted first |
| `routine` | Wants service callback | Yes | Listed under "Callbacks Needed" |
| `message` | Leaving info, no callback | Optional | Listed under "Messages" |
| `wrong_number` | Caller said wrong number | No | One-line count at bottom |
| `hangup` | Silence, robocall, disconnect | No | One-line count at bottom |
| `unknown` | Couldn't classify (rare edge) | Optional | One-line count at bottom |

---

## Time Window Logic — Reference Implementation

```python
from datetime import datetime
import pytz

def get_time_window(client) -> str:
    """
    Returns 'sleep', 'business_hours', or 'evening'.
    Call this at the start of every webhook to determine the agent's behavior context.
    """
    tz = pytz.timezone(client.timezone)
    now = datetime.now(tz)
    current_time = now.time()
    current_day = now.isoweekday()  # 1=Monday, 7=Sunday (ISO)

    # 1. Sleep window — highest priority, applies every day
    if client.sleep_window_start is not None and client.sleep_window_end is not None:
        start = client.sleep_window_start
        end = client.sleep_window_end
        # Overnight window crosses midnight (e.g. 22:00 to 08:00)
        if start > end:
            if current_time >= start or current_time < end:
                return 'sleep'
        else:
            if start <= current_time < end:
                return 'sleep'

    # 2. Business hours — only on configured business days
    if (client.business_hours_start is not None
            and client.business_hours_end is not None
            and current_day in (client.business_days or [])):
        if client.business_hours_start <= current_time < client.business_hours_end:
            return 'business_hours'

    # 3. Evening window — default
    return 'evening'
```

### Agent's Language by Window

| Window | Routine Call | Emergency (no transfer) |
|--------|-------------|------------------------|
| Business hours | "We're currently open — someone will call you back shortly." | "I've flagged this as urgent — someone will call you back shortly." |
| Evening window | "Our team will call you back at [callback_expected_time]." | "I've alerted our emergency team. Someone will call you back within the hour." |
| Sleep window | "Our team will follow up first thing in the morning." | "I completely understand this is urgent. This has been flagged as a priority emergency and our team will call you first thing in the morning. If this is a life-safety emergency, please call 911." |

---

## SMS On-Call Management

Technicians manage on-call status by texting the client's Twilio number.

### Commands

| SMS | Action |
|-----|--------|
| `ON` | Tech goes on-call. Bumps any existing on-call tech. Owner receives SMS. |
| `OFF` | Tech goes off-call manually. Owner receives SMS. |
| `STATUS` | Reply with current on-call status for this client. |
| Anything else | Silent ignore. No reply. |

### ON Command Logic

```
1. Look up technician by sender phone + client (via Twilio number)
2. If not found: silent ignore
3. If another tech is currently on-call:
   a. Set that tech: on_call = FALSE (do NOT set on_call_end — intentional)
   b. SMS bumped tech: "You are no longer on-call for [Business Name].
      [New Tech Name] has taken over."
4. Set this tech: on_call = TRUE, on_call_start = NOW()
5. SMS owner: "[Tech Name] is now on-call for [Business Name]."
6. Log: tech.on_call_start in audit_logs
   metadata: {tech_id, tech_name, bumped_tech_id (if applicable)}
```

---

## Morning Summary

### Timing

Cron runs every 60 seconds. Pre-filters in SQL to active clients not yet sent today, then checks each client's `summary_send_time` against their local timezone in Python (timezone-aware time comparisons are impractical in a single SQL query across mixed timezones). Processes all matched clients in one pass, sending emails/SMS asynchronously. Writes a `cron_log` record with match/success/fail counts. If delivery fails for one client, the error is logged and other clients are not affected.

Double-send prevention: `morning_summary_sent_at` on each call record. Cron queries calls where `morning_summary_sent_at IS NULL` for each matched client. After successful send, sets `morning_summary_sent_at = NOW()` on all included records.

### Format

```
Subject: [Business Name] — Overnight Summary [Date]

EMERGENCIES ([count]):
🔴 [caller_name] ([caller_phone]) — [issue_summary]
   Transferred to [tech_name] at [time] ✓

CALLBACKS NEEDED ([count]):
• [caller_name] ([caller_phone]) — [issue_summary]

MESSAGES ([count]):
• [caller_name or "Unknown"] — "[message_content]"
  [if phone: "Contact: [caller_phone]" | else: "No callback requested."]

Also received: [X] wrong number(s), [Y] hangup(s).
```

If no calls in a category, that category is omitted. If no calls at all: "No calls received overnight. Have a great day." The "Also received" line only appears if there were wrong numbers or hangups.

### Delivery

- Primary: Email to `contact_email` via SendGrid
- Fallback: SMS to `owner_phone` if `contact_email` is NULL
- Both: If client opted in at onboarding

### T-15 Reminder

Separate cron fires 15 minutes before `routing_rules.after_hours_start`. SMS to all active techs: "After-hours coverage begins in 15 minutes for [Business Name]. Text ON to go on-call."

Uses the same approach as the morning summary: pre-filters active clients with routing rules in SQL, then checks if `after_hours_start` is 14–16 minutes away in each client's local timezone via Python. Writes a `cron_log` record with match/success/fail counts.

---

## Client Onboarding

### Provisioning Sequence (atomic)

```
1. Purchase Twilio phone number (local area code matching client)
2. Create client record in DB — status: 'pending', twilio_number set
3. Create Vapi assistant with built prompt for this client
4. Update client: vapi_assistant_id, vapi_phone_number_id, status: 'active'
5. Create routing_rules record
6. Send tech verification SMS to each technician
```

**Rollback on any failure after step 1:**
- Set client status: 'failed' (if record exists)
- Release any provisioned Twilio number
- Delete any created Vapi assistant
- Alert admin via SMS and Railway log

### Tech Verification

Welcome SMS to each tech at onboarding: "Hi [Name], you've been added as a technician for [Business Name] via FixMyNight. Text ON to go on-call when your shift starts."

On successful SMS delivery confirmation from Twilio: set `phone_verified = TRUE`.
Unverified techs are skipped during emergency transfer — system falls to owner fallback.

### Portal Access

Admin triggers magic link email to client's `contact_email`. Client clicks link, sets password on first visit. All subsequent logins use email + password at fixmyday.ai/portal/[client_id].

---

## Authentication

### Token Types

**Admin token** (8-hour expiry):
```json
{"sub": "admin", "role": "admin", "exp": "<timestamp>"}
```

**Portal token** (24-hour expiry):
```json
{"sub": "<client_uuid>", "role": "portal", "client_id": "<client_uuid>", "exp": "<timestamp>"}
```

### Validation Rules

- `ExpiredSignatureError` → HTTP 401, `detail: "SESSION_EXPIRED"`
- All other `JWTError` → HTTP 401, `detail: "TOKEN_INVALID"`
- Portal endpoints: verify token `client_id` matches path `client_id`
- Portal endpoints: verify client exists and `status = 'active'`
- Failed login: rate limited at 5 attempts per 15 minutes per IP

---

## Security

- All primary keys UUID — non-guessable, no sequential enumeration possible
- Every DB query scoped by `client_id` — no cross-tenant data leakage
- Vapi webhook: shared secret validated on every request + rate limited
- SMS commands: only accepted from verified technician phone numbers
- Portal JWT: scoped to single client, validated on every request
- No secrets in code — all in Railway environment variables

---

## Environment Variables

| Variable | Purpose |
|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `VAPI_API_KEY` | Vapi REST API authentication |
| `VAPI_WEBHOOK_SECRET` | Validates incoming Vapi webhooks |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio authentication |
| `JWT_SECRET_KEY` | Signs all JWT tokens |
| `JWT_ALGORITHM` | HS256 |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password |
| `SENDGRID_API_KEY` | Morning summary email delivery |
| `ENVIRONMENT` | production or development |

> **NOTE:** This table lists the core variables. See DEPLOYMENT-SPEC.md for the complete
> list of all required environment variables including `TWILIO_DEFAULT_NUMBER`,
> `ADMIN_PHONE`, `SENDGRID_FROM_EMAIL`, and `FRONTEND_URL`.

---

## V1 Hard Boundaries

These are explicitly out of scope. Do not build, do not design for.

- Business-hours full routing logic (the agent uses different messaging only, same routing)
- Multiple simultaneous on-call techs (one per client, DB-enforced)
- Click-to-call in portal
- Multi-language support
- Industry-specific deep AI training beyond configured prompt examples
- Call recording storage or playback
- Automated A2P SMS registration
- Unknown Twilio number graceful fallback beyond logging

## V2 Backlog

- Multiple simultaneous on-call techs for larger operations
- Business-hours full answering service mode
- Click-to-call in portal
- Industry-specific deep knowledge training for the AI agent
- Custom emergency example builder in portal UI
- Industry-specific morning summary formatting
- Pricing tiers (solo operator vs multi-tech)
- Unknown number graceful fallback (multi-client scale)
