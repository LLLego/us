---
status: fixed
domain: flows
severity: major
---

SYMPTOM
`compositeMultiShot()` only handles `strip-4`, `strip-3`, and `grid-2x2` in its photo-drawing branches (line 1126-1143). For any other `currentLayout` — including the duo-only `duo-strip`, `duo-grid`, and `pair` — it falls into the `else { H = 1350; }` branch and never draws the captured photos onto the canvas. Only the cream background gets composited. If the chosen frame is also not a `framesNext` frame, the user gets a blank `capturedImage` dataURL with no photos and no frame.

REPRO / EVIDENCE
- `js/app.js:1082-1166` `compositeMultiShot()`:
  ```js
  if (this.currentLayout === 'strip-4') { ... }
  else if (this.currentLayout === 'strip-3') { ... }
  else if (this.currentLayout === 'grid-2x2') { ... }
  else { H = 1350; }
  ```
  No `duo-strip`, `duo-grid`, or `pair` handling. `loadPromises` is built, `images` is loaded, but the `Promise.all().then(...)` block only runs the drawing for the three known layouts — for everything else the canvas stays cream-colored.
- `pickPrint()` (line 284-308) routes `currentLayout === 'pair'` to `finalizePairCapture` (which does its own thing), but routes everything else through `compositeMultiShot()` (line 295). So if a future fix makes `duo-strip`/`duo-grid` selectable in together mode (issue 001), `pickPrint` would composite an empty canvas.
- `composite()` (line 1169-1215) — the single-shot variant — DOES handle `hasRemote` with a gutter split (line 1188-1192), so the single-shot duo flow works. The multi-shot duo path is what's broken.

EXPECTED
For any multi-shot layout, every captured photo should appear in the final composite. For duo layouts, photos from both parties should appear side-by-side as the layout spec promises.

ACTUAL
Multi-shot composites for non-strip-3/strip-4/grid-2x2 layouts produce a blank (cream-only) `capturedImage`. The reveal then shows an empty polaroid. Even worse, if the frame happens to be a non-framesNext frame, no frame decoration is drawn either (since `frameDef.draw(ctx, W, H)` runs only AFTER the photo branch — and the canvas is still blank). The user sees a cream rectangle and assumes their capture failed.

SUGGESTED FIX DIRECTION
Either (a) add explicit duo-strip/duo-grid/pair branches to `compositeMultiShot` that draw shots into the appropriate slot geometry, or (b) for any unsupported layout, log a warning and fall back to drawing all shots stacked as a grid so at least the photos survive. Treat the "blank polaroid" outcome as a hard error — never let `capturedImage` be empty.
## Fix notes (Lane 1)
Added three explicit branches in `compositeMultiShot()`:
- `duo-strip`: 4 photos stacked vertically on a wider canvas
- `duo-grid`: 2 photos stacked vertically
- `pair`: 8 slots (4 host + 4 partner) in a 2-column layout
Also added a defensive fallback: any layout the compositor doesn't
recognize gets a stacked grid so the photos always appear. No more blank
cream-only polaroids. The fallback logs a console warning naming the
unknown layout (catches future regressions early).
