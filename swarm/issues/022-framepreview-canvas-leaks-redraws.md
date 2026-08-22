---
status: fixed
domain: js-engine
severity: minor
---

# Live frame preview re-creates Image cache entries on every resize/orientation change and never cancels in-flight template fetch

## SYMPTOM
`drawFrameOverlay` runs in a `requestAnimationFrame` loop (`tick`, line 621). Each tick awaits `FramesNext.drawLivePreview` (line 664) which awaits a fresh `_png(spec.png)` (line 166 of frames-next.js). On every tick (60 fps), it re-decodes the template PNG if not cached. On a mobile rotation, the canvas resizes, the previous `frameOverlayCanvas` is mutated in place (lines 646–651), but any in-flight `await this._png(...)` from a previous tick continues to resolve and `ctx.drawImage` over the freshly-resized canvas, sometimes producing a momentary "wrong aspect" flash.

## REPRO / EVIDENCE
- File: `js/app.js`
  - Lines 618–626: `startFramePreview()` schedules `tick` via `requestAnimationFrame`.
  - Lines 638–675: `drawFrameOverlay()` calls `FramesNext.drawLivePreview(...)` which is `async` and not awaited by the rAF callback.
  - Line 622: `this.framePreviewLoop = requestAnimationFrame(tick);` — `tick` is NOT async; it calls `this.drawFrameOverlay()` (sync wrapper), but inside that, the awaited Promise is fire-and-forget.
- File: `js/frames-next.js`
  - Lines 161–269: `drawLivePreview` does `const tpl = await this._png(spec.png);` at line 166. This `_png` call returns the same Promise from the cache (lines 43–54). On a tab backgrounded and then foregrounded, the rAF loop resumes; an older in-flight Promise resolves and writes to ctx while the canvas may have been re-sized for a new orientation.

### Concrete repro
1. Open photobooth in mobile portrait. Frame overlay renders fine.
2. Rotate to landscape. `video-container` resize fires; `drawFrameOverlay` adjusts `frameOverlayCanvas.width/height` at lines 646–651.
3. Inside that tick, `FramesNext.drawLivePreview` is called. It begins `await this._png(spec.png)`. PNG was already cached, so this resolves on next microtask.
4. ALSO: another tick fires during the microtask resolution window (rAF cadence). The 2nd tick sees the new canvas dimensions and starts its own `drawLivePreview` call. Two concurrent calls now write to the same canvas.
5. The 1st call's `ctx.drawImage(tpl, 0, 0)` writes at the OLD spec coordinate space (since `drawLivePreview` does `ctx.scale(s, s)` at line 174 with `s = Math.max(w/spec.w, h/spec.h)` based on the captured `w,h` arguments). But the canvas backing store has already been resized. The result: a single frame of mis-scaled overlay.

### Why this matters
- Even when the cache hits, the `await this._png(...)` yields a microtask. Multiple rAF ticks in flight means multiple concurrent overlay draws.
- More serious: in the spec.slots loop at lines 186–246, the function does `await this._png(p)` for each frozen photo (line 180). If `frozenPhotos` changes mid-draw (e.g. user takes another shot while the previous overlay draw is still pending), the loop processes the OLD `frozenPhotos` array snapshot but the canvas already reflects the NEW state from a previous successful draw. The end-user sees flicker.

### Memory / cancellation impact
- There's no AbortController or cancellation token. Promises continue to resolve forever, each holding a reference to `ctx`. On long sessions (booth events, 30+ minutes), the rAF loop keeps scheduling forever even when the overlay canvas is offscreen (e.g. on the reveal screen). `stopFramePreview()` is called in `goHome()` (line 333), but NOT on screen transitions like `showReveal()` or `pick-screen`.

### Confirm: rAF runs on hidden screens?
- Yes, `goHome` stops it, but `showReveal` (line 1248) does not. The frame overlay continues rAF'ing behind the reveal modal. The canvas is no longer visible but the rAF still calls `getBoundingClientRect()` (line 643) and does canvas resize math every frame.

## EXPECTED
- Stop the rAF loop when leaving the stage screen.
- Cancel/skip in-flight overlay draws when a new one begins (use a generation counter or AbortSignal).

## ACTUAL
- rAF loop runs continuously after `startFramePreview` until `goHome()` or `stopFramePreview`. It continues through `showReveal`, `pick-screen`, `gallery`, and `room`. Each frame does a `getBoundingClientRect` on a hidden container.

## SUGGESTED FIX DIRECTION
- Track a `_overlayGen` counter; capture it locally at the top of `drawFrameOverlay`; before each `await`, check `if (this._overlayGen !== localGen) return;`. Bump `_overlayGen` in `stopFramePreview`, `goHome`, and `initFrameOverlay`.
- Or guard `startFramePreview` with `if (!document.getElementById('stage').classList.contains('active'))` and pause rAF on hidden screens.