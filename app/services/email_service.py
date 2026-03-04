import os
import asyncio
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


async def send_summary_email(to_email: str, subject: str, body: str):
    """Send a plain text email via SendGrid."""
    message = Mail(
        from_email=os.environ["SENDGRID_FROM_EMAIL"],
        to_emails=to_email,
        subject=subject,
        plain_text_content=body,
    )
    sg = SendGridAPIClient(os.environ["SENDGRID_API_KEY"])
    await asyncio.to_thread(sg.send, message)
