import os
import stripe
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime

from ..database import get_db
from ..models import Client

router = APIRouter(tags=["stripe"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Map Stripe price IDs to tier names
PRICE_TO_TIER = {
    "price_1T8vmdF4SIXUt9Gk4fwXzQZH": "starter",
    "price_1T8vnEF4SIXUt9Gk1AmWw7X0": "standard",
    "price_1T8vnnF4SIXUt9GkUAZEokFf": "pro",
}

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
        "success_url": f"{frontend_url}/fixmynight/pricing?success=true",
        "cancel_url": f"{frontend_url}/fixmynight/pricing?canceled=true",
        "metadata": {"tier": PRICE_TO_TIER[price_id]},
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
        import json
        event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)

    event_type = event["type"]

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata", {})
        client_id = metadata.get("client_id")
        tier = metadata.get("tier")
        customer_id = session.get("customer")
        subscription_id = session.get("subscription")

        if client_id:
            await db.execute(
                update(Client)
                .where(Client.id == client_id)
                .values(
                    stripe_customer_id=customer_id,
                    stripe_subscription_id=subscription_id,
                    subscription_tier=tier,
                    subscription_status="active",
                    updated_at=datetime.utcnow(),
                )
            )
            await db.commit()
            print(f"[STRIPE] Checkout completed: client={client_id} tier={tier} sub={subscription_id}")

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
            # If subscription was deleted/canceled
            if status == "canceled":
                new_values["subscription_tier"] = None
                new_values["stripe_subscription_id"] = None

            await db.execute(
                update(Client).where(Client.id == client.id).values(**new_values)
            )
            await db.commit()
            print(f"[STRIPE] Subscription {event_type}: client={client.id} status={status}")

    return {"received": True}
