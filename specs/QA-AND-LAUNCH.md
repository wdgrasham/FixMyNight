# QA-AND-LAUNCH.md
# FixMyNight — QA Test Scenarios & Launch Checklist
# Version: 1.6 | Status: Authoritative Source of Truth

---

## Overview

This document is the go/no-go authority for FixMyNight launch.
All test scenarios must pass before Stellar HVAC goes live.
Each scenario has a clear pass/fail criteria. No partial credit.

Test phone number for Stellar HVAC: +1-979-652-5799
**Mark this number as TEST in all testing. Replace before production go-live.**

---

## Pre-Test Setup Requirements

Before running any test scenarios, confirm all of the following:

- [ ] Backend deployed and healthy (`/health` returns 200)
- [ ] Database migrated and seed data inserted
- [ ] Stellar HVAC Vapi assistant updated with V1.6 prompt and tools
- [ ] Twilio SMS webhook pointed at Railway backend
- [ ] Vapi webhook URL and secret confirmed
- [ ] At least one technician added with a verified phone number
- [ ] Admin portal accessible at fixmyday.ai/admin
- [ ] Client portal accessible at fixmyday.ai/portal/{stellar-client-id}

---

## Test Group 1: Voice Call Flows

### T1.1 — Recording Disclosure (Every Call)

**Setup:** Place any inbound call to the Twilio number.
**Action:** Answer and listen to Sarah's opening.
**Pass:** Agent says "This call may be recorded for quality purposes" as the
absolute first thing before any greeting.
**Fail:** Recording disclosure is missing or comes after the greeting.

---

### T1.2 — Routine Call — Evening Window

**Setup:** Ensure current time is in evening window (after business_hours_end,
before sleep_window_start).
**Action:** Call. Tell Sarah you need to schedule a tune-up. Provide name and phone.
**Pass:**
- Sarah collects name and phone number
- Agent says "Our team will call you back at 9 AM" (or configured callback_expected_time)
- logCall webhook fires with `is_emergency=false`, `call_type="routine"`
- Call record appears in admin dashboard
**Fail:** Wrong callback time, no webhook fired, emergency flow triggered.

---

### T1.3 — Routine Call — Business Hours Window

**Setup:** Temporarily set `business_hours_start` and `business_hours_end` to bracket
current time, and ensure current day is in `business_days`.
**Action:** Call. Request a quote.
**Pass:**
- Agent says "We're currently open — someone will call you back shortly"
- logCall fires with `time_window="business_hours"`
- Immediate SMS sent to owner_phone
- Call record shows time_window = business_hours
**Fail:** Evening window language used, no owner SMS sent.

---

### T1.4 — Routine Call — Sleep Window

**Setup:** Temporarily set `sleep_window_start` to 1 minute before current time
and `sleep_window_end` to 1 hour from now.
**Action:** Call. Request service.
**Pass:**
- Agent says "Our team will follow up first thing in the morning"
- logCall fires with `time_window="sleep"`
- No owner SMS sent for routine call
- `flagged_urgent = FALSE`
**Fail:** Evening window language, transfer attempted.

---

### T1.5 — Emergency Call — Evening Window, No Fee

**Setup:** Evening window. Set `emergency_fee = NULL` on Stellar HVAC.
Rebuild Vapi assistant. Ensure a verified tech is on-call (text ON from tech phone).
**Action:** Call. Describe: "My heat stopped working and it's very cold."
**Pass:**
- Sarah acknowledges emergency
- Agent does NOT mention a fee
- Agent says she will connect caller with tech
- transferCall webhook fires
- Backend returns destination object with tech phone
- Call bridges to tech phone (tech phone rings)
- Call record shows `transfer_attempted=TRUE`, `transfer_success=TRUE`
**Fail:** Fee mentioned, transfer not attempted, wrong tech phone.

---

### T1.6 — Emergency Call — Evening Window, With Fee, Approved

**Setup:** Evening window. Set `emergency_fee = 150.00`. Rebuild Vapi assistant.
Verified tech on-call.
**Action:** Call. Describe emergency. When fee mentioned, say "Yes I approve."
**Pass:**
- Sarah states the $150 fee clearly
- Sarah asks for approval
- After "yes" — Sarah proceeds to transfer
- transferCall fires with `fee_approved` context
- Call bridges to tech
- Call record shows `fee_offered=TRUE`, `fee_approved=TRUE`, `transfer_success=TRUE`
**Fail:** Fee amount wrong, transfer happens without approval, fee declined path taken.

---

### T1.7 — Emergency Call — Evening Window, With Fee, Declined

**Setup:** Same as T1.6.
**Action:** Call. Describe emergency. When fee mentioned, say "No that's too much."
**Pass:**
- Sarah acknowledges decline gracefully
- Agent says team will follow up in the morning
- No transfer attempted
- logCall fires with `fee_approved=FALSE`, `is_emergency=TRUE`
- Call record shows `transfer_attempted=FALSE`, `fee_approved=FALSE`
**Fail:** Transfer attempted after decline, no logCall fired.

---

### T1.8 — Emergency Call — No Tech On-Call (Fallback)

**Setup:** Evening window. No tech currently on-call (text OFF from tech phone first).
**Action:** Call. Describe emergency. Approve fee if applicable.
**Pass:**
- transferCall webhook fires
- Backend finds no verified on-call tech
- Backend sends fallback SMS to all admin_sms_numbers
- Backend returns result string (not destination)
- Sarah reads result: "I've alerted our emergency team. Someone will call you back within the hour."
- Call record shows `transfer_attempted=TRUE`, `transfer_success=FALSE`
- Fallback SMS received on admin phone
**Fail:** No fallback SMS, Sarah gives wrong message, no call record.

---

### T1.9 — Leave a Message Flow

**Setup:** Any time window.
**Action:** Call. When the agent asks intent, say "I just want to leave a message."
Say: "Tell Dan his parts came in at ABC Supply." When asked for name/number,
say "He has my number, no need."
**Pass:**
- Agent confirms message back
- Agent does NOT promise a callback time
- logCall fires with `call_type="message"`
- `caller_name` and `caller_phone` may be NULL
- Call record appears in admin dashboard
- Call appears in morning summary under "Messages" section
**Fail:** Callback time promised, name/phone forced as required, wrong call_type.


### T1.10 — Emergency Call — Sleep Window (No Transfer)

**Setup:** Sleep window active. Tech on-call.
**Action:** Call. Describe emergency urgently.
**Pass:**
- Sarah collects name and phone
- Sarah delivers exact sleep window script:
  "I completely understand this is urgent. This has been flagged as a priority
  emergency and our team will call you first thing in the morning.
  If this is a life-safety emergency, please call 911."
- No transfer attempted even though tech is on-call
- logCall fires with `is_emergency=TRUE`, `time_window="sleep"`, `flagged_urgent=TRUE`
- Owner receives urgent SMS
- Call record shows `flagged_urgent=TRUE`
**Fail:** Transfer attempted, wrong script, flagged_urgent not set.

---

### T1.11 — Emergency Call — Business Hours, Dispatch ON

**Setup:** Business hours window. `business_hours_emergency_dispatch = TRUE`. Tech on-call.
**Action:** Call. Describe emergency.
**Pass:**
- Sarah proceeds to transfer (no sleep-window message)
- transferCall fires
- Call bridges to tech
- time_window in call record = "business_hours"
**Fail:** Morning message given, transfer blocked.

---

### T1.12 — Emergency Call — Business Hours, Dispatch OFF

**Setup:** Business hours window. `business_hours_emergency_dispatch = FALSE`. Tech on-call.
**Action:** Call. Describe emergency.
**Pass:**
- Agent says "I've flagged this as urgent — someone will call you back shortly"
- No transfer attempted
- logCall fires with `is_emergency=TRUE`, `time_window="business_hours"`
- Immediate urgent SMS sent to owner
- Call record shows `transfer_attempted=FALSE`
**Fail:** Transfer attempted, wrong message, no owner SMS.

---

### T1.13 — Direct AI Question

**Setup:** Any call.
**Action:** After greeting, ask "Are you a real person or an AI?"
**Pass:** Sarah answers honestly that she is an AI assistant for the business.
**Fail:** Sarah denies being an AI, deflects without answering, crashes.

---

### T1.14 — Idempotency — Duplicate Webhook

**Setup:** Send the same Vapi webhook payload twice in quick succession with same
`vapi_call_id` and function name.
**Action:** POST identical webhook body to `/api/v1/webhooks/vapi-intake` twice.
**Pass:**
- First request: processed normally, call record created
- Second request: returns `{"result": "Already processed"}`, no duplicate record created
- Database has exactly one call record for that `idempotency_key`
**Fail:** Two call records created, error thrown.

---

## Test Group 2: SMS On-Call Management

### T2.1 — Tech Goes On-Call

**Setup:** No tech currently on-call.
**Action:** Text "ON" from a verified tech phone to the Twilio number.
**Pass:**
- Backend finds tech record by phone + client
- Tech `on_call = TRUE`, `on_call_start` set to now
- Owner receives SMS: "[Tech Name] is now on-call for Stellar HVAC."
- audit_logs shows `tech.on_call_start` event
**Fail:** No DB update, no owner SMS, wrong tech identified.

---

### T2.2 — Tech Goes Off-Call

**Setup:** Tech is currently on-call.
**Action:** Text "OFF" from tech phone.
**Pass:**
- Tech `on_call = FALSE`, `on_call_end` set to now
- Owner receives SMS: "[Tech Name] is no longer on-call for Stellar HVAC."
- audit_logs shows `tech.on_call_end` event
**Fail:** DB not updated, no owner notification.

---

### T2.3 — Tech Bumped by Another

**Setup:** Tech A is on-call.
**Action:** Text "ON" from Tech B's phone.
**Pass:**
- Tech A: `on_call = FALSE`. `on_call_end` is NOT set (intentional).
- Tech B: `on_call = TRUE`, `on_call_start` set to now
- Tech A receives SMS: "You are no longer on-call for Stellar HVAC. [Tech B Name] has taken over."
- Owner receives SMS: "[Tech B Name] is now on-call for Stellar HVAC."
- audit_logs shows `tech.bumped` and `tech.on_call_start` events
**Fail:** Both techs show on-call, `on_call_end` set on Tech A, no bump notification.

---

### T2.4 — STATUS Command

**Setup:** Tech A is on-call.
**Action:** Text "STATUS" from any verified tech phone.
**Pass:**
- System replies: "Stellar HVAC on-call status: [Tech A Name] is currently on-call."
- Reply comes from the Twilio business number
**Fail:** No reply, wrong tech shown, reply from wrong number.

---

### T2.5 — STATUS When No One On-Call

**Setup:** No tech on-call.
**Action:** Text "STATUS".
**Pass:** Reply: "Stellar HVAC on-call status: No technician is currently on-call."
**Fail:** Error, wrong message, no reply.

---

### T2.6 — Unknown SMS Sender

**Setup:** A phone number NOT in the technicians table.
**Action:** Text "ON" from unknown number to Twilio number.
**Pass:** No reply sent. No DB changes. Silent ignore.
**Fail:** Any reply sent, error thrown, system crashes.

---

### T2.7 — Unknown SMS Command

**Setup:** Verified tech phone.
**Action:** Text "HELLO" to Twilio number.
**Pass:** Silent ignore. No reply. No DB changes.
**Fail:** Any reply sent, error thrown.

---

### T2.8 — T-15 Minute On-Call Reminder

**Setup:** Set `after_hours_start` to 15 minutes from now in routing_rules.
Wait for cron to fire.
**Pass:**
- All verified active techs receive SMS:
  "After-hours coverage begins in 15 minutes for Stellar HVAC. Text ON to go on-call."
- SMS comes from Twilio business number
- audit_logs shows `cron.oncall_reminder_sent`
**Fail:** SMS not sent, wrong timing, wrong sender number.

---

## Test Group 3: Morning Summary

### T3.1 — Summary Fires at Configured Time

**Setup:** Insert 2 test call records (1 urgent, 1 routine) with `morning_summary_sent_at = NULL`.
Set `summary_send_time` to 2 minutes from now. Wait.
**Pass:**
- Email received at `contact_email` within 3 minutes
- Subject: "Stellar HVAC — Overnight Summary [Date]"
- Urgent call appears first under "URGENT" section
- Routine call appears under "Routine callbacks"
- Both call records now have `morning_summary_sent_at` set
- audit_logs shows `cron.morning_summary_sent`
**Fail:** Email not received, wrong order, records not marked as sent.

---

### T3.2 — No Double Send

**Setup:** Same call records from T3.1 (already have `morning_summary_sent_at` set).
Run cron again.
**Pass:** No second email sent. Records not double-counted.
**Fail:** Second email sent.

---

### T3.3 — Empty Summary

**Setup:** No call records with `morning_summary_sent_at = NULL` for this client.
Set `summary_send_time` to now.
**Pass:** Email received with "No calls received overnight. Have a great day."
**Fail:** No email sent, error thrown, empty body with no message.

---

### T3.4 — SMS Fallback When No Email

**Setup:** Set `contact_email = NULL` on client.
Insert a test call record. Set `summary_send_time` to now.
**Pass:** SMS received at `owner_phone` with summary content.
**Fail:** Neither email nor SMS sent, error thrown.

---

## Test Group 4: Authentication & Portal

### T4.1 — Admin Login Success

**Action:** POST to `/api/v1/auth/admin-login` with correct password.
**Pass:** 200 response with `access_token`. Token decodes to `role: admin`.
**Fail:** 401, no token, wrong role in token.

---

### T4.2 — Admin Login Wrong Password

**Action:** POST with wrong password.
**Pass:** 401 with `detail: "INVALID_CREDENTIALS"`.
**Fail:** 200 returned, 500 error, different error code.

---

### T4.3 — Admin Login Rate Limit

**Action:** POST with wrong password 6 times in 15 minutes.
**Pass:** 6th attempt returns 429.
**Fail:** 6th attempt returns 401 (not rate limited).

---

### T4.4 — Portal Magic Link Flow

**Action:** Admin triggers magic link for Stellar HVAC client. Click link.
Set password. Log in with new password.
**Pass:**
- Magic link email received
- Password set successfully, portal JWT returned
- Portal login with email + password works
- JWT decodes to `role: portal`, `client_id` matches Stellar HVAC UUID
**Fail:** Email not received, password set but login fails, wrong client_id in token.

---

### T4.5 — Portal Scope Enforcement

**Setup:** Log in as Stellar HVAC portal user (client_id = A).
**Action:** Try to access `/api/v1/portal/{client_id_B}/calls` with Stellar HVAC token.
**Pass:** 403 with `detail: "CLIENT_SCOPE_MISMATCH"`.
**Fail:** 200 returned with another client's data.

---

### T4.6 — Expired Token

**Setup:** Generate a token, manually set expiry to past timestamp.
**Action:** Make any authenticated request with expired token.
**Pass:** 401 with `detail: "SESSION_EXPIRED"`.
**Fail:** 200 returned, 500 error, `TOKEN_INVALID` returned instead.

---

### T4.7 — Tampered Token

**Setup:** Take a valid token, change one character in the signature.
**Action:** Make any authenticated request.
**Pass:** 401 with `detail: "TOKEN_INVALID"`.
**Fail:** 200 returned, `SESSION_EXPIRED` returned.

---

## Test Group 5: Admin Portal UI

### T5.1 — Onboarding Form — Full Happy Path

**Action:** Complete onboarding form with all valid data. Submit.
**Pass:**
- Provisioning progress UI shows each step completing
- Client appears in client list
- Twilio number assigned
- Vapi assistant ID populated
- Technicians receive verification SMS
- "Send Portal Link" button appears
**Fail:** Any step fails silently, no progress shown, client not created.

---

### T5.2 — Onboarding Form — Validation

**Action:** Submit form with invalid phone, missing required fields, emergency fee = -50.
**Pass:** Form shows inline validation errors. Does not submit. No API call made.
**Fail:** Invalid data sent to API, API error shown instead of inline validation.

---

### T5.3 — Onboarding Rollback on Failure

**Setup:** Force Vapi assistant creation to fail (use invalid API key temporarily).
**Action:** Submit complete onboarding form.
**Pass:**
- Provisioning progress shows failure at Vapi step
- Client record set to failed status (not active)
- Any purchased Twilio number released
- Admin receives alert SMS
- Error message shown in UI
**Fail:** Client left in active state, Twilio number orphaned, silent failure.

---

### T5.4 — Client Detail — PATCH Updates

**Action:** Change emergency_fee from $150 to $200 in client detail form. Save.
**Pass:**
- PATCH request sent with new fee value
- "Saving..." then "Saved" indicator shown
- "Sarah's script is being updated" notice shown (Vapi rebuild triggered)
- audit_logs shows `config.field_changed` with old_value=150, new_value=200
- Vapi assistant rebuilt with new fee amount
**Fail:** No audit log, no Vapi rebuild, incorrect save state shown.

---

## Test Group 6: Client Portal UI

### T6.1 — Dashboard Loads Correctly

**Action:** Log in as Stellar HVAC portal user. View dashboard.
**Pass:**
- On-call status card shows correct tech (or "No coverage")
- Recent calls card shows last 5 calls with correct urgency flags
- Settings summary shows correct current values
- Quick stats accurate
**Fail:** Wrong client's data shown, stats incorrect, any 500 error.

---

### T6.2 — Settings Update via Portal

**Action:** Change `callback_expected_time` from 9:00 AM to 8:30 AM. Save.
**Pass:**
- PATCH fires to portal settings endpoint
- `callback_expected_time` updated in DB
- Vapi rebuild triggered
- Sarah on next call says "8:30 AM" not "9 AM"
**Fail:** Change not saved, no Vapi rebuild, Sarah still says 9 AM.

---

### T6.3 — Call History Filtering

**Setup:** Ensure mix of emergency and routine calls in DB.
**Action:** Filter by "Emergency" call type.
**Pass:** Only emergency calls shown. Routine calls hidden.
**Fail:** All calls shown, filter has no effect, wrong calls shown.

---

## Go / No-Go Criteria

### HARD BLOCKS — Do not launch if any of these fail:

| Test | Reason |
|------|--------|
| T1.1 | Legal — recording disclosure required |
| T1.5 | Core product — emergency transfer must work |
| T1.8 | Safety — fallback SMS when no tech on-call |
| T1.9 | Core product — message flow must work correctly |
| T1.10 | Safety — sleep window must never transfer |
| T1.14 | Data integrity — duplicate call records corrupt morning summary |
| T2.1 | Core product — on-call management must work |
| T2.3 | Core product — bump logic must be correct |
| T2.6 | Security — unknown SMS must be silently ignored |
| T3.1 | Core product — morning summary must deliver |
| T4.5 | Security — cross-client data access must be blocked |
| T5.3 | Reliability — onboarding rollback must clean up |

### SOFT BLOCKS — Fix before launch, but may accept with workaround:

| Test | Acceptable Workaround |
|------|----------------------|
| T1.3 | Business hours window — if not used day-1, can launch and fix |
| T3.4 | SMS fallback — if contact_email set on Stellar HVAC, risk is low |
| T5.2 | Frontend validation — can rely on API validation temporarily |

### DEFERRED — Known V2 items, not a launch block:

- Multiple simultaneous on-call techs
- Click-to-call in portal
- Self-serve password reset

---

## Launch Day Checklist

### 24 Hours Before

- [ ] All hard block tests passed
- [ ] A2P registration approved by Twilio
- [ ] Stellar HVAC seed data confirmed with client (correct phone numbers)
- [ ] Client portal magic link sent to Dan — he has logged in and confirmed access
- [ ] Morning summary email confirmed with Dan — he received test email
- [ ] Dan knows his tech's number is verified and they know how to text ON/OFF
- [ ] DEPLOYMENT-SPEC.md deployment checklist 100% complete

### Launch Day

- [ ] Dan's existing phone forwarding confirmed — he will forward to Twilio number
- [ ] Test call placed to live Twilio number — Sarah answers correctly
- [ ] Dan places test call himself and confirms experience
- [ ] Dan or tech texts ON — on-call confirmed active
- [ ] Watch Railway logs for first real call — confirm no errors

### First Week Monitoring

- [ ] Check Railway logs daily for any `[ERROR]` lines
- [ ] Confirm morning summary delivered each day
- [ ] Confirm Dan is receiving call records in portal
- [ ] Confirm techs are successfully going on-call each evening
- [ ] Any issues → fix before onboarding second client

---

## Known Issues at Launch

Document any known issues here before going live so they are tracked
and not re-discovered:

| Issue | Impact | Fix Target |
|-------|--------|-----------|
| `on_call_end` not set on bumped techs | Analytics gap only — no functional impact | V1.1 |
| No self-serve password reset | Admin must manually re-send magic link | V1.1 |
| No CSV export for call history | Minor inconvenience | V2 |

---

## Post-Launch Priorities (V1.1)

In order of importance after Stellar HVAC is stable:

1. Second client onboarding — validate multi-tenant isolation end to end
2. Self-serve password reset for portal
3. Email template polish (HTML email for morning summary)
4. `on_call_end` tracking for bumped techs
5. Pricing tier decision (solo vs. multi-tech)
6. Begin V2 scoping: multiple simultaneous on-call techs

### T1.15 — Wrong Number Handling

**Setup:** Any time window.
**Action:** Call. When the agent greets, say "Sorry, wrong number."
**Pass:**
- Agent says "No problem. Have a good night."
- logCall fires with `call_type="wrong_number"`
- Call ends promptly
- No owner notification sent
**Fail:** Agent tries to collect info, transfer attempted, owner notified.

---

### T1.16 — Return Call Handling

**Setup:** Any time window.
**Action:** Call. Say "I got a missed call from this number."
**Pass:**
- Agent identifies the business and service type
- Agent offers message or service options
- If caller chooses to leave a message, message flow works correctly
- If caller says "I'll call back tomorrow," agent handles gracefully
**Fail:** Agent doesn't explain what the business is, forces emergency flow.

---

### T1.17 — Hangup / Silence Handling

**Setup:** Any time window.
**Action:** Call. Say nothing after the agent's greeting.
**Pass:**
- Agent prompts "Are you still there?" after ~5 seconds
- If still silent for 5 more seconds, call ends
- logCall fires with `call_type="hangup"`
- No owner notification
**Fail:** Agent keeps talking indefinitely, no timeout, error thrown.

---

### T1.18 — Smart Detection (Emergency Blurt)

**Setup:** Evening window. Tech on-call. Emergency enabled.
**Action:** Call. Immediately say "My pipe burst and water is everywhere!"
before the agent can ask the intent question.
**Pass:**
- Agent does NOT ask "Are you calling about service or leaving a message?"
- Agent recognizes the emergency directly from context
- Agent says the emergency disclaimer
- Agent proceeds to normal emergency flow (offer tech)
**Fail:** Agent asks the intent question despite caller clearly stating emergency.

---

### T1.19 — Emergency Disclaimer Delivery

**Setup:** Evening window. Tech on-call. Emergency enabled.
**Action:** Call. Describe an emergency.
**Pass:**
- Agent says "If you feel the situation may be unsafe, please don't
  hesitate to contact your local emergency services."
- Disclaimer comes BEFORE offering to connect with tech
- Agent then proceeds to offer the tech transfer
**Fail:** No disclaimer, disclaimer after transfer offer, or prescriptive
safety advice given (e.g., "leave the building").

---

## Test Group 7: Industry Variation

### T7.1 — Onboarding with Industry Selection

**Action:** Onboard a test client with industry = "Plumbing".
**Pass:**
- `industry_config` populated with plumbing defaults
- Vapi assistant created with plumbing-specific emergency examples
- Agent name defaults to "Sarah" unless overridden
**Fail:** HVAC defaults used, wrong emergency examples.

---

### T7.2 — Non-Default Agent Name

**Action:** Onboard a test client with `agent_name = "Alex"`.
**Pass:**
- AI introduces itself as "This is Alex" (not "This is Sarah")
- All flows work identically
**Fail:** Agent says "Sarah" instead of configured name.

---

### T7.3 — General Industry Client (Minimal Config)

**Action:** Onboard a test client with industry = "Other", description = "Pool cleaning".
**Pass:**
- industry set to "general"
- Generic emergency and routine examples loaded
- All flows work normally
**Fail:** Error during onboarding, missing defaults.
