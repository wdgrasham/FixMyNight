# BUG-009: Transcript Analysis Reclassifies Messages as Wrong Number by Topic

**Date:** 2026-03-15
**Severity:** High
**Status:** FIXED

## Symptom

Two business-hours calls from William about "Joe and the mower" were
classified as `wrong_number` in the database. They should have been
`message` — the caller left a valid message.

## Root Cause

The Claude Haiku transcript analysis prompt included industry context
that explicitly instructed reclassification by topic:

```
"Calls about issues unrelated to {service_noun} should be classified as 'wrong_number'."
```

For an HVAC company, a call about a mower looks "unrelated" to the AI,
but contractors receive calls from suppliers, inspectors, insurance
companies, and other businesses all the time.

## Fix

Removed the industry context block entirely. Replaced with explicit
classification rules:

- Never reclassify based on whether topic seems related to the industry
- `wrong_number` only if caller explicitly said wrong number or asked
  for a different business by name
- `hangup` only if no real conversation
- Any message left = `message`
- "Your job is to extract and summarize, not to judge relevance"

## Design Principle

The contractor sees everything and decides what matters. Our job is
capture and deliver, not filter.

## File

`app/routers/webhooks.py` — `_analyze_transcript()`

## Commit

`505cd60`
