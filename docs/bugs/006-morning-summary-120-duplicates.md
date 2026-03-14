# BUG-006: Morning Summary Sending ~120 Duplicate Emails

**Date Found:** 2026-03-14
**Severity:** Critical
**Status:** FIXED
**Commit:** da82cea
**File:** `app/cron/morning_summary.py`

---

## Symptom

Morning summary email sent every 60 seconds from ~7:30 AM to ~9:30 AM,
resulting in approximately 120 identical emails to the client. All emails
had the same content (same call list, same formatting).

## Root Cause

The `last_summary_sent_date` flag was set and committed **after** email
delivery. The cron job runs every 60 seconds. If `send_summary_email()` took
any time at all, the next cron tick would:

1. Query clients where `last_summary_sent_date != today` — client still qualifies
2. Re-fetch all calls where `morning_summary_sent_at IS NULL` — calls still qualify
3. Re-send the identical summary
4. Repeat until the time window closes (~2 hours = ~120 sends)

The emails were all identical because each tick re-queried the same unsent
calls (the `morning_summary_sent_at` flag was also committed in the same
late transaction).

## Fix: Claim-Before-Send Pattern

Moved the flag-set + commit to **Step 1**, before any email/SMS work:

```python
# STEP 1: Claim this client BEFORE doing any work
await db.execute(
    update(Client)
    .where(Client.id == client.id)
    .values(last_summary_sent_date=today)
)
await db.commit()

# STEP 2: Fetch calls and build summary
# STEP 3: Send email/SMS, mark individual calls
```

If delivery fails after claiming, the flag is already set — no duplicates.
The failure is logged to `audit_logs` for manual follow-up. The summary
will not be re-attempted today (acceptable trade-off vs. 120 duplicates).

## Why It Stopped at 9:30 AM

The summary window is bounded by `summary_send_time` (start) and likely by
the UTC/local date rolling over or the time window check. The cron only sends
when `now_local.time() >= client.summary_send_time`, so it stops when the
local time passes the effective window.
