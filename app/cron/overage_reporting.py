"""Overage reporting cron job.

Runs daily at 9 AM UTC. For each active client with a Stripe subscription,
checks if tomorrow is their billing renewal date. If so, counts calls in the
current billing period. If calls exceed plan_call_limit, reports overage
quantity to Stripe via usage records on the metered subscription item.
"""

import os
import time as _time
from datetime import datetime, date, timedelta

import stripe
import pytz
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import Client, Call, CronLog
from ..utils.audit import write_audit_log

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

OVERAGE_PRICE_ID = "price_1T9BhJF4SIXUt9GkCc06OboB"


async def overage_reporting_job():
    start_ms = int(_time.time() * 1000)
    matched = succeeded = failed = 0

    async with AsyncSessionLocal() as db:
        today_utc = date.today()

        # Find active clients with subscriptions and plan limits
        result = await db.execute(
            select(Client).where(
                Client.status == "active",
                Client.stripe_subscription_id != None,
                Client.subscription_status == "active",
                Client.plan_call_limit != None,
                (Client.last_overage_reported_date != today_utc)
                | (Client.last_overage_reported_date == None),
            )
        )
        clients = result.scalars().all()

        for client in clients:
            try:
                should_report, overage_count = await _check_and_report(
                    client, db, today_utc
                )
                if should_report:
                    matched += 1
                    if overage_count >= 0:
                        succeeded += 1
            except Exception as e:
                failed += 1
                print(
                    f"[ERROR] Overage reporting failed for {client.business_name}: {e}"
                )

        elapsed = int(_time.time() * 1000) - start_ms
        if matched > 0 or failed > 0:
            cron_entry = CronLog(
                created_at=datetime.utcnow(),
                job_name="overage_reporting",
                clients_matched=matched,
                clients_succeeded=succeeded,
                clients_failed=failed,
                execution_ms=elapsed,
            )
            db.add(cron_entry)
            await db.commit()


async def _check_and_report(
    client, db: AsyncSession, today_utc: date
) -> tuple[bool, int]:
    """Check if tomorrow is billing day and report overage if needed.

    Returns (should_report, overage_count). overage_count is -1 on error.
    """
    import asyncio

    # Get subscription info from Stripe
    def _get_sub():
        return stripe.Subscription.retrieve(client.stripe_subscription_id)

    sub = await asyncio.to_thread(_get_sub)

    anchor = sub.get("billing_cycle_anchor")
    if not anchor:
        return False, -1

    anchor_day = datetime.utcfromtimestamp(anchor).day

    # Check if tomorrow (in client's timezone) is billing day
    tz = pytz.timezone(client.timezone)
    now_local = datetime.now(tz)
    tomorrow_local = (now_local + timedelta(days=1)).date()

    if tomorrow_local.day != anchor_day:
        return False, -1

    # Already reported for this cycle
    if client.last_overage_reported_date == today_utc:
        return False, -1

    # Count calls in current billing period
    period_start = datetime.utcfromtimestamp(sub["current_period_start"])
    period_end = datetime.utcfromtimestamp(sub["current_period_end"])

    call_count_result = await db.execute(
        select(func.count())
        .select_from(Call)
        .where(
            Call.client_id == client.id,
            Call.created_at >= period_start,
            Call.created_at < period_end,
        )
    )
    total_calls = call_count_result.scalar() or 0
    overage_calls = max(0, total_calls - client.plan_call_limit)

    # Find the overage subscription item
    overage_item_id = None
    for item in sub["items"]["data"]:
        if item["price"]["id"] == OVERAGE_PRICE_ID:
            overage_item_id = item["id"]
            break

    if overage_item_id and overage_calls > 0:
        # Report usage to Stripe
        def _report_usage():
            stripe.SubscriptionItem.create_usage_record(
                overage_item_id,
                quantity=overage_calls,
                action="set",
            )

        await asyncio.to_thread(_report_usage)
        print(
            f"[OVERAGE] Reported {overage_calls} overage calls for "
            f"{client.business_name} (total: {total_calls}, limit: {client.plan_call_limit})"
        )
    elif overage_calls == 0:
        print(
            f"[OVERAGE] {client.business_name}: {total_calls}/{client.plan_call_limit} "
            f"calls -- no overage"
        )

    # Mark as reported regardless (prevents duplicate runs)
    await db.execute(
        update(Client)
        .where(Client.id == client.id)
        .values(last_overage_reported_date=today_utc)
    )
    await db.commit()

    if overage_calls > 0:
        await write_audit_log(
            db,
            "billing.overage_reported",
            "cron",
            client_id=client.id,
            metadata={
                "total_calls": total_calls,
                "plan_limit": client.plan_call_limit,
                "overage_calls": overage_calls,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
            },
        )

    return True, overage_calls
