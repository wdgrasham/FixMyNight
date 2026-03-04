import asyncio
from twilio.rest import Client as TwilioClient
import os


def get_twilio_client():
    return TwilioClient(
        os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"]
    )


async def send_sms(to: str, body: str, from_number: str = None):
    """Send SMS via Twilio. Uses asyncio.to_thread to avoid blocking the event loop."""
    client = get_twilio_client()
    await asyncio.to_thread(
        client.messages.create,
        to=to,
        from_=from_number or os.environ["TWILIO_DEFAULT_NUMBER"],
        body=body,
    )


async def send_verification_sms(tech, client):
    """Send welcome SMS to a newly added technician."""
    await send_sms(
        tech.phone,
        f"Hi {tech.name}, you've been added as a technician for {client.business_name} "
        f"via FixMyNight. Text ON to go on-call when your shift starts.",
        from_number=client.twilio_number,
    )


async def purchase_twilio_number(timezone: str = "America/Chicago") -> str:
    """Purchase a local Twilio number. Returns the E.164 number."""
    client = get_twilio_client()
    # Map timezone to area code region (simplified — Texas for now)
    available = await asyncio.to_thread(
        lambda: client.available_phone_numbers("US").local.list(limit=1)
    )
    if not available:
        raise Exception("No Twilio numbers available")
    number = await asyncio.to_thread(
        lambda: client.incoming_phone_numbers.create(phone_number=available[0].phone_number)
    )
    return number.phone_number


async def release_twilio_number(phone_number: str):
    """Release a purchased Twilio number."""
    client = get_twilio_client()
    numbers = await asyncio.to_thread(
        lambda: client.incoming_phone_numbers.list(phone_number=phone_number)
    )
    for num in numbers:
        await asyncio.to_thread(num.delete)
