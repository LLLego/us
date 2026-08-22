---
status: open
domain: css-ui
severity: major
---

SYMPTOM
The fluid `--tap-min` clamp at `css/main.css:583` evaluates `clamp(40px, calc(42px + (100vw - 360px) * 0.066), 52px)`. At viewport widths below 360px (Android compact devices at 320-359px, foldable covers, certain Android Go phones at 320×568), `100vw - 360px` is negative, so `(100vw - 360px) * 0.066` is negative (e.g., at 320px viewport: `(320-360)*0.066 = -40px*0.066 = -2.64px`), making the preferred value `42px + (-2.64px) = 39.36px`. The `clamp()` minimum is 40px, so the resolved value is `40px`. The `.icb` rule then applies `width: var(--tap-min); height: var(--tap-min); min-width: var(--tap-min)`, which yields a 40×40px tap target — BELOW the iOS 44pt and WCAG 2.5.5 (Level AAA) 44×44 CSS-px guidance, and below the Android Material 48dp.

The clamp is intended ONLY for viewports ≥ 360px (per the comment `/* taps: 42px @360, 44px @390, 47px @440 */` at line 580), so the 40px floor hits below the design target window with no floor bump.

REPRO / EVIDENCE
- Rule: `css/main.css:583` → `--tap-min: clamp(40px, calc(42px + (100vw - 360px) * 0.066), 52px);`
- At `100vw = 320px`: `(320 - 360) * 0.066 = -2.64`. Preferred = `42 - 2.64 = 39.36`. Clamp min is 40px → resolves to `40px`.
- At `100vw = 280px` (some Blackberry/Moto legacy): `(280-360)*0.066 = -5.28`. Preferred = `42 - 5.28 = 36.72`. Clamp min `40px` → `40px`.
- The other fluid token `--shutter-size` (`css/main.css:582`) has the same shape — `clamp(66px, calc(70.7px + (100vw - 360px) * 0.11), 84px)` — but its min is 66px, which is fine for the shutter visual; only the tap-target token is at risk for usability.
- `.icb` consumer on `css/main.css:321` is used by mirror / theme / exit / global-theme buttons plus the `#room-pill` (no — the pill has its own 36px min-height). So four `.icb` instances become 40×40 in narrow viewports: smaller than the 44px tap floor and the 48dp Android baseline.

EXPECTED
All interactive controls satisfy a minimum of 44×44 CSS-px tap area across the supported viewport range. Material-design-flavoured PWA typically enforces 48dp.

ACTUAL
On 280-359px width viewports, `.icb` rounds down to 40×40. Below the design comment's stated 42px @360 floor and well below 48dp. Users with thumb-tap or motor-impairment assistive devices suffer misfires.

SUGGESTED FIX DIRECTION
Harden the floor: `--tap-min: clamp(44px, calc(44px + (max(100vw, 360px) - 360px) * 0.066), 52px);`. The `max(100vw, 360px)` clamps the input first, keeping the preferred value at the 360px baseline below that point. Or simply use two-tier media queries: under 360 → `--tap-min: 44px`, else the existing clamp. Apply the same floor protection to `--chip-h` (`css/main.css:584`) and to the `.k`-class hard-coded `min-height:44px` (already compliant at narrow widths — confirm by spot-check, but currently safe because it is a literal `44px`).
