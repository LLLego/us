---
status: open
domain: css-ui
severity: major
---

SYMPTOM
`#flash` (white opacity-0.9 capture flash) is painted at `z-index:70` for 350ms after shutter release. `#theme-menu` is also at `z-index:70`. When a user opens the theme popover and then captures a photo, the flash element appears at the same stacking level; CSS resolves equal-z-index ties by source order (and `#flash` is later in the DOM than `#theme-menu`), so the white flash paints OVER the popover during the capture, hiding the just-clicked options the user was reading.

REPRO / EVIDENCE
- `css/main.css:815-819`:
  ```
  #flash { position: fixed; inset: 0; z-index: 70; background: #fff; opacity: 0;
           pointer-events: none; transition: opacity .35s; }
  #flash.show { opacity: .9; transition: opacity 0s; }
  ```
- `css/main.css:97-102`:
  ```
  #theme-menu {
    display: none;
    position: fixed;
    left: calc(env(safe-area-inset-left, 0px) + 12px);
    top: calc(env(safe-area-inset-top, 0px) + 68px);
    z-index: 70;
    ...
  }
  ```
- DOM order: `#theme-menu` appears at line 191 of `index.html`; `#flash` appears at line 226. Same stacking level, `#flash` later in source order → paints on top during the 0s `transition: opacity 0s` when `.show` is added.
- `#theme-menu button.active` (selected theme swatch) is invisible for ~350ms after a photo capture that occurs with the menu open. The popover then resumes at `transition: opacity .35s` from #flash back to 0, which is the SAME timing the user is reading the menu — and because the menu's own `transition: transform .3s, visibility 0s linear .3s` on `#frame-sheet` (line 737) has `visibility:visible` flipping delayed, sheet-vs-flash timing is also colliding.
- `#flash` has `pointer-events: none` so taps still reach the menu — the defect is purely visual (white-out).
- Secondary effect: `#global-theme-btn` is at inline `z-index:60` (`index.html:218`). `#flash` z=70 paints over it briefly too. Users on the booth stage who look at the top-left to confirm the button briefly see white. Behaviorally harmless but jarring.

EXPECTED
Capture-flash should not visually obscure persistent UI the user was actively looking at. CSS layers should be ordered by intent, not paint order: flash < popovers < modals < alerts.

ACTUAL
Capture flash and theme menu both at z-index 70. Flash wins because it's later in source. Popover contents briefly vanish behind white.

SUGGESTED FIX DIRECTION
Assign explicit z-index bands in one place (e.g. a `:root` comment-block constant for `$z: flash 70, menu 80, sheet 50, overlay 60, topbar 40, base 0`). Bump `#theme-menu` to `z-index:80`. Or wrap `#theme-menu` in a new `#layer-menus` with `z-index:80`. Also consider lowering the flash to `z-index:65` so it never obscures popovers but still races above `#countdown-overlay` (60) — although countdown runs only before flash, so the relative order there is fine.
