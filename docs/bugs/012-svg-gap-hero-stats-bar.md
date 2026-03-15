# BUG-012: 1px White Gap Between Hero and Stats Bar

**Date:** 2026-03-15
**Severity:** Low (cosmetic)
**Status:** FIXED

## Symptom

Visible white line/gap between the hero section's SVG wave divider
and the dark navy stats bar on the FixMyNight product page.

## Root Cause

Inline SVG elements can introduce a sub-pixel gap due to their default
`inline` display baseline. Even with `display: block` set, rounding
differences between the SVG bottom edge and the next section's top
edge create a visible 1px line.

## Fix

Added `-mb-px` to the SVG container and `-mt-px` to the stats bar
section, ensuring they overlap by 1px and eliminate the gap.

## File

`frontend/src/pages/public/FixMyNightProduct.tsx`

## Commit

`505cd60`
