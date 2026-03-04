# DATABASE-SCHEMA.md
# FixMyNight — PostgreSQL Database Schema
# Version: 1.6 | Status: Authoritative Source of Truth

---

## Architectural Decisions Baked In

- All primary keys are UUID (not SERIAL). Use `gen_random_uuid()` as default.
- Single `audit_logs` table (event-log style, JSONB metadata). No `audit_log` table.
- `admin_sms_numbers` stored as JSON array, not comma-separated string.
- `transfer_success` is an explicit boolean column on `calls`.
- `morning_summary_sent_at` prevents duplicate morning summary sends.
- Three time windows per client: business hours, evening window, sleep window.
- Sleep window is optional (NULL = no sleep window = 24/7 evening coverage).
- All times stored as TIME type in client local time. Timezone stored per client for UTC conversion.
- `clients.status` TEXT field replaces old `is_active` BOOLEAN. Values: `'pending'`, `'active'`, `'inactive'`, `'failed'`.
- `clients.vapi_phone_number_id` stores Vapi's internal phone number ID for webhook lookup.
- `clients.last_summary_sent_date` and `routing_rules.last_oncall_reminder_date` prevent cron double-fires.

---

## Table Overview

| Table | Purpose |
|-------|---------|
| `clients` | One row per business using FixMyNight |
| `technicians` | Techs belonging to a client |
| `calls` | Every call the AI agent handles |
| `routing_rules` | After-hours window definition per client (cron use only) |
| `audit_logs` | Unified event log for all system activity |
| `cron_log` | Cron job execution tracking for operational visibility |

---

## 1. clients

The central table. One row per client business (tenant).

```sql
CREATE TABLE clients (
    id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Business Identity
    business_name                       TEXT NOT NULL,
    owner_name                          TEXT NOT NULL,
    owner_phone                         TEXT NOT NULL,          -- E.164 format: +15551234567
    contact_email                       TEXT,                   -- Primary: morning summary email

    -- Industry
    industry                            TEXT NOT NULL DEFAULT 'general',
    industry_config                     JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Twilio / Vapi Integration
    twilio_number                       TEXT NOT NULL UNIQUE,   -- E.164 format
    vapi_assistant_id                   TEXT,                   -- Set after Vapi provisioning

    -- Emergency Configuration
    emergency_enabled                   BOOLEAN NOT NULL DEFAULT FALSE,
    emergency_fee                       DECIMAL(10,2),          -- NULL = no fee charged
    admin_sms_numbers                   JSONB NOT NULL DEFAULT '[]', -- e.g. ["+15551234567"]

    -- Timezone
    timezone                            TEXT NOT NULL DEFAULT 'America/Chicago',

    -- Business Hours
    business_hours_start                TIME,                   -- e.g. 08:00
    business_hours_end                  TIME,                   -- e.g. 18:00
    business_days                       INTEGER[] DEFAULT '{1,2,3,4,5}', -- 1=Mon 7=Sun ISO

    -- Business Hours Emergency Dispatch Toggle
    business_hours_emergency_dispatch   BOOLEAN NOT NULL DEFAULT TRUE,

    -- Sleep Window (NULL = disabled = 24/7 evening coverage)
    sleep_window_start                  TIME,                   -- e.g. 22:00
    sleep_window_end                    TIME,                   -- e.g. 08:00

    -- Cron and Callback Timing
    summary_send_time                   TIME NOT NULL DEFAULT '07:30',
    callback_expected_time              TIME NOT NULL DEFAULT '09:00',

    -- Agent Configuration
    agent_name                          TEXT NOT NULL DEFAULT 'Sarah',

    -- Vapi Phone Number Linkage
    vapi_phone_number_id                TEXT,               -- Vapi's internal phone number ID (set during onboarding)

    -- Client Status ('pending' | 'active' | 'inactive' | 'failed')
    status                              TEXT NOT NULL DEFAULT 'pending',

    -- Morning Summary Tracking
    last_summary_sent_date              DATE,               -- Prevents double-send of morning summary

    -- Portal Auth
    portal_password_hash                TEXT,
    portal_last_login                   TIMESTAMPTZ
);

CREATE INDEX idx_clients_twilio_number ON clients(twilio_number);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_vapi_phone ON clients(vapi_phone_number_id);
CREATE INDEX idx_clients_industry ON clients(industry);
```

### Field Notes

**`emergency_fee`:** If NULL, the agent does not mention a fee. If set, the agent reads the value dynamically and requests approval before dispatch. Fee is disclosure only — FixMyNight does not collect payment.

**`admin_sms_numbers`:** JSON array of E.164 numbers. Example: `["+15551234567", "+15559876543"]`. Always parse with `json.loads()`. Never store as comma-separated string.

**`industry`:** Simple label for the client's trade. Values: `'hvac'`, `'plumbing'`, `'electrical'`, `'locksmith'`, `'pest_control'`, `'roofing'`, `'appliance_repair'`, `'general_contractor'`, `'property_management'`, `'general'`. Default `'general'` for clients onboarded with "Other" industry.

**`industry_config`:** JSONB object holding industry-specific configuration for the AI agent. See MASTER-SPEC.md — Industry Configuration for the full schema. If empty `'{}'`, the system loads shipped defaults for the client's `industry` value. Overrides merged on top of defaults at onboarding.

**`agent_name`:** The name the AI agent uses in greetings and conversation. Default "Sarah". Configurable per client during onboarding or via admin client detail page.

**`business_days`:** ISO weekday integers. 1=Monday, 2=Tuesday ... 7=Sunday. Default is Mon-Fri.

**`sleep_window_start/end`:** If either is NULL, sleep window is disabled. When active, applies every night of the week regardless of day.

**`summary_send_time`:** When the morning cron fires for this client. Interpreted in client `timezone`.

**`callback_expected_time`:** What the agent tells after-hours callers. Example: "Our team will call you back at 9 AM." Interpreted in client `timezone`. Used only during evening window — not during business hours or sleep window.

**`vapi_assistant_id`:** Any change to fields that affect the agent's script must trigger a Vapi assistant rebuild. See Vapi Rebuild Triggers section below.

**`vapi_phone_number_id`:** Set during onboarding when the Twilio number is imported into Vapi. Used by the Vapi webhook handler to look up which client a call belongs to (Vapi sends its internal phone number ID, not the E.164 number).

**`status`:** Replaces the old `is_active` boolean. Four values: `'pending'` (during onboarding provisioning), `'active'` (fully provisioned and live), `'inactive'` (intentionally deactivated by admin — can be reactivated), `'failed'` (onboarding failed — needs cleanup or retry). All queries that check for active clients should use `WHERE status = 'active'`.

**`last_summary_sent_date`:** Set by the morning summary cron after sending any summary (including empty "no calls" summaries). Prevents the cron from re-sending every minute. Checked as `WHERE last_summary_sent_date != CURRENT_DATE` (or IS NULL).

**`contact_email`:** Should be unique per active client. The portal login endpoint uses email + client_id for unambiguous lookup. If two active clients share the same email, the login could be ambiguous.

---

## 2. technicians

One row per technician per client.

```sql
CREATE TABLE technicians (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,
    phone           TEXT NOT NULL,          -- E.164. This is the live transfer destination.

    -- On-Call State
    on_call         BOOLEAN NOT NULL DEFAULT FALSE,
    on_call_start   TIMESTAMPTZ,
    on_call_end     TIMESTAMPTZ,            -- NULL if on-call or was bumped (intentional)

    -- Verification
    phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Enforces single on-call tech per client at DB level
CREATE UNIQUE INDEX idx_one_on_call_per_client
    ON technicians(client_id)
    WHERE on_call = TRUE;

CREATE INDEX idx_technicians_client_id ON technicians(client_id);
CREATE INDEX idx_technicians_phone ON technicians(phone);
CREATE INDEX idx_technicians_on_call ON technicians(client_id, on_call);
```

### Field Notes

**`phone_verified`:** Set TRUE after welcome SMS delivery confirmation at onboarding. Unverified techs cannot receive emergency transfers — system skips to owner SMS fallback.

**`on_call_end`:** Intentionally NOT set when a tech is bumped by another texting ON. Only set when a tech manually texts OFF. Analytics note: on-call duration cannot be calculated for bumped sessions.

**Partial unique index:** `idx_one_on_call_per_client` enforces the constraint at DB level. Backend must set current on-call tech to `on_call = FALSE` before setting new tech to `on_call = TRUE` in the same transaction.

---

## 3. calls

One row per call the AI agent handles.

```sql
CREATE TABLE calls (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    client_id               UUID NOT NULL REFERENCES clients(id),

    -- Caller Info
    caller_phone            TEXT,                   -- NULL for hangups/wrong numbers
    caller_name             TEXT,
    issue_summary           TEXT,

    -- Classification
    is_emergency            BOOLEAN NOT NULL DEFAULT FALSE,
    time_window             TEXT NOT NULL,      -- 'business_hours' | 'evening' | 'sleep'
    call_type               TEXT,               -- 'emergency' | 'routine' | 'message' | 'wrong_number' | 'hangup' | 'unknown'

    -- Fee
    fee_offered             BOOLEAN DEFAULT FALSE,
    fee_amount              DECIMAL(10,2),      -- Snapshot at call time
    fee_approved            BOOLEAN,            -- NULL=not offered TRUE/FALSE=response

    -- Transfer
    transfer_attempted      BOOLEAN NOT NULL DEFAULT FALSE,
    transfer_success        BOOLEAN,            -- NULL=not attempted TRUE/FALSE=outcome
    transferred_to_phone    TEXT,
    transferred_to_tech_id  UUID REFERENCES technicians(id),

    -- Vapi
    vapi_call_id            TEXT UNIQUE,
    idempotency_key         TEXT UNIQUE,

    -- Morning Summary
    morning_summary_sent_at TIMESTAMPTZ,        -- NULL = pending. Set by cron after send.

    -- Flags
    flagged_urgent          BOOLEAN NOT NULL DEFAULT FALSE,  -- Sleep emergencies + business hours emergencies w/ dispatch OFF
    requires_callback       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_calls_client_id ON calls(client_id);
CREATE INDEX idx_calls_created_at ON calls(created_at);
CREATE INDEX idx_calls_client_morning ON calls(client_id, morning_summary_sent_at)
    WHERE morning_summary_sent_at IS NULL;
CREATE INDEX idx_calls_vapi_call_id ON calls(vapi_call_id);
CREATE INDEX idx_calls_idempotency ON calls(idempotency_key);
```

### Field Notes

**`time_window`:** Recorded at call receipt. Used for morning summary prioritization and analytics.

**`call_type`:** Values: `'emergency'`, `'routine'`, `'message'`, `'wrong_number'`, `'hangup'`, `'unknown'`. Six types covering all caller scenarios. `'message'` is for callers leaving info without requesting a callback (name and phone optional). `'wrong_number'` and `'hangup'` track junk calls for analytics. These replace the former hazard-specific call type value from V1.5.

**`fee_amount`:** Snapshot of `clients.emergency_fee` at call time. Preserved for accurate historical records even if client later changes their fee.

**`morning_summary_sent_at`:** Cron sets this after successful send. Prevents double-sends on retry.

**`flagged_urgent`:** TRUE for emergencies during sleep window OR business hours emergencies when `business_hours_emergency_dispatch` is OFF. Morning summary displays these first.

**CRITICAL — Transfer ordering:** Backend must attempt the Vapi transfer BEFORE writing the call record to the DB. Transfer must never be blocked by a DB failure. Log the call after transfer completes. See BACKEND-SPEC.md.

---

## 4. routing_rules

After-hours window per client. Used by cron jobs only.

```sql
CREATE TABLE routing_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    client_id           UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,

    after_hours_start   TIME NOT NULL DEFAULT '18:00',
    after_hours_end     TIME NOT NULL DEFAULT '08:00',

    -- Deduplication
    last_oncall_reminder_date   DATE,   -- Prevents double-send of T-15 reminder

    is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_routing_rules_client_id ON routing_rules(client_id);
```

### Field Notes

**`last_oncall_reminder_date`:** Set by the T-15 on-call reminder cron after sending reminders. Prevents the cron from double-firing within the same 14–16 minute window.

**IMPORTANT:** This table does NOT gate call routing. FixMyNight is always-on. The contractor controls when calls reach the system via their own call forwarding. This table exists only for:

1. **T-15min cron** — fires 15 minutes before `after_hours_start` to remind techs to go on-call
2. **Morning summary cron** — uses `after_hours_end` to define the window of calls to summarize

Time window logic (business hours / evening / sleep) lives on the `clients` table and is evaluated at call time by the backend.

---

## 5. audit_logs

Unified event log. Single source of truth for all system activity.

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    event_type      TEXT NOT NULL,
    actor_type      TEXT NOT NULL,      -- 'system' | 'admin' | 'technician' | 'vapi' | 'cron'
    actor_id        TEXT,               -- UUID of actor. NULL for system/vapi/cron.

    resource_type   TEXT,               -- 'client' | 'technician' | 'call' | 'auth' | 'cron'
    resource_id     UUID,

    metadata        JSONB NOT NULL DEFAULT '{}',

    client_id       UUID REFERENCES clients(id)
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

### Event Type Taxonomy

All valid `event_type` values. New types must be added here before use.

#### Call Events
| event_type | actor_type | metadata |
|------------|-----------|---------|
| `call.received` | `vapi` | `{caller_phone, time_window, call_type}` |
| `call.transfer_attempted` | `vapi` | `{tech_id, tech_phone, call_id}` |
| `call.transfer_success` | `vapi` | `{tech_id, call_id}` |
| `call.transfer_failed` | `system` | `{reason, call_id, fallback_triggered}` |
| `call.fee_offered` | `vapi` | `{amount, call_id}` |
| `call.fee_approved` | `vapi` | `{amount, call_id}` |
| `call.fee_declined` | `vapi` | `{amount, call_id}` |
| `call.logged` | `system` | `{call_id, is_emergency, time_window}` |

#### Config Change Events
| event_type | actor_type | metadata |
|------------|-----------|---------|
| `config.emergency_fee_changed` | `admin` | `{field: "emergency_fee", old_value, new_value}` |
| `config.emergency_enabled_changed` | `admin` | `{field: "emergency_enabled", old_value, new_value}` |
| `config.callback_time_changed` | `admin` | `{field: "callback_expected_time", old_value, new_value}` |
| `config.summary_time_changed` | `admin` | `{field: "summary_send_time", old_value, new_value}` |
| `config.sleep_window_changed` | `admin` | `{field: "sleep_window", old_start, new_start, old_end, new_end}` |
| `config.business_hours_changed` | `admin` | `{field: "business_hours", old_start, new_start, old_end, new_end}` |
| `config.field_changed` | `admin` | `{field, old_value, new_value}` |

#### Technician Events
| event_type | actor_type | metadata |
|------------|-----------|---------|
| `tech.on_call_start` | `technician` | `{tech_id, tech_name, bumped_tech_id}` |
| `tech.on_call_end` | `technician` | `{tech_id, tech_name, reason: "manual_off"}` |
| `tech.bumped` | `system` | `{bumped_tech_id, new_tech_id}` |
| `tech.added` | `admin` | `{tech_id, tech_name, tech_phone}` |
| `tech.verified` | `system` | `{tech_id, tech_phone}` |
| `tech.deactivated` | `admin` | `{tech_id, tech_name}` |

#### Auth Events
| event_type | actor_type | metadata |
|------------|-----------|---------|
| `auth.admin_login` | `admin` | `{ip_address, success}` |
| `auth.portal_login` | `portal` | `{client_id, ip_address}` |
| `auth.portal_password_set` | `portal` | `{client_id}` |
| `auth.token_expired` | `system` | `{token_type}` |
| `auth.token_invalid` | `system` | `{token_type, reason}` |

#### Cron Events
| event_type | actor_type | metadata |
|------------|-----------|---------|
| `cron.morning_summary_sent` | `cron` | `{client_id, call_count, urgent_count, delivery}` |
| `cron.oncall_reminder_sent` | `cron` | `{client_id, minutes_until_after_hours}` |
| `cron.morning_summary_failed` | `cron` | `{client_id, error}` |

---

## Full Migration Script

Run once on a fresh database. Do not run on an existing database without reviewing for conflicts.

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- clients
CREATE TABLE clients (
    id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    business_name                       TEXT NOT NULL,
    owner_name                          TEXT NOT NULL,
    owner_phone                         TEXT NOT NULL,
    contact_email                       TEXT,
    industry                            TEXT NOT NULL DEFAULT 'general',
    industry_config                     JSONB NOT NULL DEFAULT '{}'::jsonb,
    twilio_number                       TEXT NOT NULL UNIQUE,
    vapi_assistant_id                   TEXT,
    emergency_enabled                   BOOLEAN NOT NULL DEFAULT FALSE,
    emergency_fee                       DECIMAL(10,2),
    admin_sms_numbers                   JSONB NOT NULL DEFAULT '[]',
    timezone                            TEXT NOT NULL DEFAULT 'America/Chicago',
    business_hours_start                TIME,
    business_hours_end                  TIME,
    business_days                       INTEGER[] DEFAULT '{1,2,3,4,5}',
    business_hours_emergency_dispatch   BOOLEAN NOT NULL DEFAULT TRUE,
    sleep_window_start                  TIME,
    sleep_window_end                    TIME,
    summary_send_time                   TIME NOT NULL DEFAULT '07:30',
    callback_expected_time              TIME NOT NULL DEFAULT '09:00',
    agent_name                          TEXT NOT NULL DEFAULT 'Sarah',
    vapi_phone_number_id                TEXT,
    status                              TEXT NOT NULL DEFAULT 'pending',
    last_summary_sent_date              DATE,
    portal_password_hash                TEXT,
    portal_last_login                   TIMESTAMPTZ
);
CREATE INDEX idx_clients_twilio_number ON clients(twilio_number);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_vapi_phone ON clients(vapi_phone_number_id);
CREATE INDEX idx_clients_industry ON clients(industry);

-- technicians
CREATE TABLE technicians (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    phone           TEXT NOT NULL,
    on_call         BOOLEAN NOT NULL DEFAULT FALSE,
    on_call_start   TIMESTAMPTZ,
    on_call_end     TIMESTAMPTZ,
    phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX idx_one_on_call_per_client ON technicians(client_id) WHERE on_call = TRUE;
CREATE INDEX idx_technicians_client_id ON technicians(client_id);
CREATE INDEX idx_technicians_phone ON technicians(phone);
CREATE INDEX idx_technicians_on_call ON technicians(client_id, on_call);

-- calls
CREATE TABLE calls (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_id               UUID NOT NULL REFERENCES clients(id),
    caller_phone            TEXT,                   -- NULL for hangups/wrong numbers
    caller_name             TEXT,
    issue_summary           TEXT,
    is_emergency            BOOLEAN NOT NULL DEFAULT FALSE,
    time_window             TEXT NOT NULL,
    call_type               TEXT,
    fee_offered             BOOLEAN DEFAULT FALSE,
    fee_amount              DECIMAL(10,2),
    fee_approved            BOOLEAN,
    transfer_attempted      BOOLEAN NOT NULL DEFAULT FALSE,
    transfer_success        BOOLEAN,
    transferred_to_phone    TEXT,
    transferred_to_tech_id  UUID REFERENCES technicians(id),
    vapi_call_id            TEXT UNIQUE,
    idempotency_key         TEXT UNIQUE,
    morning_summary_sent_at TIMESTAMPTZ,
    flagged_urgent          BOOLEAN NOT NULL DEFAULT FALSE,
    requires_callback       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_calls_client_id ON calls(client_id);
CREATE INDEX idx_calls_created_at ON calls(created_at);
CREATE INDEX idx_calls_client_morning ON calls(client_id, morning_summary_sent_at)
    WHERE morning_summary_sent_at IS NULL;
CREATE INDEX idx_calls_vapi_call_id ON calls(vapi_call_id);
CREATE INDEX idx_calls_idempotency ON calls(idempotency_key);

-- routing_rules
CREATE TABLE routing_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_id           UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
    after_hours_start   TIME NOT NULL DEFAULT '18:00',
    after_hours_end     TIME NOT NULL DEFAULT '08:00',
    last_oncall_reminder_date   DATE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_routing_rules_client_id ON routing_rules(client_id);

-- audit_logs
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type      TEXT NOT NULL,
    actor_type      TEXT NOT NULL,
    actor_id        TEXT,
    resource_type   TEXT,
    resource_id     UUID,
    metadata        JSONB NOT NULL DEFAULT '{}',
    client_id       UUID REFERENCES clients(id)
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- cron_log
CREATE TABLE cron_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    job_name            TEXT NOT NULL,
    clients_matched     INTEGER NOT NULL DEFAULT 0,
    clients_succeeded   INTEGER NOT NULL DEFAULT 0,
    clients_failed      INTEGER NOT NULL DEFAULT 0,
    execution_ms        INTEGER,
    error_detail        TEXT
);
CREATE INDEX idx_cron_log_job_run ON cron_log(job_name, created_at DESC);
```

---

## Stellar HVAC Seed Data

```sql
-- Confirm all values with client before running
INSERT INTO clients (
    business_name, owner_name, owner_phone, contact_email,
    industry, industry_config, agent_name,
    twilio_number, emergency_enabled, emergency_fee, admin_sms_numbers,
    timezone, business_hours_start, business_hours_end, business_days,
    business_hours_emergency_dispatch, sleep_window_start, sleep_window_end,
    summary_send_time, callback_expected_time, status
) VALUES (
    'Stellar HVAC',
    'Dan',
    '+19796525799',             -- TEST NUMBER — replace with real owner phone
    'dan@stellarhvac.com',      -- Replace with real email
    'hvac',
    '{
      "industry_label": "HVAC",
      "emergency_examples": ["No heat in freezing weather", "No cooling in extreme heat", "Water leaking from HVAC unit", "System completely non-functional", "Unusual burning smell from unit"],
      "routine_examples": ["Scheduling maintenance", "Requesting a quote", "Filter replacement question", "Thermostat programming help"],
      "agent_name": "Sarah",
      "service_noun": "HVAC service",
      "tech_title": "technician"
    }'::jsonb,
    'Sarah',
    '+19796525799',             -- TEST NUMBER — replace with real Twilio number
    TRUE,                       -- Stellar HVAC uses emergency dispatch (column default is FALSE)
    150.00,
    '["+19796525799"]',         -- TEST NUMBER — replace with real admin SMS numbers
    'America/Chicago',
    '08:00', '18:00',
    '{1,2,3,4,5}',
    TRUE,
    '22:00', '08:00',
    '07:30', '09:00',
    'active'                    -- Seed data is fully provisioned
);

INSERT INTO routing_rules (client_id, after_hours_start, after_hours_end)
SELECT id, '18:00', '08:00' FROM clients WHERE business_name = 'Stellar HVAC';
```

---

## Vapi Rebuild Triggers

Changes to any of these `clients` fields must trigger a Vapi assistant prompt rebuild:

| Field | Reason |
|-------|--------|
| `emergency_fee` | Fee amount in agent's script |
| `emergency_enabled` | Enables/disables emergency path |
| `callback_expected_time` | Agent's callback time promise |
| `business_hours_start` | Time window logic |
| `business_hours_end` | Time window logic |
| `business_days` | Time window logic |
| `sleep_window_start` | Time window logic |
| `sleep_window_end` | Time window logic |
| `business_hours_emergency_dispatch` | Emergency behavior during business hours |
| `business_name` | Agent greeting references it |
| `industry_config` | Emergency examples, service noun, tech title change |
| `agent_name` | Agent greeting name changes |

---

## Pre-Migration Checklist

- [ ] `pgcrypto` extension available on Railway PostgreSQL
- [ ] No existing `audit_log` (singular) table — drop if present
- [ ] No existing tables with SERIAL primary keys — these must not be mixed with UUID FKs
- [ ] Stellar HVAC seed data values confirmed with client
- [ ] Database backed up before running
- [ ] Test: `SELECT gen_random_uuid();` returns a valid UUID

---

## Schema Validation Queries

```sql
-- All PKs should be uuid type
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'id' AND table_schema = 'public'
ORDER BY table_name;

-- Verify partial unique index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'technicians' AND indexname = 'idx_one_on_call_per_client';

-- Verify no old singular audit_log table
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'audit_log';
-- Must return 0 rows

-- Verify admin_sms_numbers is JSONB
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'admin_sms_numbers';
-- Must show data_type = jsonb

-- Verify status column exists (replaces old is_active boolean)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'status';
-- Must show data_type = text

-- Verify vapi_phone_number_id column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'vapi_phone_number_id';
-- Must show data_type = text

-- Verify last_summary_sent_date column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'last_summary_sent_date';
-- Must show data_type = date

-- Verify last_oncall_reminder_date on routing_rules
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'routing_rules' AND column_name = 'last_oncall_reminder_date';
-- Must show data_type = date

-- Verify no old is_active column on clients
SELECT column_name FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'is_active';
-- Must return 0 rows

-- Verify industry column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'industry';
-- Must show data_type = text

-- Verify industry_config column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'industry_config';
-- Must show data_type = jsonb

-- Verify agent_name column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'agent_name';
-- Must show data_type = text

-- Verify cron_log table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'cron_log';
-- Must return 1 row

-- Verify all 6 tables present
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Must show: audit_logs, calls, clients, cron_log, routing_rules, technicians
```
