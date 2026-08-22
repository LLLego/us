---
status: fixed
domain: deploy
severity: minor
---

FIX (Lane 3, 2026-08-23): same fix as 021 — `#stage.active ~ #global-theme-btn { display: none; }` keeps the contextual #theme-btn as the only trigger on the booth.

## SYMPTOM
The stage screen renders *two* theme-menu trigger buttons at the same time — one in the topbar (`#theme-btn`) and one pinned to the top-left of the viewport (`#global-theme-btn`). Both call `app.toggleThemeMenu()`. Both are visible, both have the same `aria-label="theme"`, and a screen reader will announce "theme, button" twice.

## REPRO / EVIDENCE
`index.html` lines 138–143 (stage topbar):
```html
<button id="theme-btn" class="icb" onclick="app.toggleThemeMenu()" title="vibe" aria-label="theme">
  <svg …> … </svg>
</button>
```
`index.html` lines 218–219 (global override, always positioned on top of the stage):
```html
<button id="global-theme-btn" class="icb" onclick="app.toggleThemeMenu()" title="vibe — pick the room's colors" aria-label="theme" style="position:fixed;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 10px);z-index:60">&#9680;</button>
```
Both are inside the `#stage` screen. Both have `aria-label="theme"` and `title` containing "vibe". The global button is `position:fixed` so it stays visible regardless of viewport. The topbar one is rendered as part of `.stage-topbar-right` (line 130–145). They overlap on most viewport widths.

## EXPECTED
A single theme-menu trigger per screen, with a unique `aria-label` if it is duplicated deliberately with a different role.

## ACTUAL
Two buttons, identical action, identical a11y label. Confusing for sighted users (clicks may feel laggy, since the popup re-opens), and a direct WCAG 2.5.3 (Label in Name) / 2.4.6 (Headings and Labels) concern.

## SUGGESTED FIX DIRECTION
Hide `#global-theme-btn` whenever the stage topbar is visible (e.g. add a CSS rule `#stage.active ~ #global-theme-btn { display: none; }`, or delete `#global-theme-btn` outright if the topbar button was always intended to be the only one).
