"""T-15 on-call reminder cron job.

Runs every 60 seconds. For each active client with routing rules, checks if
after_hours_start is 14-16 minutes away in the client's local timezone.
If so, sends SMS to all active verified technicians reminding them to go on-call.
"""

import time as _time
from datetime import datetime
import pytz
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import Client, RoutingRule, Technician, CronLog
from ..services.twilio_service import send_sms
from ..utils.audit import write_audit_log


async def oncall_reminder_job():
    start_ms = int(_time.time() * 1000)
    matched = succeeded = failed = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Client, RoutingRule)
            .join(RoutingRule, RoutingRule.client_id == Client.id)
            .where(Client.status == "active", RoutingRule.is_active == True)
        )
        for client, rule in result:
            tz = pytz.timezone(client.timezone)
            now = datetime.now(tz)
            after_hours_today = tz.localize(
                datetime.combine(now.date(), rule.after_hours_start)
            )
            minutes_until = (after_hours_today - now).total_seconds() / 60

            today = now.date()
            if (
                14 <= minutes_until <= 16
                and rule.last_oncall_reminder_date != today
            ):
                matched += 1
                try:
                    techs = await db.execute(
                        select(Technician).where(
                            Technician.client_id == client.id,
                            Technician.is_active == True,
                            Technician.phone_verified == True,
                        )
                    )
                    for tech in techs.scalars():
                        await send_sms(
                            tech.phone,
                            f"After-hours coverage begins in 15 minutes for "
                            f"{client.business_name}. Text ON to go on-call.",
                            from_number=client.twilio_number,
                        )
                    # Prevent double-fire
                    await db.execute(
                        update(RoutingRule)
                        .where(RoutingRule.id == rule.id)
                        .values(last_oncall_reminder_date=today)
                    )
                    await db.commit()
                    await write_audit_log(
                        db,
                        "cron.oncall_reminder_sent",
                        "cron",
                        client_id=client.id,
                        metadata={
                            "client_id": str(client.id),
                            "minutes_until_after_hours": 15,
                        },
                    )
                    succeeded += 1
                except Exception as e:
                    failed += 1
                    print(
                        f"[ERROR] On-call reminder failed for {client.business_name}: {e}"
                    )

        elapsed = int(_time.time() * 1000) - start_ms
        if matched > 0:
            cron_entry = CronLog(
                created_at=datetime.utcnow(),
                job_name="oncall_reminder",
                clients_matched=matched,
                clients_succeeded=succeeded,
                clients_failed=failed,
                execution_ms=elapsed,
            )
            db.add(cron_entry)
            await db.commit()
