---
status: open
domain: deploy
severity: major
---

## SYMPTOM
`gallery.html` is the only HTML entry in the repo that ships JS scripts WITHOUT a `?v=` cache-buster. After every deploy, browsers on the Pages origin will serve *stale* `js/filters.js`, `js/stickers.js`, `js/html-frames.js`, and `js/frames.js` (still cached from a previous version), breaking the frame gallery until the user hard-reloads.

## REPRO / EVIDENCE
`gallery.html` lines 37–40:
```
<script src="js/filters.js"></script>
<script src="js/stickers.js"></script>
<script src="js/html-frames.js"></script>
<script src="js/frames.js"></script>
```
Compare against `index.html` lines 268–274, which all use `?v=33`:
```
<script src="js/supabase.js?v=33"></script>
<script src="js/filters.js?v=33"></script>
<script src="js/stickers.js?v=33"></script>
<script src="js/html-frames.js?v=33"></script>
<script src="js/frames.js?v=33"></script>
<script src="js/frames-next.js?v=33"></script>
<script src="js/app.js?v=33"></script>
```
Tooling: this is a "push = deploy" Pages setup — cache-buster bumps are the established convention. `gallery.html` is the lone hold-out.

## EXPECTED
Every `js/*.js` and `css/main.css` reference in `gallery.html` carries the same `?v=<current>` query param as `index.html`. The next bump increments once and applies uniformly.

## ACTUAL
`gallery.html` ships four unpinned `js/*.js` references. Old files served from the user's HTTP cache will run alongside fresh HTML, which can break the gallery silently (mismatched globals, missing `frameRenderer.init`, etc.).

## SUGGESTED FIX DIRECTION
Either (a) add `?v=33` to the four `<script src="js/…">` tags in `gallery.html`, or (b) factor the cache-buster into a single template string used by both pages. Coordinate the bump via the same value in `index.html`.
