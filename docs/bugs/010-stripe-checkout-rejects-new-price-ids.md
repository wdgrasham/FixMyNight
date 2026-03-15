# BUG-010: Stripe Checkout Rejects New Price IDs

**Date:** 2026-03-15
**Severity:** Critical (blocks all purchases)
**Status:** FIXED

## Symptom

Clicking "Get Started" on any pricing tier did nothing. The Stripe
checkout redirect was silently failing.

## Root Cause

Frontend price IDs were updated to new Stripe prices ($99/$179/$399)
but the backend `PRICE_TO_TIER` mapping in `stripe_billing.py` still
had the OLD price IDs ($89/$169/$299). The backend validation rejected
the new IDs with `INVALID_PRICE_ID` (HTTP 400).

Frontend (updated):
```
price_1TB2n0F4SIXUt9GkOxh9DN64  (starter $99)
price_1TB2lRF4SIXUt9GkYaN8EJBh  (standard $179)
price_1TB2kDF4SIXUt9Gk1oFeL5PA  (pro $399)
```

Backend (stale):
```
price_1T8vmdF4SIXUt9Gk4fwXzQZH  (starter $89)
price_1T8vnEF4SIXUt9Gk1AmWw7X0  (standard $169)
price_1T8vnnF4SIXUt9GkUAZEokFf  (pro $299)
```

Also: `TIER_CALL_LIMITS` had Starter at 40 calls instead of 50.

## Fix

Updated `PRICE_TO_TIER` and `TIER_CALL_LIMITS` in
`app/routers/stripe_billing.py` to match the new Stripe prices.

## Lesson

When updating Stripe price IDs, always update both frontend AND backend
in the same commit.

## File

`app/routers/stripe_billing.py`

## Commit

`505cd60`
