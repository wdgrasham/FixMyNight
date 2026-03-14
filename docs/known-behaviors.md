# Known Behaviors — V1

## Silence/Hangup Handling (T1.17)

**Behavior:** When a caller stays silent after Sarah's greeting, the call ends
after ~7-10 seconds with a goodbye message. Sarah does NOT prompt "Hello, are
you there?" before saying goodbye — she goes straight to the closing.

**Root cause:** Vapi's `customer.speech.timeout` hook with an `exact` array
of 2 messages delivers the goodbye message on the first trigger instead of
using the first message as an initial prompt. The `exact` array appears to
be treated as a pool of options, not a sequential list.

**Possible fix (V1.1):** Split into two separate hooks — one at 7s with
"Hello, are you there?" and a second at 14s with the goodbye. Requires
testing to confirm Vapi supports multiple hooks on the same event.

**Impact:** Low. Call ends, logged correctly as `call_type=hangup`. No
caller harm — they weren't speaking anyway.

**Logged:** 2026-03-13
