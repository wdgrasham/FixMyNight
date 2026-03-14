"""Service health monitoring — checks balances and usage across all external services."""

import os
import asyncio
import time
from datetime import datetime, timedelta
from decimal import Decimal

import httpx
import stripe

# ---------------------------------------------------------------------------
# Cache: store results for 15 minutes to avoid hammering external APIs
# ---------------------------------------------------------------------------
_cache: dict = {}
_cache_ttl = 900  # 15 minutes

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < _cache_ttl:
        return entry["data"]
    return None


def _cache_set(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


def _cache_clear():
    _cache.clear()


# ---------------------------------------------------------------------------
# Individual service checks
# ---------------------------------------------------------------------------

async def _check_vapi() -> dict:
    """Check Vapi spend via their analytics API."""
    api_key = os.environ.get("VAPI_API_KEY", "")
    if not api_key:
        return {"status": "error", "error": "VAPI_API_KEY not configured"}

    try:
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        async with httpx.AsyncClient(timeout=15) as client:
            # Use analytics endpoint — the only one that returns spend data
            # Query 1: total spend this month
            # Query 2: total spend last 7 days (for burn rate)
            # Query 3: call count this month
            seven_days_ago = now - timedelta(days=7)

            resp = await client.post(
                "https://api.vapi.ai/analytics",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "queries": [
                        {
                            "table": "call",
                            "name": "month_spend",
                            "timeRange": {
                                "start": month_start.isoformat() + "Z",
                                "end": now.isoformat() + "Z",
                            },
                            "operations": [{"operation": "sum", "column": "cost"}],
                        },
                        {
                            "table": "call",
                            "name": "week_spend",
                            "timeRange": {
                                "start": seven_days_ago.isoformat() + "Z",
                                "end": now.isoformat() + "Z",
                            },
                            "operations": [{"operation": "sum", "column": "cost"}],
                        },
                        {
                            "table": "call",
                            "name": "month_calls",
                            "timeRange": {
                                "start": month_start.isoformat() + "Z",
                                "end": now.isoformat() + "Z",
                            },
                            "operations": [{"operation": "count", "column": "id"}],
                        },
                    ]
                },
            )

            if resp.status_code in (200, 201):
                data = resp.json()
                month_spend = 0
                week_spend = 0
                month_calls = 0

                for query in data:
                    name = query.get("name", "")
                    results = query.get("result", [])
                    if name == "month_spend" and results:
                        month_spend = results[0].get("sumCost", 0) or 0
                    elif name == "week_spend" and results:
                        week_spend = results[0].get("sumCost", 0) or 0
                    elif name == "month_calls" and results:
                        month_calls = results[0].get("countId", 0) or 0

                daily_burn = week_spend / 7 if week_spend else 0

                return {
                    "status": "ok",
                    "spend_this_month": round(month_spend, 2),
                    "spend_last_7d": round(week_spend, 2),
                    "daily_burn_rate": round(daily_burn, 2),
                    "calls_this_month": int(month_calls),
                    "dashboard_url": "https://dashboard.vapi.ai/billing",
                    "warning": daily_burn > 5,
                    "critical": daily_burn > 10,
                }
            else:
                return {
                    "status": "error",
                    "error": f"Analytics API returned {resp.status_code}",
                    "dashboard_url": "https://dashboard.vapi.ai/billing",
                }
    except Exception as e:
        return {"status": "error", "error": str(e), "dashboard_url": "https://dashboard.vapi.ai/billing"}


async def _check_twilio() -> dict:
    """Check Twilio account balance and phone number count."""
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    if not sid or not token:
        return {"status": "error", "error": "Twilio credentials not configured"}

    try:
        from twilio.rest import Client as TwilioClient

        def _fetch():
            client = TwilioClient(sid, token)
            balance = client.api.v2010.account.balance.fetch()
            numbers = client.incoming_phone_numbers.list()
            # Get SMS count this month
            today = datetime.utcnow()
            month_start = today.replace(day=1).strftime("%Y-%m-%d")
            messages = client.messages.list(date_sent_after=month_start, limit=1000)
            return balance, numbers, len(messages)

        balance, numbers, sms_count = await asyncio.to_thread(_fetch)
        bal = float(balance.balance)
        return {
            "status": "ok",
            "balance": bal,
            "currency": balance.currency,
            "phone_numbers": len(numbers),
            "sms_this_month": sms_count,
            "warning": bal < 10,
            "critical": bal < 5,
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "dashboard_url": "https://console.twilio.com"}


async def _check_anthropic() -> dict:
    """Check Anthropic API — no public balance endpoint, so just verify key works."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"status": "error", "error": "ANTHROPIC_API_KEY not configured"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # No balance API exists — just verify the key works with a minimal request
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "hi"}],
                },
            )
            if resp.status_code == 200:
                return {
                    "status": "ok",
                    "note": "API key valid -- no balance API available",
                    "dashboard_url": "https://console.anthropic.com/settings/billing",
                    "warning": False,
                    "critical": False,
                }
            elif resp.status_code == 401:
                return {"status": "error", "error": "Invalid API key"}
            elif resp.status_code == 429:
                return {
                    "status": "warning",
                    "note": "Rate limited -- key valid but hitting limits",
                    "dashboard_url": "https://console.anthropic.com/settings/billing",
                    "warning": True,
                    "critical": False,
                }
            else:
                data = resp.json()
                error_msg = data.get("error", {}).get("message", f"HTTP {resp.status_code}")
                # Check for credit balance errors
                if "credit" in error_msg.lower() or "balance" in error_msg.lower():
                    return {
                        "status": "error",
                        "error": error_msg,
                        "dashboard_url": "https://console.anthropic.com/settings/billing",
                        "warning": True,
                        "critical": True,
                    }
                return {
                    "status": "ok",
                    "note": error_msg,
                    "dashboard_url": "https://console.anthropic.com/settings/billing",
                    "warning": False,
                    "critical": False,
                }
    except Exception as e:
        return {"status": "error", "error": str(e), "dashboard_url": "https://console.anthropic.com/settings/billing"}


async def _check_stripe() -> dict:
    """Check Stripe balance, active subscriptions, and MRR."""
    if not stripe.api_key:
        return {"status": "error", "error": "STRIPE_SECRET_KEY not configured"}

    try:
        def _fetch():
            balance = stripe.Balance.retrieve()
            subs = stripe.Subscription.list(status="active", limit=100)
            # Get charges this month for revenue
            today = datetime.utcnow()
            month_start = int(today.replace(day=1, hour=0, minute=0, second=0).timestamp())
            charges = stripe.Charge.list(created={"gte": month_start}, limit=100)
            return balance, subs, charges

        balance, subs, charges = await asyncio.to_thread(_fetch)

        # Available balance (in cents)
        available = sum(b.amount for b in balance.available) / 100 if balance.available else 0
        pending = sum(b.amount for b in balance.pending) / 100 if balance.pending else 0

        # Count active subs and calculate MRR
        active_subs = len(subs.data)
        mrr = 0
        for sub in subs.data:
            for item in sub.get("items", {}).get("data", []):
                price = item.get("price", {})
                amount = (price.get("unit_amount") or 0) / 100
                interval = price.get("recurring", {}).get("interval", "month")
                if interval == "month":
                    mrr += amount
                elif interval == "year":
                    mrr += amount / 12

        # Revenue this month
        revenue_this_month = sum(c.amount for c in charges.data if c.paid) / 100

        return {
            "status": "ok",
            "available_balance": available,
            "pending_balance": pending,
            "active_subscriptions": active_subs,
            "mrr": round(mrr, 2),
            "revenue_this_month": round(revenue_this_month, 2),
            "warning": False,
            "critical": False,
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "dashboard_url": "https://dashboard.stripe.com"}


async def _check_sendgrid() -> dict:
    """Check SendGrid — usage stats, plan info, and daily/monthly send counts."""
    api_key = os.environ.get("SENDGRID_API_KEY", "")
    if not api_key:
        return {"status": "error", "error": "SENDGRID_API_KEY not configured"}

    try:
        today = datetime.utcnow()
        month_start = today.replace(day=1).strftime("%Y-%m-%d")
        today_str = today.strftime("%Y-%m-%d")
        headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(timeout=15) as client:
            # Fetch all in parallel: monthly stats, today stats, account info
            month_resp, today_resp, account_resp = await asyncio.gather(
                client.get(
                    "https://api.sendgrid.com/v3/stats",
                    params={"start_date": month_start, "end_date": today_str},
                    headers=headers,
                ),
                client.get(
                    "https://api.sendgrid.com/v3/stats",
                    params={"start_date": today_str, "end_date": today_str},
                    headers=headers,
                ),
                client.get(
                    "https://api.sendgrid.com/v3/user/account",
                    headers=headers,
                ),
            )

            # Parse monthly stats
            month_sent = month_delivered = month_bounces = 0
            if month_resp.status_code == 200:
                for day in month_resp.json():
                    for metric in day.get("stats", []):
                        m = metric.get("metrics", {})
                        month_sent += m.get("requests", 0)
                        month_delivered += m.get("delivered", 0)
                        month_bounces += m.get("bounces", 0)

            # Parse today stats
            today_sent = today_delivered = 0
            if today_resp.status_code == 200:
                for day in today_resp.json():
                    for metric in day.get("stats", []):
                        m = metric.get("metrics", {})
                        today_sent += m.get("requests", 0)
                        today_delivered += m.get("delivered", 0)

            # Parse account/plan info
            plan_name = "Unknown"
            plan_type = "Unknown"
            if account_resp.status_code == 200:
                acct = account_resp.json()
                plan_name = acct.get("type", "Unknown")
                plan_type = acct.get("reputation", plan_name)

            # Free tier: 100/day. Essentials+: effectively unlimited daily, monthly cap.
            daily_limit = 100 if plan_name.lower() == "free" else None
            warning = daily_limit and today_sent >= daily_limit * 0.8
            critical = daily_limit and today_sent >= daily_limit

            result = {
                "status": "ok",
                "emails_sent_today": today_sent,
                "emails_delivered_today": today_delivered,
                "emails_sent_month": month_sent,
                "emails_delivered_month": month_delivered,
                "bounces_month": month_bounces,
                "plan": plan_name,
                "dashboard_url": "https://app.sendgrid.com",
                "warning": bool(warning),
                "critical": bool(critical),
            }
            if daily_limit:
                result["daily_limit"] = daily_limit
            return result

    except Exception as e:
        return {"status": "error", "error": str(e), "dashboard_url": "https://app.sendgrid.com"}


def _check_railway() -> dict:
    """Railway has no simple balance API — return static info with dashboard link."""
    return {
        "status": "ok",
        "note": "Check Railway dashboard for usage and billing",
        "dashboard_url": "https://railway.com/account/billing",
        "warning": False,
        "critical": False,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def get_all_service_status(force_refresh: bool = False) -> dict:
    """Check all services. Returns cached data unless force_refresh=True."""
    if force_refresh:
        _cache_clear()

    cached = _cache_get("all_services")
    if cached:
        return cached

    # Run all checks concurrently
    vapi_task = asyncio.create_task(_check_vapi())
    twilio_task = asyncio.create_task(_check_twilio())
    anthropic_task = asyncio.create_task(_check_anthropic())
    stripe_task = asyncio.create_task(_check_stripe())
    sendgrid_task = asyncio.create_task(_check_sendgrid())

    vapi, twilio, anthropic, stripe_res, sendgrid = await asyncio.gather(
        vapi_task, twilio_task, anthropic_task, stripe_task, sendgrid_task
    )

    railway = _check_railway()

    result = {
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "services": {
            "vapi": {"name": "Vapi", "description": "AI Voice Agent", **vapi},
            "twilio": {"name": "Twilio", "description": "SMS & Phone Numbers", **twilio},
            "anthropic": {"name": "Anthropic", "description": "Claude Haiku (Transcripts)", **anthropic},
            "stripe": {"name": "Stripe", "description": "Payment Processing", **stripe_res},
            "sendgrid": {"name": "SendGrid", "description": "Email Delivery", **sendgrid},
            "railway": {"name": "Railway", "description": "Backend Hosting", **railway},
        },
    }

    _cache_set("all_services", result)
    return result
