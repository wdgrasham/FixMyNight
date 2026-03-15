# BUG-011: Business Hours Greeting — Cold Opener, "Call Back", Repeat Collection

**Date:** 2026-03-15
**Severity:** Medium (poor caller experience)
**Status:** FIXED

## Symptoms (3 issues in one call)

1. **Recording disclosure as cold opener**: "This call will be recorded
   for quality purposes" was the very first thing callers heard — robotic
   and off-putting.

2. **"We're currently open, try calling back"**: Told callers who already
   called and got forwarded to call back. Terrible experience.

3. **"Sure, go ahead" after caller already spoke**: Sarah asked if they
   wanted to leave a message, caller gave the message, then Sarah said
   "Sure, go ahead" — ignoring what was already said.

## Fix

### First message:
Before: "This call may be recorded for quality purposes. Thanks for
calling {business}. We're currently open — please try calling back..."

After: "Thanks for calling {business}, this is {agent_name}. This call
may be recorded. We're not able to take your call right now but I can
take a message and make sure someone calls you back. What's this
regarding?"

### Prompt:
- Removed "Sure, go ahead" section
- Changed flow to: caller states message → "Got it. Can I get your name?"
- Added anti-repeat instruction: "If the caller has already stated their
  message or reason for calling, do NOT ask them to repeat it."

## Files

- `app/services/prompt_builder.py` — `build_first_message()` and
  `build_business_hours_prompt()`

## Commits

`e046f89`, `f6e9c40`
