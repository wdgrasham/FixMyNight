# BUG-002: Phone Number Readback — Prompt Instruction Leak & Example Contamination

**Date Found:** 2026-03-13
**Severity:** High
**Status:** FIXED

---

## Symptom 1: Prompt Instruction Leak

Sarah literally read aloud the prompt instruction text: "read digits
individually, e.g. 3 4 6..." — exposing internal prompt structure to the
caller.

### Root Cause

Instruction text was placed inside a quoted speech section of the prompt.
The LLM treated it as dialogue to be spoken, not as a formatting directive.

### Fix

Removed all instruction text from speech sections. Phone readback instructions
are now declarative: "Confirm the caller's phone number by reading it back to
them digit by digit."

---

## Symptom 2: Example Number Contamination

Sarah used the example phone number `512-555-9876` from the prompt as if it
were the caller's real phone number. Occurred 3 times before root cause was
identified.

### Root Cause

1. Example phone numbers in the prompt were treated as real data by the LLM
2. The caller's actual phone number was never injected into the prompt — the
   `assistant-request` webhook wasn't extracting `call.customer.number`

### Fix

1. Removed ALL example phone numbers from the prompt
2. Added caller phone extraction in `webhooks.py` assistant-request handler:
   extracts from `call.customer.number`, strips `+1`, formats as individual
   digits with comma pacing (`3 4 6, 8 8 6, 3 9 6 3`)
3. Appended as `CALLER PHONE NUMBER` section at end of prompt

## Lesson Learned

**Never put example data in LLM prompts.** The LLM will use any concrete value
it sees — phone numbers, names, addresses — as real data. Use declarative
instructions instead of examples.
