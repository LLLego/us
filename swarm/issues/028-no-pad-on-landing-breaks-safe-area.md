---
status: fixed
domain: css-ui
severity: major
---

FIX (Lane 3, 2026-08-23): added `.screen { padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--pad)); }` safety net so any unstyled child of #landing/#stage still clears the home indicator. Did NOT remove the `padding:0` overrides (would be redesign).

SYMPTOM
`.screen` defines `padding: calc(env(safe-area-inset-top, 0px)) var(--pad) calc(env(safe-area-inset-bottom, 0px))`, but `#landing` overrides to `padding: 0; gap: 0;` (`css/main.css:372`). The landing children that consume safe-area — `.landing-nav`, `.landing-foot`, `.landing-hero` — DO apply `env(safe-area-inset-…)` directly, so the bottom safe-area is honored on the foot. However, the override strips the side horizontal padding too, and `#landing` is the only screen relying on children to re-add the right `var(--pad)`. While the landing-cards/strip/foot do pad themselves, the inner `.mode-card` shadows (5px offset + 18px drop) extend past the 20px `--pad` at the edges when the viewport is < 320px wide.

Separately, `#stage { padding: 0; }` (`css/main.css:588`) similarly removes the safe-area padding that `.screen` provides. The stage DOES compensate via `.stage-topbar { padding-top: env(safe-area-inset-top, … ) }`, `.controls-bar { padding-bottom: env(safe-area-inset-bottom, … ) }`, and `#pick-screen` adds its own `env(safe-area-inset-bottom, …)` on `.pick-actions` and `.pick-header`. So the stage safe-area is covered, but only because every direct child re-implements the same `calc(env(safe-area-inset-bottom, 0px) + …)`. The duplication is fragile: any new child added to a screen without re-adding the env() will sit flush against the home indicator, with no warning.

REPRO / EVIDENCE
- `css/main.css:153-162` — base `.screen` rule applies `padding: calc(env(safe-area-inset-top, 0px)) var(--pad) calc(env(safe-area-inset-bottom, 0px))`.
- `css/main.css:372` — `#landing { justify-content: flex-start; padding: 0; gap: 0; }` zeroes the base.
- `css/main.css:588` — `#stage { padding: 0; justify-content: flex-start; }` zeroes the base.
- Confirmed that `.landing-nav` (375), `.landing-foot` (502), `.landing-hero` (no env), `.landing-strip` (484: no env, padding `36px var(--pad) 40px`), `.landing-cards` (401: no env, `padding: 0 var(--pad) 24px`), `.stage-topbar` (690), `.controls-bar` (652), `.pick-header` (926), `.pick-actions` (983), `.reveal-actions` (824), `.drop-top` (868), `.drop-foot` (908) — each manually re-pads with `env(safe-area-inset-…)`.
- `.landing-strip` and `.landing-cards` rely entirely on `var(--pad)` (20px) for horizontal breathing and have NO env() on bottom, meaning on iOS landscape with home-bar on the left, the strip's bottom 40px may sit beneath the home-indicator safe-area.
- `var(--pad)` is redefined at `@media (min-width: 720px)` as `32px` (line 995), but the manual children that drop env() never see a different upper bound than the default 20px.

EXPECTED
Either A) `.screen` keeps its safe-area padding and screens opt-out per axis (e.g., `.screen.no-x-pad { padding-left:0; padding-right:0 }`), OR B) `.screen` keeps its safe-area padding and screens that need to paint full-bleed use full-bleed children inside, not a blanket `padding:0`.

ACTUAL
`#landing` and `#stage` null the screen-level safe-area padding. Sub-children hand-roll `env(safe-area-inset-…) + Npx` repeatedly. `.landing-strip` and `.landing-cards` don't, leading to potential unsafe overlap on iOS landscape with the home-indicator on the bottom, and on small phones with the gesture-bar.

SUGGESTED FIX DIRECTION
Remove the blanket `padding:0` from `#landing` and `#stage`. Instead, give those screens a `gap:0` and `justify-content:flex-start` only; let each child control its own horizontal margin via `--pad`. That preserves the safe-area baseline inherited from `.screen`. As an extra safety net, add `.screen { padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--pad)) }` so even unstyled children stay above the home indicator.
