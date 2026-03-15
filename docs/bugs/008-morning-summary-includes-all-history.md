# BUG-008: Morning Summary Includes All Historical Calls

**Date:** 2026-03-15
**Severity:** High
**Status:** FIXED

## Symptom

Morning summary email for Stellar HVAC included 13 emergencies spanning
multiple days of testing. Should have only included calls since the last
summary was sent.

## Root Cause

The morning summary query in `_maybe_send_morning_summary()` only filtered
by `morning_summary_sent_at == None` — no date bound. Every historical call
that was never included in a prior summary got pulled in.

```python
# BEFORE (broken)
select(Call).where(
    Call.client_id == client.id,
    Call.morning_summary_sent_at == None,
)
```

## Fix

Capture `prev_summary_date` before the claim step, then add a date cutoff:

```python
prev_summary_date = client.last_summary_sent_date
# ... claim step ...
if prev_summary_date:
    cutoff = datetime.combine(prev_summary_date, datetime.min.time(), tzinfo=tz)
else:
    cutoff = now - timedelta(hours=48)

select(Call).where(
    Call.client_id == client.id,
    Call.morning_summary_sent_at == None,
    Call.created_at >= cutoff,
)
```

## Key Detail

The `prev_summary_date` must be captured BEFORE the claim step sets
`last_summary_sent_date = today`, otherwise the in-memory value is
already updated and the cutoff logic fails.

## File

`app/cron/morning_summary.py`

## Commit

`505cd60`
