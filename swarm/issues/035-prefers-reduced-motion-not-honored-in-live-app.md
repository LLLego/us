---
status: fixed
domain: deploy
severity: minor
---

## SYMPTOM
`frame-prototype.html` correctly applies a `prefers-reduced-motion: reduce` media query (lines 186–188) that disables all animation/transition. The shipped live app (`index.html` + `css/main.css`) does not honor the same system preference — even though it ships three motion-heavy UX elements: the shutter pulse, the countdown fade, and the white flash.

## REPRO / EVIDENCE
- `frame-prototype.html` `186-188`:
  ```css
  @media (prefers-reduced-motion: reduce){
    *{animation:none!important;transition:none!important}
  }
  ```
- `index.html` and `css/main.css` — `grep -R 'prefers-reduced-motion' index.html css/*.css` returns **no matches**.
- Specific motion elements in the live app (no opt-out for `prefers-reduced-motion`):
  - `js/app.js:1014-1016` — `shutter-btn.classList.add('pulse')` (360 ms transition).
  - `js/app.js:1008-1010` — `#flash` element animated `opacity 0 → 1 → 0` over 120 ms.
  - `css/main.css` — `.countdown-number` likely uses a fade-in transition (would need to be confirmed line-by-line, but the absence of any `prefers-reduced-motion` block in `css/main.css` is the test).

## EXPECTED
The same `@media (prefers-reduced-motion: reduce) { … }` block from `frame-prototype.html` is applied in `css/main.css` (or its scope extended to the relevant components). Users who have set the OS preference won't see the shutter pulse, the flash, the countdown fade, or any other non-essential motion.

## ACTUAL
OS preference is silently ignored. Users with vestibular disorders may experience discomfort on every capture.

## SUGGESTED FIX DIRECTION
Add the same media query to `css/main.css`:
```css
@media (prefers-reduced-motion: reduce){
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  /* intentionally keep the flash opacity change dropping to 0 to preserve the visual "snap" cue */
}
```
And explicitly gate the `pulse` and `flash` JS paths on `matchMedia('(prefers-reduced-motion: reduce)')` if the visual feedback turns out to be essential for the UX.
