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
from .database import engine
from .models import SystemSetting

scheduler = AsyncIOScheduler()


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

    # Startup: start cron scheduler
    scheduler.add_job(morning_summary_job, "interval", minutes=1, id="morning_summary")
    scheduler.add_job(oncall_reminder_job, "interval", minutes=1, id="oncall_reminder")
    scheduler.add_job(monthly_billing_summary_job, "cron", hour=10, minute=0, id="monthly_billing_summary")
    scheduler.add_job(overage_reporting_job, "cron", hour=9, minute=0, id="overage_reporting")
    scheduler.start()
    print("[INFO] APScheduler started — morning_summary + oncall_reminder + monthly_billing_summary + overage_reporting jobs running")
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "fixmynight-backend"}
