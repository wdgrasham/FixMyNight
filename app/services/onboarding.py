"""Client onboarding / provisioning service.

Atomic provisioning sequence:
1. Purchase Twilio number
2. Create pending client record
3. Create Vapi assistant
4. Import Twilio number into Vapi
5. Activate client
6. Create routing_rules
7. Add technicians + send verification SMS
"""

import os
from datetime import datetime, time as dt_time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update

from ..models import Client, Technician, RoutingRule
from .prompt_builder import build_sarah_prompt
from .vapi import create_vapi_assistant, import_twilio_number_to_vapi, delete_vapi_assistant, delete_vapi_phone_number
from .twilio_service import purchase_twilio_number, release_twilio_number, send_sms, send_verification_sms

TIME_FIELDS = {
    "business_hours_start",
    "business_hours_end",
    "sleep_window_start",
    "sleep_window_end",
    "summary_send_time",
    "callback_expected_time",
}


def _parse_time(value) -> dt_time:
    if value is None:
        return None
    if isinstance(value, dt_time):
        return value
    parts = str(value).split(":")
    return dt_time(int(parts[0]), int(parts[1]))


async def provision_client(payload, db: AsyncSession) -> Client:
    """Atomic provisioning. Purchase Twilio number first, then create client."""
    twilio_number = None
    vapi_assistant_id = None
    client = None

    try:
        # Step 1: Purchase Twilio number
        twilio_number = await purchase_twilio_number(payload.timezone)

        # Step 2: Create pending client record
        client_data = payload.model_dump(exclude={"technicians"})

        # Convert time strings to time objects
        for field in TIME_FIELDS:
            if field in client_data and client_data[field] is not None:
                client_data[field] = _parse_time(client_data[field])

        # Handle industry_config default
        if client_data.get("industry_config") is None:
            client_data["industry_config"] = {}

        client = Client(
            **client_data,
            twilio_number=twilio_number,
            status="pending",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(client)
        await db.commit()
        await db.refresh(client)

        # Step 3: Create Vapi assistant
        prompt = build_sarah_prompt(client, time_window="evening")
        vapi_assistant_id = await create_vapi_assistant(client, prompt)

        # Step 3b: Import Twilio number into Vapi
        vapi_phone_number_id = await import_twilio_number_to_vapi(
            twilio_number, vapi_assistant_id
        )

        await db.execute(
            update(Client)
            .where(Client.id == client.id)
            .values(
                vapi_assistant_id=vapi_assistant_id,
                vapi_phone_number_id=vapi_phone_number_id,
            )
        )
        await db.commit()

        # Step 4: Activate client
        await db.execute(
            update(Client)
            .where(Client.id == client.id)
            .values(status="active")
        )
        await db.commit()

        # Step 5: Create routing_rules
        # Derive after-hours from schedule or legacy fields
        after_start = dt_time(18, 0)
        after_end = dt_time(8, 0)
        schedule = client.business_hours_schedule
        if schedule:
            # Find the latest end time across all enabled days
            for day_cfg in schedule.values():
                if isinstance(day_cfg, dict) and day_cfg.get("enabled") and day_cfg.get("end"):
                    t = _parse_time(day_cfg["end"])
                    if t and t > after_start:
                        after_start = t
                if isinstance(day_cfg, dict) and day_cfg.get("enabled") and day_cfg.get("start"):
                    t = _parse_time(day_cfg["start"])
                    if t and t < after_end:
                        after_end = t
        else:
            after_start = client.business_hours_end or dt_time(18, 0)
            after_end = client.business_hours_start or dt_time(8, 0)
        rule = RoutingRule(
            client_id=client.id,
            after_hours_start=after_start,
            after_hours_end=after_end,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(rule)
        await db.commit()

        # Step 6: Add technicians and send verification SMS
        for tech_data in payload.technicians or []:
            tech = Technician(
                client_id=client.id,
                name=tech_data.name,
                phone=tech_data.phone,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(tech)
            await db.commit()
            await db.refresh(tech)
            try:
                await send_verification_sms(tech, client)
            except Exception as sms_err:
                print(f"[WARNING] Verification SMS failed for {tech.name}: {sms_err}")

        return client

    except Exception as e:
        # Rollback all external resources
        if twilio_number:
            try:
                await release_twilio_number(twilio_number)
            except Exception:
                pass
        if vapi_assistant_id:
            try:
                await delete_vapi_assistant(vapi_assistant_id)
            except Exception:
                pass
        if client:
            try:
                await db.execute(
                    update(Client)
                    .where(Client.id == client.id)
                    .values(status="failed")
                )
                await db.commit()
            except Exception:
                pass
        admin_phone = os.environ.get("ADMIN_PHONE")
        if admin_phone:
            try:
                await send_sms(
                    admin_phone,
                    f"[FixMyNight] Onboarding FAILED for {payload.business_name}: {str(e)}",
                )
            except Exception:
                pass
        raise


async def complete_setup(client_id: str, db: AsyncSession) -> Client:
    """Provision a pending_setup client: purchase Twilio number, create Vapi
    assistant, import number to Vapi, create routing_rules, activate client."""
    from sqlalchemy import select

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise ValueError("Client not found")
    if client.status not in ("pending_setup", "failed"):
        raise ValueError(f"Client status is '{client.status}', expected 'pending_setup' or 'failed'")

    twilio_number = None
    vapi_assistant_id = None

    try:
        # Step 1: Purchase Twilio number
        twilio_number = await purchase_twilio_number(client.timezone)

        # Step 2: Create Vapi assistant
        prompt = build_sarah_prompt(client, time_window="evening")
        vapi_assistant_id = await create_vapi_assistant(client, prompt)

        # Step 3: Import Twilio number into Vapi
        vapi_phone_number_id = await import_twilio_number_to_vapi(
            twilio_number, vapi_assistant_id
        )

        # Step 4: Update client record
        await db.execute(
            update(Client)
            .where(Client.id == client.id)
            .values(
                twilio_number=twilio_number,
                vapi_assistant_id=vapi_assistant_id,
                vapi_phone_number_id=vapi_phone_number_id,
                status="active",
                updated_at=datetime.utcnow(),
            )
        )
        await db.commit()

        # Step 5: Create routing_rules
        after_start = dt_time(18, 0)
        after_end = dt_time(8, 0)
        schedule = client.business_hours_schedule
        if schedule:
            for day_cfg in schedule.values():
                if isinstance(day_cfg, dict) and day_cfg.get("enabled") and day_cfg.get("end"):
                    t = _parse_time(day_cfg["end"])
                    if t and t > after_start:
                        after_start = t
                if isinstance(day_cfg, dict) and day_cfg.get("enabled") and day_cfg.get("start"):
                    t = _parse_time(day_cfg["start"])
                    if t and t < after_end:
                        after_end = t
        else:
            after_start = client.business_hours_end or dt_time(18, 0)
            after_end = client.business_hours_start or dt_time(8, 0)
        rule = RoutingRule(
            client_id=client.id,
            after_hours_start=after_start,
            after_hours_end=after_end,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(rule)
        await db.commit()

        await db.refresh(client)
        return client

    except Exception as e:
        # Cleanup on failure — don't roll back client record, let admin retry
        if vapi_assistant_id:
            try:
                await delete_vapi_assistant(vapi_assistant_id)
            except Exception:
                pass
        if twilio_number:
            try:
                await release_twilio_number(twilio_number)
            except Exception:
                pass
        raise


async def change_twilio_number(client_id: str, db: AsyncSession, manual_number: str = None) -> Client:
    """Replace the Twilio number on an existing client."""
    from sqlalchemy import select

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise ValueError("Client not found")

    old_twilio_number = client.twilio_number
    old_vapi_phone_number_id = client.vapi_phone_number_id

    new_number = None

    try:
        # Step 1: Get the new number
        if manual_number:
            new_number = manual_number
        else:
            new_number = await purchase_twilio_number(client.timezone)

        # Step 2: Delete old phone number from Vapi (if it exists)
        if old_vapi_phone_number_id:
            try:
                await delete_vapi_phone_number(old_vapi_phone_number_id)
            except Exception as e:
                print(f"[WARNING] Failed to delete old Vapi phone number: {e}")

        # Step 3: Import new number into Vapi (if assistant exists)
        new_vapi_phone_number_id = None
        if client.vapi_assistant_id:
            new_vapi_phone_number_id = await import_twilio_number_to_vapi(
                new_number, client.vapi_assistant_id
            )

        # Step 4: Update client record
        await db.execute(
            update(Client)
            .where(Client.id == client.id)
            .values(
                twilio_number=new_number,
                vapi_phone_number_id=new_vapi_phone_number_id,
                updated_at=datetime.utcnow(),
            )
        )
        await db.commit()

        # Step 5: Release old Twilio number (only if it was real, not a placeholder)
        if old_twilio_number and not old_twilio_number.startswith("pending_"):
            try:
                await release_twilio_number(old_twilio_number)
            except Exception as e:
                print(f"[WARNING] Failed to release old Twilio number {old_twilio_number}: {e}")

        await db.refresh(client)
        return client

    except Exception as e:
        # If we purchased a new number but failed to complete the swap, release it
        if new_number and not manual_number:
            try:
                await release_twilio_number(new_number)
            except Exception:
                pass
        raise
