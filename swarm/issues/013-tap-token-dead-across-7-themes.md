---
status: fixed
domain: css-ui
severity: minor
---

FIX (Lane 3, 2026-08-23): added `--tap:48px` to all 7 theme blocks; wired token to 8 consumer rules that previously hard-coded `min-height:44px` (.k, .chip, #theme-menu button, .frame-cat-btn, .ctrl-chip, .ctrl-ghost, .stage-topbar-left|right, .sheet-done). Token is now both declared AND referenced.

SYMPTOM
The CSS custom property `--tap` is declared in `:root` and re-declared (effectively) for every theme via the combined selector on line 22 `:root, :root[data-theme="honey"]`. The 6 remaining themes (strawberry, matcha, blueberry, choco, taro, mango) inherit the default. But no rule in `css/main.css` or any `*.html` reads `var(--tap)`. The only tap-related variable actually consumed is `--tap-min` (defined on line 583, read on line 321 inside `.icb`).

REPRO / EVIDENCE
- Declaration: `css/main.css:35` → `--tap: 48px;` inside `:root, :root[data-theme="honey"] { ... }`.
- Inheritable default for the 6 other themes (no per-theme override, falls back to :root inheritance): correct CSS-cascade behavior but the value is unused everywhere.
- Read sites for `--tap`: ripgrep `var(--tap)` across `C:\Users\legof\Desktop\us-temp\` → 0 hits.
- Read sites for `--tap-min`: 3 uses on `.icb` (`css/main.css:321`). The shutter size uses `--shutter-size`; `.k` uses hard `min-height:44px`; `.chip` uses `min-height:44px`; `.frame-cat-btn` uses `min-height:44px`; `.ctrl-chip` uses `min-height:44px`; `.icb` uses `var(--tap-min)`.
- The 7 themes carry state for a token no rule cares about.

EXPECTED
All declared tokens have at least one consumer. Either a tap-target rule should honor `--tap` (frozen 48px fallback for the strict floor), OR `--tap` should be removed.

ACTUAL
Dead token shipped in every theme. Adds cognitive load when reading the theme block; causes future maintainers to wonder which token the `.k` minimum really uses.

SUGGESTED FIX DIRECTION
Either (a) delete `--tap: 48px;` from `css/main.css:35`, or (b) replace the hard `min-height:44px` literals on `.k` / `.chip` / `.frame-cat-btn` / `.ctrl-chip` / `.sheet-done` / `.stage-topbar-left|right` etc. with `min-height: var(--tap)` to honor the design intent of "every sticker-machine key ≥ 48px". Option (b) is consistent with the comment block at lines 7-18 that calls these out as 36-44px but never enforces an override.
