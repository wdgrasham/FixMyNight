# FRONTEND-SPEC.md
# FixMyNight — Frontend Specification
# Version: 1.6 | Status: Authoritative Source of Truth

---

## Overview

FixMyNight frontend lives at fixmyday.ai under the FixMyNight product section.
Two distinct interfaces exist: the Admin Portal and the Client Portal.

**Admin Portal** — internal use only. Used by the FixMyNight operator to onboard
new clients, manage existing clients, and monitor the system.

**Client Portal** — used by client business owners. They see their call history,
manage their settings, and view on-call status.

Both are secured by JWT. See BACKEND-SPEC.md — Authentication section.

---

## URL Structure

### Public Pages

Public pages use `PublicLayout.tsx` (shared nav + footer).

```
fixmyday.ai/                          → FixMyDay.ai landing page
fixmyday.ai/legal                     → Legal information
fixmyday.ai/privacy                   → Privacy policy
fixmyday.ai/terms                     → Terms & conditions
fixmyday.ai/fixmynight                → FixMyNight product page
fixmyday.ai/contact                   → Contact page
```

### App Pages

App pages (admin portal + client portal) use `Layout.tsx`.

```
fixmyday.ai/fixmynight/admin                     → Admin login
fixmyday.ai/fixmynight/admin/dashboard           → Admin dashboard (requires admin JWT)
fixmyday.ai/fixmynight/admin/clients             → Client list
fixmyday.ai/fixmynight/admin/clients/new         → Onboarding form
fixmyday.ai/fixmynight/admin/clients/{id}        → Client detail / edit
fixmyday.ai/fixmynight/portal/setup              → First-time password setup (magic link)
fixmyday.ai/fixmynight/portal/{client_id}        → Client portal login
fixmyday.ai/fixmynight/portal/{client_id}/dashboard → Client dashboard (requires portal JWT)
fixmyday.ai/fixmynight/portal/{client_id}/calls  → Call history
fixmyday.ai/fixmynight/portal/{client_id}/settings → Client settings editor
fixmyday.ai/fixmynight/portal/{client_id}/team   → Technician management
```

---

## Admin Portal

### Admin Login — /fixmynight/admin

Simple password form. Admin is a single superuser — no username or email needed.
On success, stores JWT in memory (not localStorage — not supported in this environment).
JWT stored in React state or context.

Fields:
- Password (single field)

On success: redirect to `/fixmynight/admin/dashboard`
On failure: show `"Invalid credentials"` — do not specify what was wrong

Rate limiting enforced server-side (5 attempts / 15 min). Frontend shows
`"Too many attempts. Please wait 15 minutes."` on 429 response.

---

### Admin Dashboard — /fixmynight/admin/dashboard

Summary view. Shows:
- Total active clients
- Total calls in last 24 hours (across all clients)
- Any clients with provisioning status `failed` — shown as alert banner
- Quick links to each client

---

### Client List — /fixmynight/admin/clients

Table of all clients:

| Column | Value |
|--------|-------|
| Business Name | Clickable → client detail |
| Owner | Owner name |
| Status | Active / Inactive / Failed |
| Twilio Number | Formatted phone |
| Calls (7d) | Count of calls in last 7 days |
| On-Call | Current on-call tech name or "None" |
| Actions | Edit, Deactivate |

---

### Onboarding Form — /fixmynight/admin/clients/new

Full client onboarding. On submit, calls `POST /api/v1/admin/clients`.
Shows provisioning progress (Twilio → Vapi → Activate) with status indicators.
On success: redirect to client detail page and show "Send Portal Link" button.

#### Section 0: Industry (NEW — First Field)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Industry | Select dropdown | Yes | Options: HVAC, Plumbing, Electrical, Locksmith, Pest Control, Roofing, Appliance Repair, General Contractor, Property Management, Other |
| Other Industry | Text | Conditional | Shown only if "Other" selected. Free text. Maps to industry = "general". |
| Agent Name | Text | No | Default: "Sarah". The name the AI uses in greetings. |

When an industry is selected, show read-only preview:
"[Agent Name] will recognize these as emergencies: [emergency examples]"
"[Agent Name] will treat these as routine: [routine examples]"

#### Section 1: Business Information

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Business Name | Text | Yes | |
| Owner Name | Text | Yes | |
| Owner Phone | Tel | Yes | E.164 validation. This is the fallback SMS recipient. |
| Contact Email | Email | Yes | Used for portal login and morning summary |
| Timezone | Select | Yes | Default: America/Chicago. Show US timezones. |

#### Section 2: Emergency Configuration

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Emergency Dispatch Enabled | Toggle | Yes | Default: OFF. When OFF, the AI logs all calls for morning summary only — no live transfers. |
| Emergency Fee | Currency input | No | Leave blank = no fee. Only shown if emergency enabled. |
| Admin SMS Numbers | Phone list | Yes | At minimum owner phone pre-filled. Allow adding more. |

#### Section 3: Business Hours

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Business Days | Multi-checkbox | Yes | Mon/Tue/Wed/Thu/Fri/Sat/Sun. Default: Mon–Fri |
| Business Hours Start | Time picker | Yes | Default: 8:00 AM |
| Business Hours End | Time picker | Yes | Default: 6:00 PM |
| Emergency Dispatch During Business Hours | Toggle | Yes | Default: ON |

#### Section 4: Sleep Window

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Enable Sleep Window | Toggle | No | Default: OFF for multi-tech, recommend ON for solo |
| Sleep Window Start | Time picker | Conditional | Required if sleep window enabled. Default: 10:00 PM |
| Sleep Window End | Time picker | Conditional | Required if sleep window enabled. Default: 8:00 AM |

Helper text: "Sleep window prevents live emergency transfers during late night hours.
Emergencies are still logged and flagged urgent for your morning summary."

#### Section 5: Notification Timing

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Morning Summary Time | Time picker | Yes | When cron fires. Default: 7:30 AM |
| Expected Callback Time | Time picker | Yes | What the agent tells callers. Default: 9:00 AM |

Helper text for callback time: "The AI agent will tell after-hours callers: 'Our team will call
you back at [time].' Make sure this reflects when you realistically start returning calls."

#### Section 6: Technicians

Allow adding 1–5 technicians. Minimum 1 required.

Per technician:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Name | Text | Yes | First name or full name |
| Phone | Tel | Yes | E.164. This is the live transfer destination. |

Show inline note: "Each technician will receive a welcome SMS confirming their number.
They manage on-call status by texting ON or OFF to the business number."

#### Form Validation Rules

- Owner phone and all tech phones: must be valid E.164 or 10-digit US format (normalize on submit)
- Emergency fee: numeric, max 4 digits + 2 decimal places, positive value only
- Business hours end must be after business hours start
- Sleep window start and end: warn if they overlap with business hours (not a block, just a warning)
- Morning summary time: recommend before callback expected time (show warning if after)
- At least 1 technician required
- Contact email: valid email format

#### Provisioning Progress UI

After submit, show step-by-step progress:
```
✅ Provisioning phone number...
⏳ Creating client record...
⬜ Creating AI assistant...
⬜ Activating client...
⬜ Sending technician verifications...
```

Note: Order matches backend provisioning sequence — Twilio number is purchased first
(before the DB record exists), then client record is created with that number.

Each step updates in real time. On failure, show which step failed and an error message.
Show "Contact support" link on failure — do not leave admin stranded.

---

### Client Detail / Edit — /fixmynight/admin/clients/{id}

Two-panel layout:
- Left: Client info summary, status badge, Twilio number, Vapi assistant ID
- Right: Editable settings (same fields as onboarding minus technicians section)

Technician management shown below as a separate card:
- Table of techs with name, phone, verified status, on-call status
- Add tech button (triggers POST + verification SMS)
- Edit / deactivate per tech

"Send Portal Link" button triggers magic link email to client's contact_email.

"Deactivate Client" button requires confirmation modal:
"Are you sure you want to deactivate [Business Name]? Their Twilio number will stop
routing calls. This can be reversed."

---

## Client Portal

### First-Time Setup — /fixmynight/portal/setup?token={magic_link_token}

Shown when client clicks their magic link email. Simple password creation form.

Fields:
- New Password (min 8 chars, 1 number, 1 special char)
- Confirm Password

On success: set portal JWT, redirect to `/fixmynight/portal/{client_id}/dashboard`
On expired/invalid token: show "This link has expired. Contact your FixMyNight administrator
for a new link." — do not show a login form

---

### Client Portal Login — /fixmynight/portal/{client_id}

Email + password login for returning clients. The `client_id` from the URL path
is included in the login request so the backend can unambiguously identify the client.

Fields:
- Email
- Password

On submit: POST to `/api/v1/auth/portal-login` with `{email, password, client_id}`.
On success: store JWT in React state/context, redirect to dashboard.
On failure: "Invalid email or password."
Rate limited — show "Too many attempts. Please wait 15 minutes." on 429.

"Forgot password?" → prompt to contact their FixMyNight administrator.
(No self-serve password reset in V1 — admin triggers new magic link.)

---

### Client Dashboard — /fixmynight/portal/{client_id}/dashboard

Main landing page after login. Four sections:

#### 1. On-Call Status Card

Prominent top card.

```
┌─────────────────────────────────────┐
│ ON-CALL STATUS                      │
│                                     │
│  ● Dan Johnson — On Call            │
│  Since 6:15 PM                      │
│                                     │
│  Text ON/OFF to +1 (979) 652-5799   │
└─────────────────────────────────────┘
```

If no one on-call:
```
┌─────────────────────────────────────┐
│ ON-CALL STATUS                      │
│                                     │
│  ○ No technician on-call            │
│                                     │
│  Text ON to +1 (979) 652-5799       │
│  to go on-call                      │
└─────────────────────────────────────┘
```

Color coding: green dot = on-call, gray dot = no coverage.

#### 2. Recent Calls Card

Last 5 calls with urgency indicator:

```
┌──────────────────────────────────────────────────────┐
│ RECENT CALLS                          View All →     │
│                                                      │
│ 🔴 John Smith     +15551234   No heat    11:32 PM   │
│ ── Maria Garcia   +15559876   Tune-up    10:14 PM   │
│ ── Bob Williams   +15554321   Quote req   9:55 PM   │
└──────────────────────────────────────────────────────┘
```

Red dot = emergency or urgent. Dash = routine.

#### 3. Settings Summary Card

Read-only summary with "Edit Settings →" link:
- Morning summary: 7:30 AM
- Callback promise: 9:00 AM
- Emergency dispatch: On ($150 fee)
- Sleep window: 10 PM – 8 AM

#### 4. Quick Stats (last 7 days)
- Total calls
- Emergencies
- Transfers completed
- Transfer success rate

---

### Call History — /fixmynight/portal/{client_id}/calls

Full call log with filtering.

#### Filters
- Date range picker (default: last 7 days)
- Call type: All / Emergency / Routine / Message / Wrong Number / Hangup / Unknown
- Transfer status: All / Transferred / Not Transferred

#### Table Columns

| Column | Description |
|--------|-------------|
| Date/Time | In client's timezone |
| Caller | Name + phone |
| Issue | issue_summary (truncated to 60 chars, expand on click) |
| Type | Emergency / Routine / Message / Wrong Number / Hangup / Unknown badge |
| Window | Business / Evening / Sleep badge |
| Transfer | Success ✓ / Failed ✗ / Not attempted — |
| Urgent | 🔴 if flagged_urgent = TRUE |
| Summary Sent | ✓ if morning_summary_sent_at is set |

#### Row Detail Expansion

Click any row to expand:
- Full issue summary
- Fee offered / approved / declined
- Which tech transfer was attempted to (if applicable)
- Transfer success/failure

No edit functionality — call records are read-only.

---

### Settings — /fixmynight/portal/{client_id}/settings

Editable settings. Changes auto-save on blur or explicit save button.

Show "Saving..." indicator during PATCH request.
Show "Saved" confirmation for 3 seconds after success.
Show "Failed to save — please try again" on error.

If any change triggers a Vapi rebuild (detected by field name match),
show a non-blocking notice: "The AI agent's script is being updated to reflect this change.
This takes a few seconds."

#### Section: Callback Timing

| Field | Type | Notes |
|-------|------|-------|
| Morning Summary Time | Time picker | When cron fires |
| Expected Callback Time | Time picker | What the agent tells callers |

Helper: "Changes take effect on the next cron run or call."

#### Section: Business Hours

| Field | Type | Notes |
|-------|------|-------|
| Business Days | Multi-checkbox | |
| Business Hours Start | Time picker | |
| Business Hours End | Time picker | |
| Emergency Dispatch During Business Hours | Toggle | |

#### Section: Sleep Window

| Field | Type | Notes |
|-------|------|-------|
| Enable Sleep Window | Toggle | |
| Sleep Window Start | Time picker | Shown only if enabled |
| Sleep Window End | Time picker | Shown only if enabled |

#### Section: Emergency Settings

| Field | Type | Notes |
|-------|------|-------|
| Emergency Dispatch | Toggle | ON = dispatch available, OFF = voicemail only |
| Emergency Fee | Currency input | Shown only if dispatch is ON |

Warning banner if emergency dispatch is turned OFF:
"Emergency dispatch is OFF. The AI agent will log all calls for morning follow-up only.
No live transfers will be attempted."

#### Section: Notifications

| Field | Type | Notes |
|-------|------|-------|
| Contact Email | Email | For morning summary |
| Admin SMS Numbers | Phone list | For emergency fallback alerts |

---

### Team — /fixmynight/portal/{client_id}/team

View and manage technicians.

#### Technician List

| Column | Description |
|--------|-------------|
| Name | Tech name |
| Phone | Formatted phone number |
| Status | Active / Inactive |
| Verified | ✓ Verified / ⚠ Unverified (pending SMS confirmation) |
| On-Call | ● On Call / ○ Available |

#### Add Technician

Simple inline form at bottom of list:
- Name (text)
- Phone (tel, E.164 normalized)
- Submit → POST /technicians → verification SMS sent automatically

Show: "A verification SMS has been sent to [phone]. Once they reply, they'll be
able to receive emergency transfers."

#### Edit Technician

Click edit icon on row:
- Change name
- Change phone (resets verification, re-sends SMS)
- Deactivate (requires confirmation: "Deactivating [Name] will remove them from on-call
  rotation. They will not receive transfers.")

---

## State Management

Use React Context or Zustand for:
- JWT token (in-memory only — no localStorage)
- Current user role (admin or portal)
- Current client_id (for portal)

Token expiry handling:
- On any 401 SESSION_EXPIRED response: clear token, redirect to appropriate login page
  (`/fixmynight/admin` for admin, `/fixmynight/portal/{client_id}` for portal) with message
  "Your session has expired. Please log in again."
- On any 401 TOKEN_INVALID response: clear token, redirect to appropriate login page with message
  "Authentication error. Please log in again."
- On any 403 CLIENT_SCOPE_MISMATCH: redirect to appropriate login page — do not show technical detail

---

## API Integration

All API calls include Authorization header:
```
Authorization: Bearer {jwt_token}
```

Base URL: read from environment variable `VITE_API_BASE_URL` (or equivalent).
Development: `http://localhost:8000`
Production: Railway backend URL

Standard error handling:
```javascript
// On every API response
if (response.status === 401) {
  const error = await response.json()
  if (error.detail === 'SESSION_EXPIRED') {
    clearToken()
    navigate('/fixmynight/admin', { message: 'Your session has expired. Please log in again.' })
  } else {
    clearToken()
    navigate('/fixmynight/admin', { message: 'Authentication error. Please log in again.' })
  }
}
if (response.status === 429) {
  showError('Too many attempts. Please wait 15 minutes.')
}
```

---

## Design Principles

**Functional over decorative.** This is a business operations tool. Clarity and speed
matter more than visual flair. Contractors look at this on their phone first thing in the
morning — it needs to be instantly readable.

**Mobile-first.** The client portal is primarily used on mobile. Card-based layout,
large touch targets, readable at 6 AM with one eye open.

**Status at a glance.** The most important question every morning is: "What calls came in
and who is on-call right now?" Answer that before the contractor has to scroll or tap anything.

**No surprises.** Confirmations for destructive actions. Clear save states. Never leave
the user wondering if their change was saved.

---

## V1 Explicitly Out of Scope

- Click-to-call buttons on call records (V2)
- Self-serve password reset (admin sends new magic link)
- Dark mode
- Native mobile app
- Email notification preferences beyond basic on/off
- Call recording playback
- Export to CSV (nice to have, V2)
