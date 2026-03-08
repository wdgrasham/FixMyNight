# DEPLOYMENT-SPEC.md
# FixMyNight — Deployment & Infrastructure Specification
# Version: 1.6 | Status: Authoritative Source of Truth

---

## Infrastructure Overview

| Service | Provider | Purpose |
|---------|---------|---------|
| Backend API | Railway | FastAPI app + cron jobs |
| Database | Railway PostgreSQL | All persistent data |
| Frontend | Vercel | fixmyday.ai |
| Domain | Porkbun | fixmyday.ai |
| Voice AI | Vapi | {agent_name} voice agent |
| Phone / SMS | Twilio | Inbound calls + SMS |
| Email | SendGrid | Morning summary delivery |

---

## Railway — Backend Setup

### Service Configuration

- Runtime: Python 3.11
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Auto-deploy: enabled on main branch push

### Required Environment Variables

Set all of these in Railway dashboard → Service → Variables before first deploy.
Never commit secrets to code.

| Variable | Description | Example / Notes |
|---------|-------------|----------------|
| `DATABASE_URL` | PostgreSQL connection string | Auto-set by Railway PostgreSQL plugin |
| `VAPI_API_KEY` | Vapi REST API key | From Vapi dashboard → Account |
| `VAPI_WEBHOOK_SECRET` | Shared secret for webhook validation | Generate: `openssl rand -hex 32` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | From Twilio console |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | From Twilio console |
| `TWILIO_DEFAULT_NUMBER` | Fallback SMS sender number | E.164 format |
| `JWT_SECRET` | Signs all JWT tokens | Generate: `openssl rand -hex 64` |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password | See hashing instructions below |
| `ADMIN_PHONE` | Admin phone for system alerts | E.164 format |
| `SENDGRID_API_KEY` | SendGrid API key | From SendGrid dashboard |
| `SENDGRID_FROM_EMAIL` | Verified sender email | e.g. `noreply@fixmyday.ai` |
| `ENVIRONMENT` | Deployment environment | `production` |
| `FRONTEND_URL` | Frontend base URL for magic links and CORS | `https://fixmyday.ai` |
| `ADMIN_USERNAME` | Admin login username (optional override) | Default: `admin` |

### Generating ADMIN_PASSWORD_HASH

Run this once locally to generate the bcrypt hash. Never store the plaintext password.

```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
print(pwd_context.hash("your-admin-password-here"))
# Copy the output → paste as ADMIN_PASSWORD_HASH in Railway
```

### Health Check Endpoint

```python
# Add to main.py
@app.get("/health")
async def health():
    return {"status": "ok", "service": "fixmynight-backend"}
```

### Railway PostgreSQL Plugin

Add PostgreSQL plugin to Railway project. DATABASE_URL is automatically injected.
The URL format from Railway is `postgres://...` — the backend replaces this with
`postgresql+asyncpg://...` at startup. See BACKEND-SPEC.md — Database Setup.

---

## Database Initialization

Run once after first deploy. Do not run again on an existing database.

### Step 1: Verify pgcrypto

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SELECT gen_random_uuid();
-- Must return a UUID. If error, contact Railway support.
```

### Step 2: Run Migration

Connect to Railway PostgreSQL via Railway CLI or dashboard query tool:

```bash
# Using Railway CLI
railway run python -c "
import asyncio
from app.database import engine
from app.models import Base

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(create_tables())
"
```

Or run the SQL from DATABASE-SCHEMA.md directly in the Railway query tool.

### Step 3: Verify Tables

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Should show: audit_logs, calls, clients, cron_log, routing_rules, technicians
```

### Step 4: Run Seed Data

After confirming Stellar HVAC values with client, run seed data from DATABASE-SCHEMA.md.

---

## Twilio Setup

### Account Requirements

- Active Twilio account
- A2P 10DLC registration completed (see A2P section below)
- At least one purchased phone number for Stellar HVAC

### Phone Number Configuration

For each client phone number in Twilio:

1. Go to Twilio Console → Phone Numbers → Active Numbers → [select number]
2. Voice & Fax section:
   - "A Call Comes In": Webhook
   - URL: Leave blank — Vapi handles inbound voice via its own Twilio integration
   - Vapi connects directly to Twilio numbers via the Vapi phone number provisioning
3. Messaging section:
   - "A Message Comes In": Webhook
   - URL: `https://[railway-domain]/api/v1/webhooks/twilio-sms`
   - HTTP Method: POST

### Vapi — Twilio Number Linkage

In Vapi dashboard:
1. Go to Phone Numbers → Import
2. Import the Twilio number using Twilio credentials
3. Assign the imported number to the Stellar HVAC assistant

Alternatively, use Vapi API to create the phone number association:

```bash
curl -X POST https://api.vapi.ai/phone-number \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "twilio",
    "number": "+19796525799",
    "twilioAccountSid": "'"$TWILIO_ACCOUNT_SID"'",
    "twilioAuthToken": "'"$TWILIO_AUTH_TOKEN"'",
    "assistantId": "[stellar-hvac-assistant-id]"
  }'
```

### Twilio A2P 10DLC Registration

Required for sending SMS messages commercially in the US. Without registration,
messages will be filtered and delivery is unreliable.

**Registration components:**
1. **Brand Registration** — registers your business (FixMyNight / fixmyday.ai)
2. **Campaign Registration** — registers the use case (technician on-call alerts)

**Campaign description to use:**

```
Campaign Use Case: Notifications

Description:
FixMyNight is an after-hours answering service for service contractors and trade businesses.
SMS messages are sent to registered technicians to manage on-call scheduling
(e.g., "Text ON to go on-call") and to notify business owners of after-hours calls
and emergency dispatch status. All message recipients have opted in by being added
as technicians or clients by the account administrator.

Sample Messages:
1. "Hi Dan, you've been added as a technician for Stellar HVAC via FixMyNight.
   Text ON to go on-call when your shift starts."
2. "Dan Johnson is now on-call for Stellar HVAC."
3. "Stellar HVAC — Overnight Summary: 2 routine callbacks, 1 urgent.
   — FixMyNight"
4. "After-hours coverage begins in 15 minutes for Stellar HVAC.
   Text ON to go on-call."

Opt-in method: Recipients are added by the business administrator during
account setup. Technicians receive an initial opt-in SMS and can reply STOP to
opt out at any time.
```

**Timeline:** A2P registration typically takes 1–7 business days. Do not launch
production SMS until registration is approved.

---

## Vapi Setup

### Account Configuration

1. Create Vapi account at vapi.ai
2. Add OpenAI API key in Vapi dashboard → Providers
3. Add ElevenLabs API key in Vapi dashboard → Providers
4. Note your Vapi API key from dashboard → Account → API Keys

### Webhook Configuration

In Vapi dashboard → Settings → Webhooks:
- Server URL: `https://[railway-domain]/api/v1/webhooks/vapi-intake`
- Secret: same value as `VAPI_WEBHOOK_SECRET` env var

### Stellar HVAC Assistant

The Stellar HVAC assistant already exists. After deploying the backend:

1. Note the existing assistant ID from Vapi dashboard
2. Update the Stellar HVAC client record in DB with this `vapi_assistant_id`
3. Push the V1.6 prompt to the existing assistant via PATCH:

```bash
curl -X PATCH https://api.vapi.ai/assistant/[assistant-id] \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": {
      "systemPrompt": "[paste prompt from build_sarah_prompt output]"
    },
    "tools": [
      [paste tool definitions from VAPI-PROMPT-SPEC.md]
    ]
  }'
```

---

## Vercel — Frontend Setup

### Project Configuration

- Framework: React (Vite recommended) or Next.js
- Build command: `npm run build`
- Output directory: `dist` (Vite) or `.next` (Next.js)
- Root directory: frontend project root

### Environment Variables in Vercel

| Variable | Value |
|---------|-------|
| `VITE_API_BASE_URL` | Railway backend URL (e.g. `https://fixmynight-backend.up.railway.app`) |

### Custom Domain

In Vercel → Project → Domains:
- Add `fixmyday.ai`
- Add `www.fixmyday.ai`

In Porkbun DNS:
- Add CNAME record: `www` → `cname.vercel-dns.com`
- Add A record: `@` → Vercel IP (shown in Vercel domain setup)

---

## Porkbun — DNS Configuration

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | [Vercel IP] | 600 |
| CNAME | www | cname.vercel-dns.com | 600 |
| CNAME | api | [Railway domain] | 600 |

Optional: point `api.fixmyday.ai` → Railway backend for cleaner API URLs.

---

## SendGrid — Email Setup

### Account Setup

1. Create SendGrid account
2. Verify sender domain (fixmyday.ai) in SendGrid → Settings → Sender Authentication
3. Generate API key: Settings → API Keys → Create API Key (Mail Send permission only)
4. Add key to Railway as `SENDGRID_API_KEY`

### Email Template

Morning summary emails are plain text. No HTML template required in V1.
Subject line format: `[Business Name] — Overnight Summary [Date]`
From: `noreply@fixmyday.ai` (or configured SENDGRID_FROM_EMAIL)

---

## Deployment Checklist

### Pre-Deploy

- [ ] All Railway environment variables set
- [ ] Railway PostgreSQL plugin added
- [ ] `ADMIN_PASSWORD_HASH` generated and set
- [ ] `VAPI_WEBHOOK_SECRET` generated and set in both Railway and Vapi dashboard
- [ ] `JWT_SECRET` generated and set

### Database Init

- [ ] `pgcrypto` extension verified
- [ ] Migration script run successfully
- [ ] All 6 tables present: audit_logs, calls, clients, cron_log, routing_rules, technicians
- [ ] Validation queries from DATABASE-SCHEMA.md all pass
- [ ] Stellar HVAC seed data confirmed with client and inserted

### Vapi

- [ ] Existing Stellar HVAC assistant ID noted
- [ ] `vapi_assistant_id` updated in clients table
- [ ] V1.6 prompt pushed to existing assistant
- [ ] Both tools (transferCall, logCall) confirmed in assistant config
- [ ] Webhook URL set in Vapi dashboard
- [ ] Webhook secret matches Railway env var
- [ ] Test call placed — logCall webhook fires and is received

### Twilio

- [ ] Stellar HVAC number SMS webhook set to Railway URL
- [ ] Twilio number imported into Vapi and linked to Stellar HVAC assistant
- [ ] Test SMS from tech phone — system responds correctly
- [ ] A2P registration submitted (do not go live until approved)

### Frontend

- [ ] Frontend deployed to Vercel
- [ ] `VITE_API_BASE_URL` set to Railway backend URL
- [ ] Custom domain configured in Vercel
- [ ] DNS records set in Porkbun
- [ ] Admin login works end to end
- [ ] Client portal magic link flow works

### SendGrid

- [ ] Sender domain verified
- [ ] Test morning summary email sent successfully

### End-to-End Test

- [ ] Place test call to Stellar HVAC Twilio number
- [ ] {agent_name} answers with recording disclosure
- [ ] Routine call: logCall fires, call appears in admin dashboard
- [ ] Tech texts ON: on-call status updates, owner receives SMS
- [ ] Emergency call with fee: fee offered, approval collected, transferCall fires
- [ ] Transfer to tech: call bridges successfully
- [ ] Morning summary: fires at configured time, email received

---

## Rollback Procedure

If a deploy breaks production:

1. In Railway → Deployments → select last working deploy → Redeploy
2. Database schema changes cannot be auto-rolled back — keep migration scripts versioned
3. If Vapi assistant is broken: revert via PATCH to last known good prompt
   (keep previous prompt text in version control)
4. Twilio numbers are not affected by backend deploys

---

## Monitoring

### Railway Logs

View real-time logs in Railway dashboard → Service → Logs.

Key log lines to watch:
- `[ERROR] DB write failed after transfer:` — transfer succeeded but record lost
- `[ERROR] Onboarding failed:` — client provisioning failure
- Cron job completion logs (see cron implementations in BACKEND-SPEC.md)

### Alerts

The system sends SMS alerts to `ADMIN_PHONE` for:
- Client provisioning failures
- Any unhandled exception in onboarding flow

No automated alerting for cron failures in V1 — check Railway logs daily until
monitoring tooling is added.

---

## Local Development Setup

```bash
# Clone repo
git clone [repo-url]
cd fixmynight

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file (never commit this)
cp .env.example .env
# Fill in test values for all env vars

# Run migrations against local PostgreSQL
python -m alembic upgrade head
# Or run migration SQL directly

# Start backend
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd ../frontend
npm install
npm run dev
```

### Local .env.example

```
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/fixmynight
VAPI_API_KEY=test_key
VAPI_WEBHOOK_SECRET=local_test_secret
TWILIO_ACCOUNT_SID=test_sid
TWILIO_AUTH_TOKEN=test_token
TWILIO_DEFAULT_NUMBER=+15551234567
JWT_SECRET=local_dev_secret_not_for_production
JWT_ALGORITHM=HS256
ADMIN_PASSWORD_HASH=[generate locally]
ADMIN_PHONE=+15551234567
SENDGRID_API_KEY=test_key
SENDGRID_FROM_EMAIL=test@fixmyday.ai
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
```

---

## Security Notes

- `JWT_SECRET` must be cryptographically random and never reused across environments
- `VAPI_WEBHOOK_SECRET` must match exactly between Railway and Vapi dashboard
- Never log JWT tokens, passwords, or API keys in Railway logs
- `ADMIN_PASSWORD_HASH` — keep plaintext password in a password manager, not in any file
- Rotate `JWT_SECRET` invalidates all active sessions — coordinate with any logged-in users
- Railway environment variables are encrypted at rest — do not copy them to other storage
