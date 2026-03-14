import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .limiter import limiter
from .routers import auth, admin, portal, webhooks, sms, stripe_billing
from .cron.morning_summary import morning_summary_job
from .cron.oncall_reminder import oncall_reminder_job
from .cron.monthly_billing_summary import monthly_billing_summary_job
from .cron.overage_reporting import overage_reporting_job
from .database import engine, AsyncSessionLocal
from .models import SystemSetting, Client

scheduler = AsyncIOScheduler()


async def _setup_fallback_assistant():
    """Ensure the generic Vapi fallback assistant exists (for reference/testing).

    We do NOT set assistantId on phone numbers — doing so prevents Vapi from
    sending assistant-request webhooks, which we need for dynamic prompt
    building (time windows, on-call tech, business name, etc.).
    Phone numbers use serverUrl only; assistant-request returns full config.
    """
    from .services.vapi import ensure_fallback_assistant

    try:
        async with AsyncSessionLocal() as db:
            fallback_id = await ensure_fallback_assistant(db)
            print(f"[INFO] Vapi fallback assistant ready ({fallback_id})")
    except Exception as e:
        print(f"[WARNING] Fallback assistant setup failed (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure system_settings table exists (added for admin password reset)
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS system_settings ("
            "  key TEXT PRIMARY KEY,"
            "  value TEXT NOT NULL,"
            "  updated_at TIMESTAMPTZ DEFAULT NOW()"
            ")"
        ))
        # Add vapi_cost column if it doesn't exist yet
        await conn.execute(text(
            "ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_cost DECIMAL(10,4)"
        ))
        # Add Stripe subscription columns
        for col in ["stripe_customer_id", "stripe_subscription_id", "subscription_tier", "subscription_status"]:
            await conn.execute(text(
                f"ALTER TABLE clients ADD COLUMN IF NOT EXISTS {col} TEXT"
            ))
        # Add monthly billing summary columns
        await conn.execute(text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS avg_job_value DECIMAL(10,2) DEFAULT 250.00"
        ))
        await conn.execute(text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_monthly_summary_sent_date DATE"
        ))
        # Per-day business hours schedule
        await conn.execute(text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_hours_schedule JSONB"
        ))
        # Backfill business_hours_schedule from old fields for existing clients
        await conn.execute(text("""
            UPDATE clients SET business_hours_schedule = jsonb_build_object(
                'monday', jsonb_build_object('enabled', 1 = ANY(business_days), 'start',
                    CASE WHEN 1 = ANY(business_days) THEN to_char(business_hours_start, 'HH24:MI') END,
                    'end', CASE WHEN 1 = ANY(business_days) THEN to_char(business_hours_end, 'HH24:MI') END),
                'tuesday', jsonb_build_object('enabled', 2 = ANY(business_days), 'start',
                    CASE WHEN 2 = ANY(business_days) THEN to_char(business_hours_start, 'HH24:MI') END,
                    'end', CASE WHEN 2 = ANY(business_days) THEN to_char(business_hours_end, 'HH24:MI') END),
                'wednesday', jsonb_build_object('enabled', 3 = ANY(business_days), 'start',
                    CASE WHEN 3 = ANY(business_days) THEN to_char(business_hours_start, 'HH24:MI') END,
                    'end', CASE WHEN 3 = ANY(business_days) THEN to_char(business_hours_end, 'HH24:MI') END),
                'thursday', jsonb_build_object('enabled', 4 = ANY(business_days), 'start',
                    CASE WHEN 4 = ANY(business_days) THEN to_char(business_hours_start, 'HH24:MI') END,
                    'end', CASE WHEN 4 = ANY(business_days) THEN to_char(business_hours_end, 'HH24:MI') END),
                'friday', jsonb_build_object('enabled', 5 = ANY(business_days), 'start',
                    CASE WHEN 5 = ANY(business_days) THEN to_char(business_hours_start, 'HH24:MI') END,
                    'end', CASE WHEN 5 = ANY(business_days) THEN to_char(business_hours_end, 'HH24:MI') END),
                'saturday', jsonb_build_object('enabled', 6 = ANY(business_days), 'start',
                    CASE WHEN 6 = ANY(business_days) THEN to_char(business_hours_start, 'HH24:MI') END,
                    'end', CASE WHEN 6 = ANY(business_days) THEN to_char(business_hours_end, 'HH24:MI') END),
                'sunday', jsonb_build_object('enabled', 7 = ANY(business_days), 'start',
                    CASE WHEN 7 = ANY(business_days) THEN to_char(business_hours_start, 'HH24:MI') END,
                    'end', CASE WHEN 7 = ANY(business_days) THEN to_char(business_hours_end, 'HH24:MI') END)
            )
            WHERE business_hours_schedule IS NULL
              AND business_hours_start IS NOT NULL
              AND business_hours_end IS NOT NULL
              AND business_days IS NOT NULL
        """))
        # Overage billing columns
        await conn.execute(text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan_call_limit INTEGER"
        ))
        await conn.execute(text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_overage_reported_date DATE"
        ))
        # Backfill plan_call_limit from subscription_tier for existing clients
        await conn.execute(text(
            "UPDATE clients SET plan_call_limit = CASE "
            "WHEN subscription_tier = 'starter' THEN 40 "
            "WHEN subscription_tier = 'standard' THEN 100 "
            "WHEN subscription_tier = 'pro' THEN 250 END "
            "WHERE subscription_tier IS NOT NULL AND plan_call_limit IS NULL"
        ))

        # Daytime tier columns
        await conn.execute(text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS daytime_enabled BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_faq JSONB NOT NULL DEFAULT '{}'"
        ))

    # Startup: start cron scheduler
    scheduler.add_job(morning_summary_job, "interval", minutes=1, id="morning_summary")
    scheduler.add_job(oncall_reminder_job, "interval", minutes=1, id="oncall_reminder")
    scheduler.add_job(monthly_billing_summary_job, "cron", hour=10, minute=0, id="monthly_billing_summary")
    scheduler.add_job(overage_reporting_job, "cron", hour=9, minute=0, id="overage_reporting")
    scheduler.start()
    print("[INFO] APScheduler started — morning_summary + oncall_reminder + monthly_billing_summary + overage_reporting jobs running")

    # Ensure Vapi fallback assistant exists and all phone numbers use it
    await _setup_fallback_assistant()

    yield
    # Shutdown
    scheduler.shutdown()
    print("[INFO] APScheduler shut down")


app = FastAPI(title="FixMyNight API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(portal.router)
app.include_router(webhooks.router)
app.include_router(sms.router)
app.include_router(stripe_billing.router)


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok", "service": "fixmynight-backend"}
