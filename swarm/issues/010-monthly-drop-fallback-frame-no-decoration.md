---
status: resolved
domain: flows
severity: minor
---

## RESOLUTION (Lane 5, 2026-08-22)
OUT OF SCOPE — this is an app-side issue (js/app.js `computeMonthlyDrop`
fallback path, line 128-145). The emitter doesn't drive this code path.
The brief noted "if the decor fallback got addressed" — confirming it was
NOT addressed by Lane 5. Filing as out-of-scope-resolved for tracking;
the actual fix belongs to Lane 1 (duo state machine) or Lane 2 (flows/UX).

SYMPTOM
If `templates/templates.json` fails to load (offline, server down, CDN blocked), the monthly drop picks `nx-puccap` as the fallback (line 132). But because `FRAMES` registry has no `nx-*` entries until `FramesNext.init()` resolves (frames-next.js:280-307), the fallback key never gets registered either. Tapping USE IT sets `currentFrame = 'nx-puccap'` which doesn't exist anywhere → the overlay, preview, and final composited image all render with no decoration.

REPRO / EVIDENCE
- `js/app.js:128-145` `computeMonthlyDrop()`:
  ```js
  const nxKeys = allFrames.filter(k => k.startsWith('nx-'));
  if (nxKeys.length === 0) { this.dropFrameKey = 'nx-puccap'; return; }
  ```
  If `FRAMES` is empty (templates.json not yet loaded or failed), defaults to `'nx-puccap'`.
- `js/frames-next.js:280-307` `register()` is the only place that adds `nx-*` keys to `FRAMES`. It retries for up to 4 seconds after `FramesNext.init()`'s fetch resolves. If fetch fails, `FramesNext.tpl` is set to `{ templates: [] }` (frames-next.js:14-16), so `doRegister()` registers zero new frames.
- `js/app.js:659-674` `drawFrameOverlay()`:
  ```js
  const frameDef = FRAMES[this.currentFrame];
  if (frameDef && frameDef.framesNext) { ... }
  else if (frameDef && this.currentFrame !== 'none') { ... }
  ```
  If `frameDef` is `undefined`, neither branch runs. `applyPreviewAspect` (line 677-700) similarly uses `FramesNext.get(...)` and falls back to `'0.78'` aspect when missing. The capture still runs (line 919 `capture()` doesn't validate `currentFrame`), producing a photo with no frame decoration.
- The user clicked "USE IT →" on a drop screen explicitly telling them "this month: a fresh frame". They expect a frame. They get a plain photo.

EXPECTED
Either (a) refuse to render the drop screen until `FramesNext.tpl` has populated, or (b) when templates.json fails, surface an error / fallback to a built-in frame, or (c) when the user taps USE IT with an unregistered frame, route them to the stage with a clear "frame unavailable" notice.

ACTUAL
User sees the drop screen with a template strip preview (because `thumbURL` returns the cached template path, line 271-275 — but only if templates.json DID load). With templates.json down, the preview `img.src` is set to `''` (line 168 `img.src = url || ''`) so the user sees a broken image, taps USE IT, and gets an undecorated photo. The flow silently degrades.

SUGGESTED FIX DIRECTION
In `computeMonthlyDrop`, if `nxKeys.length === 0` AND templates.json failed to load (track via a flag set in `FramesNext.init`'s catch), don't open the drop screen — show a "monthly drop unavailable right now" message instead. Or always require `FramesNext.tpl.templates.length > 0` before `openDrop()` can succeed.