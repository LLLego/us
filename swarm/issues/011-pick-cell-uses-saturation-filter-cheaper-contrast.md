---
status: open
domain: css-ui
severity: major
---

SYMPTOM
`#pick-grid .pick-cell:not(.selected) img` (`css/main.css:966`) applies `filter: saturate(.45) brightness(.82)` to deselect un-picked frames. The intent — visually mute the photos the user rejected — works, but the pick screen background is fixed at `--paper` (per inline `:root` and the page relies on ambient body bg) and the dimmed photos can also go below 3:1 contrast against the `--paper` background, becoming near-invisible to users with reduced color sensitivity. In addition the `filter:` chain re-applies every paint and re-decodes the image pipeline at the GPU compositor level, costing battery on lower-end Android devices.

REPRO / EVIDENCE
- `css/main.css:946-970` defines `.pick-cell` (paper `--paper` bg, `--ink` border) and the `:not(.selected) img` filter rule.
- `index.html:235` shows `#pick-count` `.badge.acc-bg` ("0 / 4") and on the cells the photo strip sits centered. The pick strip background is per-cell `--paper` (#FFFDF4 honey / #FFFDF6 strawberry / #FDFCF3 matcha / etc.).
- Dimmed image brightness `.82` × saturate `.45` on a typical iPhone front-camera photo of two faces drops the visible skin-tone ΔE to ≈ the same value as a `var(--paper)` cell background — meaning low-contrast users cannot distinguish a "deselected" cell from a "not yet rendered / loading" one.
- This is the only screen where photos are forced into a low-contrast state; elsewhere they appear at full contrast (`#reveal`, `#gallery`, `#drop-template`).
- The same hard rule also blocks future accessibility options (e.g., a `prefers-contrast: more` media query that wants full-contrast images).

EXPECTED
The deselected state communicates "not picked" through a mechanism that does not also defeat contrast for low-vision users, and is cheap to composite. Likely candidates: 1) a translucent overlay (`::after { background: rgba(255,253,240,.55) }`) applied on the cell instead of mutating the image, 2) a bordered-but-no-image placeholder with the shot number visible, 3) a `--paper`-tinted mask.

ACTUAL
The dim is applied directly on the `<img>` via `filter`, costing both accessibility (low-contrast deselection) and performance (recompositing each photo at GPU every frame).

SUGGESTED FIX DIRECTION
Replace the image `filter` on the deselected state with a `.pick-cell:not(.selected)::after { content:''; position:absolute; inset:0; background: var(--paper); opacity:.45; border-radius: inherit; pointer-events:none; }` overlay. Keep the lift/glow on `.pick-cell.selected` as-is. Optionally gate the deselected overlay under `@media (prefers-contrast: more) { ... }` to disable it for users who need it sharper.
