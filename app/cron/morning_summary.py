"""Morning summary cron job.

Runs every 60 seconds. For each active client whose summary_send_time has
passed in their local timezone and hasn't been sent today:
- Fetches unsent calls
- Builds grouped summary (emergencies > callbacks > messages > junk count)
- Sends via email (primary) or SMS (fallback)
- Marks calls as sent, marks client as sent today
"""

import time as _time
from datetime import datetime, date
import pytz
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import Client, Call, Technician, CronLog
from ..services.email_service import send_summary_email
from ..services.twilio_service import send_sms
from ..utils.audit import write_audit_log


async def morning_summary_job():
    start_ms = int(_time.time() * 1000)
    matched = succeeded = failed = 0

    async with AsyncSessionLocal() as db:
        today_utc = date.today()
        result = await db.execute(
            select(Client).where(
                Client.status == "active",
                (Client.last_summary_sent_date != today_utc) | (Client.last_summary_sent_date == None),
            )
        )
        for client in result.scalars():
            tz = pytz.timezone(client.timezone)
            now_local = datetime.now(tz)
            today = now_local.date()

            # Double-check with client-local date (SQL used UTC date as pre-filter)
            if client.last_summary_sent_date == today:
                continue
            # Skip if not yet time
            if now_local.time() < client.summary_send_time:
                continue

            matched += 1
            try:
                await _maybe_send_morning_summary(client, db)
                succeeded += 1
            except Exception as e:
                failed += 1
                print(f"[ERROR] Morning summary failed for {client.business_name}: {e}")

        elapsed = int(_time.time() * 1000) - start_ms
        if matched > 0:
            cron_entry = CronLog(
                created_at=datetime.utcnow(),
                job_name="morning_summary",
                clients_matched=matched,
                clients_succeeded=succeeded,
                clients_failed=failed,
                execution_ms=elapsed,
            )
            db.add(cron_entry)
            await db.commit()


async def _maybe_send_morning_summary(client, db: AsyncSession):
    tz = pytz.timezone(client.timezone)
    now = datetime.now(tz)
    today = now.date()

    # Fetch unsent calls, ordered urgent first
    calls_result = await db.execute(
        select(Call)
        .where(
            Call.client_id == client.id,
            Call.morning_summary_sent_at == None,
        )
        .order_by(Call.flagged_urgent.desc(), Call.created_at.asc())
    )
    calls = calls_result.scalars().all()

    # Pre-fetch tech names for transferred calls
    tech_ids = [c.transferred_to_tech_id for c in calls if c.transferred_to_tech_id]
    tech_names = {}
    if tech_ids:
        tech_result = await db.execute(
            select(Technician).where(Technician.id.in_(tech_ids))
        )
        tech_names = {t.id: t.name for t in tech_result.scalars()}

    summary = _build_summary(client, calls, tz, tech_names)

    try:
        if client.contact_email:
            date_str = now.strftime("%B %d, %Y")
            await send_summary_email(
                to_email=client.contact_email,
                subject=f"{client.business_name} — Overnight Summary {date_str}",
                body=summary,
            )
            delivery = "email"
        else:
            await send_sms(client.owner_phone, summary[:1600])
            delivery = "sms"

        call_ids = [c.id for c in calls]
        if call_ids:
            await db.execute(
                update(Call)
                .where(Call.id.in_(call_ids))
                .values(morning_summary_sent_at=datetime.utcnow())
            )
        # Mark summary as sent today (prevents re-sends including empty summaries)
        await db.execute(
            update(Client)
            .where(Client.id == client.id)
            .values(last_summary_sent_date=today)
        )
        await db.commit()

        await write_audit_log(
            db,
            "cron.morning_summary_sent",
            "cron",
            client_id=client.id,
            metadata={
                "client_id": str(client.id),
                "call_count": len(calls),
                "urgent_count": sum(1 for c in calls if c.flagged_urgent),
                "delivery": delivery,
            },
        )
    except Exception as e:
        await write_audit_log(
            db,
            "cron.morning_summary_failed",
            "cron",
            client_id=client.id,
            metadata={"client_id": str(client.id), "error": str(e)},
        )
        raise


def _build_summary(client, calls, tz, tech_names=None) -> str:
    tech_names = tech_names or {}
    if not calls:
        return (
            f"{client.business_name} — No calls received overnight. "
            f"Have a great day.\n— FixMyNight"
        )

    emergencies = [c for c in calls if c.call_type == "emergency"]
    routines = [c for c in calls if c.call_type == "routine"]
    messages = [c for c in calls if c.call_type == "message"]
    wrong_numbers = [c for c in calls if c.call_type == "wrong_number"]
    hangups = [c for c in calls if c.call_type in ("hangup", "unknown")]
    lines = [f"{client.business_name} — Overnight Summary\n"]

    if emergencies:
        lines.append(f"EMERGENCIES ({len(emergencies)}):")
        for c in emergencies:
            ct = c.created_at.astimezone(tz)
            hour = ct.hour % 12 or 12
            t = f"{hour}:{ct.minute:02d} {'AM' if ct.hour < 12 else 'PM'}"
            lines.append(
                f"\U0001f534 {c.caller_name or 'Unknown'} ({c.caller_phone}) "
                f"— {c.issue_summary or 'No details'}"
            )
            if c.transfer_attempted and c.transfer_success:
                tech_display = tech_names.get(
                    c.transferred_to_tech_id, c.transferred_to_phone
                )
                lines.append(f"   Transferred to {tech_display} at {t} \u2713")
            elif c.transfer_attempted:
                lines.append(f"   Transfer attempted at {t} — failed")
        lines.append("")

    if routines:
        lines.append(f"CALLBACKS NEEDED ({len(routines)}):")
        for c in routines:
            lines.append(
                f"\u2022 {c.caller_name or 'Unknown'} ({c.caller_phone}) "
                f"— {c.issue_summary or 'No details'}"
            )
        lines.append("")

    if messages:
        lines.append(f"MESSAGES ({len(messages)}):")
        for c in messages:
            lines.append(
                f'\u2022 {c.caller_name or "Unknown"} '
                f'— "{c.issue_summary or "No details"}"'
            )
            if c.caller_phone:
                lines.append(f"  Contact: {c.caller_phone}")
            else:
                lines.append("  No callback requested.")
        lines.append("")

    # "Also received" line — only if there were wrong numbers or hangups
    also_parts = []
    if wrong_numbers:
        also_parts.append(f"{len(wrong_numbers)} wrong number(s)")
    if hangups:
        also_parts.append(f"{len(hangups)} hangup(s)")
    if also_parts:
        lines.append(f"Also received: {', '.join(also_parts)}.")
        lines.append("")

    lines.append("— FixMyNight | fixmyday.ai")
    return "\n".join(lines)
