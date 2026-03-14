# BUG-007: Anti-Abuse Triggering on Normal Caller Slang

**Date Found:** 2026-03-13
**Severity:** Medium
**Status:** FIXED
**File:** `app/services/prompt_builder.py`

---

## Symptom

During a sleep window emergency test call, the caller said "I am cooked"
(expressing frustration). Sarah treated this as an off-topic request and
redirected: "I'm only able to help with HVAC service requests..."

## Root Cause

The anti-abuse section of the prompt did not distinguish between:
- Genuinely off-topic requests ("tell me a joke", "what's the capital of France")
- Normal caller frustration/slang ("I'm cooked", "this is killing me", "I'm dying here")

The LLM interpreted emotional language as "unrelated to HVAC service" and
triggered the off-topic redirect.

## Fix

Added explicit exemption at the top of the ANTI-ABUSE section:

```
IMPORTANT: Conversational expressions, frustration, slang, and emotional
language from the caller are NORMAL. Phrases like "I'm cooked," "this is
killing me," "I'm dying here," "this sucks," "I can't deal with this" are
frustrated callers — NOT off-topic. Treat them with empathy and continue
the call normally.
```

The CRITICAL SECURITY RULES section (prompt injection protection) was NOT
affected — it remains a separate, higher-priority section.
