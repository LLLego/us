---
status: open
domain: css-ui
severity: major
---

SYMPTOM
Two distinct theme-toggle buttons are rendered in the DOM at the same time, both wired to `app.toggleThemeMenu()`. The `#stage` view has `#theme-btn.icb` (sun/moon SVG icon) inside `.stage-topbar-right`. There is also a separately-positioned `#global-theme-btn.icb` (Unicode glyph `&#9680;`) at the very end of `body` that renders on every screen (not gated to a specific screen). Result: on the booth stage the user sees TWO theme buttons stacked — one icon-style inside the topbar and one glyph-style overlaid top-left above the screen. The popover `z-index:70` also collides with `#flash z-index:70` so the menu can paint under or above the white capture flash depending on document order at click time.

REPRO / EVIDENCE
- `index.html:131-143` → `#theme-btn` inside `.stage-topbar-right` (icon-button, sun/moon SVG).
- `index.html:218` → a second `<button id="global-theme-btn" class="icb" …>&#9680;</button>` after the `#frame-sheet`, with inline `style="position:fixed;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 10px);z-index:60"`. The element is NOT inside `#stage`; it is a sibling at the body level — so it is visible on landing, room, drop, pick, reveal, gallery AND stage. The CSS for `#global-theme-btn` at `css/main.css:86-94` even adds a `::after` "vibe" label with absolute positioning from the button.
- `app.js:308-318` (`toggleThemeMenu`) only updates `aria-expanded` on `document.querySelectorAll('[aria-haspopup], #theme-btn')` style — but in practice, the `aria-expanded` is only set on a single button (the `#theme-btn` reference resolved via a query that, per `app.js:312-318`, is fetched by id `theme-btn`). The `#global-theme-btn` never has its `aria-expanded` toggled, breaking screen-reader semantics on whichever button the user actually clicks.
- z-index landscape:
  - `#global-theme-btn` (inline): `z-index:60`
  - `#theme-menu` (`css/main.css:102`): `z-index:70`
  - `#countdown-overlay` (`css/main.css:797`): `z-index:60`
  - `#frame-sheet` (`css/main.css:726`): `z-index:50`
  - `#flash` (`css/main.css:816`): `z-index:70`
- Two stacking layers tied at 70 (`#theme-menu` and `#flash`); CSS painting with equal z-indexes falls back to source order, so after a flash fires the menu (if open) can show under the white flash or be unreachable for ~350ms — the `.flash.show` opacity is `.9`.

EXPECTED
Exactly one theme-toggle button per role. If both exist intentionally (one persistent, one contextual), only one should appear at a time on a screen (e.g., conditional display via the `.screen.active` state). For accessibility, the button actually clicked must update `aria-expanded` on the SAME button. Z-indexes for unrelated overlays should not collide at 70.

ACTUAL
1. Two visual buttons rendered simultaneously on the stage screen; the popover `vibe ::after` label of `#global-theme-btn` overlaps `.stage-topbar`'s left side because both anchor top-left.
2. Screen-reader semantics: clicking `#global-theme-btn` does not flip `aria-expanded` (it is only set on `#theme-btn`).
3. `z-index:70` collision between menu and flash makes paint order nondeterministic around capture moments.

SUGGESTED FIX DIRECTION
Either (a) make `#global-theme-btn` `display:none` whenever `.screen.active` is `#stage` and rely on `#theme-btn` there (consistent with the design comment "Engine IDs unchanged" intent of having a contextual topbar in the booth), or (b) delete `#global-theme-btn` entirely and rely on `#theme-btn` in the topbar only. Add explicit `z-index` ranking: e.g. theme-menu `z-index:80`, frame-sheet `z-index:50`, countdown `z-index:60`, flash `z-index:75`. Move `aria-expanded` management to a single helper that operates on the currently-rendered theme button.
