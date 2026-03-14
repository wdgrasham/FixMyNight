# BUG-005: Sleep Window Checkbox Not Re-Enabling (Stale React State)

**Date Found:** 2026-03-13
**Severity:** Medium
**Status:** FIXED
**File:** `frontend/src/pages/portal/PortalSettings.tsx`

---

## Symptom

In the client portal settings, the "Enable Sleep Window" checkbox could be
unchecked but could not be re-checked. Clicking the checkbox to re-enable
the sleep window had no visible effect.

## Root Cause

Two sequential `update()` calls using the spread operator:

```typescript
// BUG: second call overwrites first because React hasn't applied it yet
update('sleep_window_start', '22:00');
update('sleep_window_end', '08:00');
```

Each `update()` call spread the current `settings` state. The second call
used stale state (before the first `update` was applied by React), so it
overwrote `sleep_window_start` back to `null`.

## Fix

Single atomic `setSettings()` call:

```typescript
setSettings({
  ...settings,
  sleep_window_start: '22:00',
  sleep_window_end: '08:00',
} as Client);
```

Same pattern for the unchecked case (both set to `null` atomically).
