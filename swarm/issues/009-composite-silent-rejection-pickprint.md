---
status: fixed
domain: js-engine
severity: major
---

# `compositeMultiShot` silently rejects image-load failures; `pickPrint` still proceeds to reveal and upload a half-drawn composite

## SYMPTOM
In multi-shot pick-screen flow, `pickPrint()` at lines 284–308 calls `await this.compositeMultiShot()` and then **immediately** proceeds to `showReveal()` (which uploads to Supabase) regardless of whether `compositeMultiShot` resolved or rejected. The Promise rejects when any of the shot dataURLs fail to load as `<img>` (line 1118 `img.onerror = rej`), but `pickPrint` does not check the outcome — it has no try/catch around `compositeMultiShot`.

## REPRO / EVIDENCE
- File: `js/app.js`
- `pickPrint()` at lines 284–308:
  ```js
  async pickPrint() {
    const total = (typeof LAYOUTS !== 'undefined') ? (LAYOUTS[this.currentLayout] ? LAYOUTS[this.currentLayout].shots : 4) : 4;
    if (this.pickedIndices.length !== total) return;
    const ordered = this.pickedIndices.map(i => this.sessionShots[i]);
    this.multiShots = ordered;
    if (this.currentLayout === 'pair') {
      await this.finalizePairCapture();
    } else {
      await this.compositeMultiShot();
      this.showReveal();
      ...
    }
    this.multiShots = [];
    ...
  }
  ```
  No `try/catch`. If `compositeMultiShot()` rejects, the `await` throws and the function exits without `showReveal`, but ALSO without setting `this.multiShotInProgress = false` — those lines at 304–307 are AFTER the await/conditional. The user is stranded on the pick screen with `print-btn` disabled (line 270 only enables it when `pickedIndices.length === total`, which is still true) and no recovery path.
- `compositeMultiShot()` at lines 1082–1167: returns a Promise that rejects via `Promise.all(loadPromises).catch(reject)` if any `<img>` fails to load. Any failure → uncaught rejection (since `pickPrint` doesn't catch).

### Failure timeline
1. User on a low-memory device picks their 4 shots in `strip-4` layout.
2. `print-btn` enabled → tap → `pickPrint()`.
3. `compositeMultiShot` builds 4 `Image` objects from the dataURLs in `this.multiShots`. One of them (older dataURL from a previous session, possibly cleared from memory) has `img.onerror` fire.
4. `Promise.all` rejects → `compositeMultiShot` rejects with that error.
5. `pickPrint` awaits, throws, exits early. **No** `this.multiShotInProgress = false`. **No** `this.multiShots = []`. **No** `showReveal`.
6. User sees the pick screen still showing all 4 thumbnails. They can tap a different cell (which works), tap print again, hit the same error.
7. Console shows unhandled rejection (no `try/catch`), but the user has no UX feedback.

### Why the rejection happens in practice
- `sessionShots` accumulates dataURLs from `captureSingleFrame()` (line 1056). Each is a JPEG dataURL of ~50-150 KB. These survive in `this.sessionShots` until line 305 resets.
- In a long session, the user may have retaken via `pickRetake` (line 273) which DOES reset (lines 275–279). But if the user goes through `pickPrint` and then immediately starts another capture without page navigation, the second `pickPrint`'s `ordered` could contain dataURLs that were already uploaded/garbage-collected by the browser's image cache. Browsers don't usually GC dataURL images, but a low-memory device may.
- More likely: a malformed dataURL (e.g. truncated JPEG from interrupted `captureSingleFrame`) → `img.onerror`.

## EXPECTED
- `pickPrint` should catch the composite failure, surface a "we couldn't build your strip, please retake" toast or modal with a retry that goes back to `pickRetake`.
- `multiShotInProgress` must always be cleared on exit.

## ACTUAL
- Unhandled promise rejection. User stuck. The gallery's `addToGallery` does NOT run because `showReveal` was skipped. The pick-grid stays visible.

## SUGGESTED FIX DIRECTION
- Wrap `await this.compositeMultiShot()` in `pickPrint` with a `try/catch`. On catch: call `this.pickRetake()` after surfacing an error toast, OR show a "build failed" inline message on the pick screen.
- Also: ensure `this.multiShotInProgress = false; this.multiShots = []` are in a `finally` block in `pickPrint` so they always reset.
## Fix notes (Lane 1)
Wrapped `pickPrint()` body in try/catch/finally. The composite is now
attempted, and on failure an inline error card ("we couldn't build your
strip — try the retakes button") surfaces via `_surfaceInlineError()`. The
`finally` block unconditionally resets `multiShots`, `sessionShots`,
`pickedIndices`, `multiShotInProgress`, and `_captureChainActive`. The old
code skipped all of these on a thrown rejection, stranding the user.
