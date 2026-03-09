"""Monthly billing summary cron job.

Runs once daily. For each active client with a Stripe subscription whose
billing cycle date matches today:
- Queries all calls for that billing period
- Computes call stats, coverage hours, and ROI
- Sends a branded HTML email via SendGrid
- Marks last_monthly_summary_sent_date to prevent duplicates
"""

import os
import time as _time
from datetime import datetime, date
from decimal import Decimal

import stripe
import pytz
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import Client, Call, CronLog
from ..services.email_service import send_html_email
from ..utils.audit import write_audit_log

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

# Tier config: calls included per tier and monthly price
TIER_CONFIG = {
    "starter": {"label": "Starter", "calls_included": 40, "price": 89},
    "standard": {"label": "Standard", "calls_included": 100, "price": 169},
    "pro": {"label": "Pro", "calls_included": 250, "price": 299},
}

OVERAGE_RATE = Decimal("1.50")


async def monthly_billing_summary_job():
    start_ms = int(_time.time() * 1000)
    matched = succeeded = failed = 0

    async with AsyncSessionLocal() as db:
        today_utc = date.today()

        # Find active clients with Stripe subscriptions that haven't been sent today
        result = await db.execute(
            select(Client).where(
                Client.status == "active",
                Client.stripe_subscription_id != None,
                Client.subscription_status == "active",
                (Client.last_monthly_summary_sent_date != today_utc)
                | (Client.last_monthly_summary_sent_date == None),
            )
        )
        clients = result.scalars().all()

        for client in clients:
            if not client.contact_email:
                continue

            try:
                billing_info = _get_billing_period(client.stripe_subscription_id)
            except Exception as e:
                print(f"[ERROR] Stripe lookup failed for {client.business_name}: {e}")
                continue

            if not billing_info:
                continue

            # Check if today is the billing date (cycle anchor day of month)
            tz = pytz.timezone(client.timezone)
            now_local = datetime.now(tz)
            today_local = now_local.date()

            if today_local.day != billing_info["billing_day"]:
                continue

            # Double-check with client-local date
            if client.last_monthly_summary_sent_date == today_local:
                continue

            matched += 1
            try:
                await _send_monthly_summary(
                    client, db, billing_info, today_local
                )
                succeeded += 1
            except Exception as e:
                failed += 1
                print(
                    f"[ERROR] Monthly summary failed for {client.business_name}: {e}"
                )

        elapsed = int(_time.time() * 1000) - start_ms
        if matched > 0:
            cron_entry = CronLog(
                created_at=datetime.utcnow(),
                job_name="monthly_billing_summary",
                clients_matched=matched,
                clients_succeeded=succeeded,
                clients_failed=failed,
                execution_ms=elapsed,
            )
            db.add(cron_entry)
            await db.commit()


def _get_billing_period(stripe_subscription_id: str) -> dict | None:
    """Fetch billing period info from Stripe subscription."""
    try:
        sub = stripe.Subscription.retrieve(stripe_subscription_id)
    except Exception:
        return None

    anchor = sub.get("billing_cycle_anchor")
    period_start = sub.get("current_period_start")
    period_end = sub.get("current_period_end")

    if not anchor or not period_start or not period_end:
        return None

    anchor_dt = datetime.utcfromtimestamp(anchor)
    start_dt = datetime.utcfromtimestamp(period_start)
    end_dt = datetime.utcfromtimestamp(period_end)

    return {
        "billing_day": anchor_dt.day,
        "period_start": start_dt,
        "period_end": end_dt,
    }


async def _send_monthly_summary(
    client, db: AsyncSession, billing_info: dict, today_local: date
):
    """Build and send the monthly summary email for a client."""
    period_start = billing_info["period_start"]
    period_end = billing_info["period_end"]

    # Query all calls in this billing period
    calls_result = await db.execute(
        select(Call)
        .where(
            Call.client_id == client.id,
            Call.created_at >= period_start,
            Call.created_at < period_end,
        )
        .order_by(Call.created_at.asc())
    )
    calls = calls_result.scalars().all()

    # Compute stats
    stats = _compute_stats(calls)

    # Tier info
    tier_key = client.subscription_tier or "standard"
    tier_cfg = TIER_CONFIG.get(tier_key, TIER_CONFIG["standard"])

    # ROI calculation
    avg_job = Decimal(str(client.avg_job_value or 250))
    retained_revenue = stats["emergency_count"] * avg_job

    # Billing calculation
    subscription_price = Decimal(str(tier_cfg["price"]))
    calls_included = tier_cfg["calls_included"]
    overage_calls = max(0, stats["total_calls"] - calls_included)
    overage_charges = Decimal(str(overage_calls)) * OVERAGE_RATE
    total_charged = subscription_price + overage_charges

    # Build email
    html = _build_html_email(
        client=client,
        stats=stats,
        tier_cfg=tier_cfg,
        avg_job=avg_job,
        retained_revenue=retained_revenue,
        subscription_price=subscription_price,
        calls_included=calls_included,
        overage_calls=overage_calls,
        overage_charges=overage_charges,
        total_charged=total_charged,
        period_start=period_start,
        period_end=period_end,
    )

    subject = f"{client.business_name} — Monthly FixMyNight Summary & Invoice"

    await send_html_email(
        to_email=client.contact_email,
        subject=subject,
        html_body=html,
    )

    # Mark as sent
    await db.execute(
        update(Client)
        .where(Client.id == client.id)
        .values(last_monthly_summary_sent_date=today_local)
    )
    await db.commit()

    await write_audit_log(
        db,
        "cron.monthly_summary_sent",
        "cron",
        client_id=client.id,
        metadata={
            "client_id": str(client.id),
            "total_calls": stats["total_calls"],
            "emergency_count": stats["emergency_count"],
            "retained_revenue": str(retained_revenue),
            "total_charged": str(total_charged),
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
        },
    )


def _compute_stats(calls) -> dict:
    """Compute call statistics for a billing period."""
    total = len(calls)
    emergency_count = sum(1 for c in calls if c.call_type == "emergency")
    message_count = sum(1 for c in calls if c.call_type == "message")
    routine_count = sum(1 for c in calls if c.call_type == "routine")
    wrong_hangup_count = sum(
        1 for c in calls if c.call_type in ("wrong_number", "hangup")
    )

    # Duration stats
    durations = [c.duration_seconds for c in calls if c.duration_seconds]
    total_duration = sum(durations) if durations else 0
    avg_duration = total_duration / len(durations) if durations else 0

    # Transfer stats
    transfers_attempted = sum(1 for c in calls if c.transfer_attempted)
    transfers_succeeded = sum(
        1 for c in calls if c.transfer_attempted and c.transfer_success
    )
    transfer_rate = (
        (transfers_succeeded / transfers_attempted * 100)
        if transfers_attempted > 0
        else None
    )

    # Coverage hours estimate: count distinct dates with calls, multiply by
    # typical after-hours window (~14 hours: 6pm-8am)
    call_dates = set()
    for c in calls:
        if c.created_at:
            call_dates.add(c.created_at.date())
    coverage_hours = len(call_dates) * 14 if call_dates else 0

    return {
        "total_calls": total,
        "emergency_count": emergency_count,
        "message_count": message_count,
        "routine_count": routine_count,
        "wrong_hangup_count": wrong_hangup_count,
        "avg_duration_seconds": int(avg_duration),
        "total_duration_seconds": total_duration,
        "coverage_hours": coverage_hours,
        "transfers_attempted": transfers_attempted,
        "transfers_succeeded": transfers_succeeded,
        "transfer_rate": transfer_rate,
    }


def _build_html_email(
    client,
    stats: dict,
    tier_cfg: dict,
    avg_job: Decimal,
    retained_revenue: Decimal,
    subscription_price: Decimal,
    calls_included: int,
    overage_calls: int,
    overage_charges: Decimal,
    total_charged: Decimal,
    period_start: datetime,
    period_end: datetime,
) -> str:
    """Build the branded HTML monthly summary email."""
    period_str = (
        f"{period_start.strftime('%b %d')} – {period_end.strftime('%b %d, %Y')}"
    )

    # Format average duration
    avg_mins = stats["avg_duration_seconds"] // 60
    avg_secs = stats["avg_duration_seconds"] % 60
    avg_duration_str = f"{avg_mins}m {avg_secs}s" if avg_mins else f"{avg_secs}s"

    # Transfer rate display
    transfer_section = ""
    if stats["transfers_attempted"] > 0:
        rate = stats["transfer_rate"]
        transfer_section = f"""
        <tr>
          <td style="padding: 8px 0; color: #94A3B8;">Transfer success rate</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{rate:.0f}% ({stats['transfers_succeeded']}/{stats['transfers_attempted']})</td>
        </tr>"""

    # Overage row
    overage_row = ""
    if overage_calls > 0:
        overage_row = f"""
        <tr>
          <td style="padding: 8px 0; color: #94A3B8;">Overage ({overage_calls} calls × $1.50)</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">${overage_charges:.2f}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{client.business_name} — Monthly Summary</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0F172A;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="padding: 0 0 32px 0; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #F1F5F9;">
                FixMyNight
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #94A3B8;">
                Monthly Summary &amp; Invoice
              </p>
            </td>
          </tr>

          <!-- Business Name & Period -->
          <tr>
            <td style="background-color: #1E293B; border-radius: 12px 12px 0 0; padding: 24px 32px;">
              <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #F1F5F9;">
                {client.business_name}
              </h2>
              <p style="margin: 4px 0 0 0; font-size: 14px; color: #94A3B8;">
                Billing period: {period_str}
              </p>
            </td>
          </tr>

          <!-- Call Summary -->
          <tr>
            <td style="background-color: #1E293B; padding: 0 32px 24px 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #D97706; text-transform: uppercase; letter-spacing: 0.05em;">
                Call Summary
              </h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Total calls handled</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{stats['total_calls']}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Emergency dispatches</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{stats['emergency_count']}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Messages taken</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{stats['message_count']}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Callbacks needed</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{stats['routine_count']}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Wrong numbers / hangups</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{stats['wrong_hangup_count']}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="background-color: #1E293B; padding: 0 32px;"><hr style="border: none; border-top: 1px solid #334155; margin: 0;"></td></tr>

          <!-- Coverage Stats -->
          <tr>
            <td style="background-color: #1E293B; padding: 24px 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #D97706; text-transform: uppercase; letter-spacing: 0.05em;">
                Coverage Stats
              </h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">After-hours coverage</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{stats['coverage_hours']} hours</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Average call duration</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{avg_duration_str}</td>
                </tr>{transfer_section}
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="background-color: #1E293B; padding: 0 32px;"><hr style="border: none; border-top: 1px solid #334155; margin: 0;"></td></tr>

          <!-- ROI Section — The Money Shot -->
          <tr>
            <td style="background-color: #1E293B; padding: 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #422006; border: 2px solid #D97706; border-radius: 8px;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #D97706; text-transform: uppercase; letter-spacing: 0.05em;">
                      Revenue Impact
                    </h3>
                    <p style="margin: 0 0 8px 0; font-size: 28px; font-weight: 800; color: #FBBF24;">
                      ${retained_revenue:,.0f} in retained revenue
                    </p>
                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #FDE68A;">
                      {stats['emergency_count']} emergency dispatch{'' if stats['emergency_count'] == 1 else 'es'} &times; ${avg_job:,.0f} avg job value
                    </p>
                    <p style="margin: 0; font-size: 13px; color: #D4A574; line-height: 1.5;">
                      These are jobs that would have gone to voicemail or a competitor.
                      FixMyNight captured them for you.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="background-color: #1E293B; padding: 0 32px;"><hr style="border: none; border-top: 1px solid #334155; margin: 0;"></td></tr>

          <!-- Plan Usage -->
          <tr>
            <td style="background-color: #1E293B; padding: 24px 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #D97706; text-transform: uppercase; letter-spacing: 0.05em;">
                Plan Usage
              </h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Plan</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{tier_cfg['label']}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">Calls used</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">{stats['total_calls']} of {calls_included}</td>
                </tr>
                {"<tr><td style='padding: 8px 0; color: #FBBF24;'>Overage calls</td><td style='padding: 8px 0; text-align: right; font-weight: 600; color: #FBBF24;'>" + str(overage_calls) + " at $1.50 each</td></tr>" if overage_calls > 0 else ""}
              </table>
              <!-- Usage bar -->
              <div style="margin-top: 12px; background-color: #334155; border-radius: 4px; height: 8px; overflow: hidden;">
                <div style="background-color: {'#D97706' if stats['total_calls'] <= calls_included else '#EF4444'}; height: 8px; width: {min(100, int(stats['total_calls'] / calls_included * 100)) if calls_included else 0}%; border-radius: 4px;"></div>
              </div>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748B; text-align: right;">
                {min(100, int(stats['total_calls'] / calls_included * 100)) if calls_included else 0}% used
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="background-color: #1E293B; padding: 0 32px;"><hr style="border: none; border-top: 1px solid #334155; margin: 0;"></td></tr>

          <!-- Billing -->
          <tr>
            <td style="background-color: #1E293B; padding: 24px 32px; border-radius: 0 0 12px 12px;">
              <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #D97706; text-transform: uppercase; letter-spacing: 0.05em;">
                Billing
              </h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; color: #94A3B8;">{tier_cfg['label']} subscription</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #F1F5F9;">${subscription_price:.2f}</td>
                </tr>{overage_row}
                <tr>
                  <td colspan="2" style="padding: 12px 0 0 0;"><hr style="border: none; border-top: 1px solid #334155; margin: 0;"></td>
                </tr>
                <tr>
                  <td style="padding: 12px 0 0 0; color: #F1F5F9; font-weight: 700; font-size: 16px;">Total charged</td>
                  <td style="padding: 12px 0 0 0; text-align: right; font-weight: 700; font-size: 18px; color: #F1F5F9;">${total_charged:.2f}</td>
                </tr>
              </table>
              <p style="margin: 16px 0 0 0; font-size: 13px; color: #64748B;">
                Payment processed via your card on file.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748B;">
                FixMyNight by <a href="https://fixmyday.ai" style="color: #D97706; text-decoration: none;">fixmyday.ai</a>
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #475569;">
                Questions about your bill? Reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
