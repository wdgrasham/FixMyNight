import os
import json
import secrets
import uuid
import stripe
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from datetime import datetime

from ..database import get_db
from ..models import Client
from ..auth import hash_password
from ..services.email_service import send_summary_email

router = APIRouter(tags=["stripe"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Map Stripe price IDs to tier names
PRICE_TO_TIER = {
    "price_1TB2n0F4SIXUt9GkOxh9DN64": "starter",
    "price_1TB2lRF4SIXUt9GkYaN8EJBh": "standard",
    "price_1TB2kDF4SIXUt9Gk1oFeL5PA": "pro",
}

TIER_LABELS = {"starter": "Starter", "standard": "Standard", "pro": "Pro"}

TIER_CALL_LIMITS = {"starter": 50, "standard": 100, "pro": 250}

OVERAGE_PRICE_ID = "price_1T9BhJF4SIXUt9GkCc06OboB"

VALID_PRICE_IDS = set(PRICE_TO_TIER.keys())


@router.post("/api/v1/stripe/create-checkout-session")
async def create_checkout_session(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    price_id = body.get("price_id")
    client_id = body.get("client_id")

    if not price_id or price_id not in VALID_PRICE_IDS:
        raise HTTPException(status_code=400, detail="INVALID_PRICE_ID")

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    checkout_params: dict = {
        "mode": "subscription",
        "payment_method_types": ["card"],
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": f"{frontend_url}/fixmynight?checkout=success#pricing",
        "cancel_url": f"{frontend_url}/fixmynight?checkout=canceled#pricing",
        "metadata": {"tier": PRICE_TO_TIER[price_id]},
        "custom_fields": [
            {
                "key": "business_name",
                "label": {"type": "custom", "custom": "Business Name"},
                "type": "text",
            },
            {
                "key": "owner_name",
                "label": {"type": "custom", "custom": "Owner Full Name"},
                "type": "text",
            },
        ],
        "phone_number_collection": {"enabled": True},
    }

    # If client_id provided, attach it as metadata for webhook to link subscription
    if client_id:
        result = await db.execute(select(Client).where(Client.id == client_id))
        client = result.scalar_one_or_none()
        if client:
            checkout_params["metadata"]["client_id"] = str(client.id)
            # Reuse existing Stripe customer if we have one
            if client.stripe_customer_id:
                checkout_params["customer"] = client.stripe_customer_id
            elif client.contact_email:
                checkout_params["customer_email"] = client.contact_email

    session = stripe.checkout.Session.create(**checkout_params)
    return {"url": session.url}


@router.post("/api/v1/webhooks/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except stripe.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="INVALID_SIGNATURE")
    else:
        # No webhook secret configured — parse payload directly (dev/test mode)
        event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)

    event_type = event["type"]

    if event_type == "checkout.session.completed":
        try:
            session = event["data"]["object"]
            metadata = session.get("metadata") or {}
            client_id = metadata.get("client_id")
            tier = metadata.get("tier")
            customer_id = session.get("customer")
            subscription_id = session.get("subscription")

            plan_limit = TIER_CALL_LIMITS.get(tier)

            if client_id:
                # Existing client — link Stripe IDs and set plan limit
                await db.execute(
                    update(Client)
                    .where(Client.id == client_id)
                    .values(
                        stripe_customer_id=customer_id,
                        stripe_subscription_id=subscription_id,
                        subscription_tier=tier,
                        subscription_status="active",
                        plan_call_limit=plan_limit,
                        updated_at=datetime.utcnow(),
                    )
                )
                await db.commit()
                print(f"[STRIPE] Checkout completed: client={client_id} tier={tier} sub={subscription_id}")
            else:
                # New signup — auto-create client
                await _handle_new_signup(db, session, tier, customer_id, subscription_id, plan_limit)

            # Add overage metered price as second subscription item
            if subscription_id:
                try:
                    stripe.SubscriptionItem.create(
                        subscription=subscription_id,
                        price=OVERAGE_PRICE_ID,
                    )
                    print(f"[STRIPE] Added overage price item to subscription {subscription_id}")
                except Exception as e:
                    print(f"[WARNING] Failed to add overage price item: {e}")
        except Exception as e:
            print(f"[ERROR] checkout.session.completed handler crashed: {e}")
            import traceback
            traceback.print_exc()
            # Return 200 so Stripe stops retrying — the error is logged for manual review
            return {"received": True, "error": "handler_failed"}

    elif event_type in (
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        subscription = event["data"]["object"]
        stripe_sub_id = subscription.get("id")
        status = subscription.get("status")  # active, past_due, canceled, unpaid, etc.

        # Find client by subscription ID
        result = await db.execute(
            select(Client).where(Client.stripe_subscription_id == stripe_sub_id)
        )
        client = result.scalar_one_or_none()
        if client:
            new_values = {
                "subscription_status": status,
                "updated_at": datetime.utcnow(),
            }
            # Update tier and plan limit if subscription items changed
            if subscription.get("items", {}).get("data"):
                for item in subscription["items"]["data"]:
                    price_id = item.get("price", {}).get("id", "")
                    new_tier = PRICE_TO_TIER.get(price_id)
                    if new_tier:
                        new_values["subscription_tier"] = new_tier
                        new_values["plan_call_limit"] = TIER_CALL_LIMITS.get(new_tier)
                        break
            # If subscription was deleted/canceled
            if status == "canceled":
                new_values["subscription_tier"] = None
                new_values["stripe_subscription_id"] = None
                new_values["plan_call_limit"] = None

            await db.execute(
                update(Client).where(Client.id == client.id).values(**new_values)
            )
            await db.commit()
            print(f"[STRIPE] Subscription {event_type}: client={client.id} status={status}")

    return {"received": True}


async def _handle_new_signup(db, session, tier, customer_id, subscription_id, plan_limit=None):
    """Auto-create a client record from Stripe checkout data."""
    # Duplicate-webhook protection: if this Stripe customer already exists, skip creation
    if customer_id:
        existing = await db.execute(
            select(Client).where(Client.stripe_customer_id == customer_id)
        )
        if existing.scalar_one_or_none():
            print(f"[STRIPE] Duplicate webhook — customer {customer_id} already exists, skipping")
            return

    # Extract custom fields — use `or` to handle None values from Stripe
    custom_fields = session.get("custom_fields") or []
    custom_data = {}
    for field in custom_fields:
        key = field.get("key", "")
        text_val = field.get("text") or {}
        custom_data[key] = text_val.get("value", "") if isinstance(text_val, dict) else ""

    business_name = custom_data.get("business_name", "").strip() or "New Business"
    owner_name = custom_data.get("owner_name", "").strip() or "Owner"

    # Get email and phone from customer_details — use `or` to handle None from Stripe
    customer_details = session.get("customer_details") or {}
    owner_email = customer_details.get("email") or ""
    owner_phone = customer_details.get("phone") or ""

    # Normalize phone — Stripe returns E.164 format already, but handle edge cases
    if owner_phone and not owner_phone.startswith("+"):
        phone_digits = "".join(c for c in owner_phone if c.isdigit())
        if len(phone_digits) == 10:
            owner_phone = f"+1{phone_digits}"
        elif len(phone_digits) == 11 and phone_digits.startswith("1"):
            owner_phone = f"+{phone_digits}"
    if not owner_phone:
        owner_phone = "+10000000000"

    # Generate a random portal password (admin will send magic link later)
    random_password = secrets.token_urlsafe(16)
    password_hash = hash_password(random_password)

    # Create client record — unique placeholder avoids UNIQUE constraint on twilio_number
    try:
        client = Client(
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            business_name=business_name,
            owner_name=owner_name,
            owner_phone=owner_phone,
            contact_email=owner_email,
            industry="general",
            twilio_number=f"pending_{uuid.uuid4().hex[:8]}",
            status="pending_setup",
            stripe_customer_id=customer_id,
            stripe_subscription_id=subscription_id,
            subscription_tier=tier,
            subscription_status="active",
            plan_call_limit=plan_limit,
            portal_password_hash=password_hash,
        )
        db.add(client)
        await db.commit()
        await db.refresh(client)
    except IntegrityError as e:
        await db.rollback()
        print(f"[ERROR] Stripe signup IntegrityError (likely duplicate): {e}")
        return

    tier_label = TIER_LABELS.get(tier, tier)
    print(f"[STRIPE] New signup created: client={client.id} business={business_name} tier={tier}")

    # Send welcome email to customer
    try:
        await send_summary_email(
            owner_email,
            f"Welcome to FixMyNight — {tier_label} Plan",
            f"Hi {owner_name},\n\n"
            f"Welcome to FixMyNight! Your {tier_label} subscription is now active.\n\n"
            f"Our team is setting up your after-hours line and will have everything "
            f"ready within 24 hours. You'll receive your portal login credentials "
            f"once setup is complete.\n\n"
            f"If you have any questions in the meantime, reply to this email.\n\n"
            f"— The FixMyNight Team",
        )
    except Exception as e:
        print(f"[WARNING] Welcome email failed: {e}")

    # Send admin notification
    admin_email = os.environ.get("ADMIN_EMAIL", "")
    if admin_email:
        try:
            await send_summary_email(
                admin_email,
                f"New FixMyNight Signup: {business_name} ({tier_label})",
                f"New FixMyNight signup!\n\n"
                f"Business: {business_name}\n"
                f"Owner: {owner_name}\n"
                f"Email: {owner_email}\n"
                f"Phone: {owner_phone}\n"
                f"Tier: {tier_label}\n"
                f"Stripe Customer: {customer_id}\n\n"
                f"Log into the admin portal to complete setup:\n"
                f"- Assign a Twilio number\n"
                f"- Configure business hours and settings\n"
                f"- Create the Vapi assistant\n"
                f"- Change status to 'active' to trigger portal invite\n",
            )
        except Exception as e:
            print(f"[WARNING] Admin notification email failed: {e}")
