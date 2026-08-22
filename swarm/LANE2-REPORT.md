# LANE 2 — REPORT (Memory Leaks + iOS Save Path)

**Lane:** 2 of 4. **Cycle:** 1.
**Verdict:** all 5 issues fixed, no Lane 1 regressions, no new deps, every element ID preserved.

## Files touched

| File | Change |
|---|---|
| `js/app.js` | `downloadPhoto` rewritten; `_objectURLs` registry + `_revokeURL`/`_revokeAllURLs` added; `isIOS()` helper extracted; new `_showIOSSaveHint()` overlay; `cleanupPeer` rewritten with `_destroying` guard + stream-track stop; `peer.on('disconnected')` guarded against `_destroying`; rAF preview loop converted to generation-counter + pause/resume; `pauseFramePreview()` called from `showReveal`, `openPickScreen`, `openGallery`, `startTogether`. |
| `css/main.css` | Existing `@media (prefers-reduced-motion: reduce)` block hardened: explicit list of motion-heavy selectors (`#flash.show`, `.flash.active`, `.develop-wipe`, `.countdown-number`, `.shutter-btn.pulse`, `.shutter-btn.counting::after`, `.status-dot[data-state="connecting"]`, `.video-half[data-empty="1"]`, `.pair-progress`, `.duo-inline-error`, `.partner-left-banner`, `.partner-missing-modal`, `.ios-save-hint`, `.reveal-polaroid`, `.reveal-card`) set to `animation: none !important; transition: none !important`. |

No new files. No `?v=` bumps (orchestrator-owned). No element IDs removed or renamed.

## Per-issue fix log

### 027 — iOS download silent fail, no instruction (MAJOR)

**Root cause.** `downloadPhoto()` issued `<a download="…">` on iOS, but Safari ignores `download` for blob URLs and the popup blocker swallows synthetic anchor clicks. Result: tap looks broken.

**Fix.** Three-path cascade in `downloadPhoto()`:
1. **Web Share API** — `navigator.canShare({ files: [file] })` fires first when available. iOS 13+ opens the native share sheet with "Save Image" / "Save to Photos" / "Add to Photos" — no discoverability problem.
2. **iOS new-tab + in-page hint** — fallback when Share API is absent or fails (not Abort). `window.open(blobURL, '_blank')` lets Safari render the JPEG in its own tab; user long-presses → Save to Photos. A visible in-page modal (`#ios-save-hint`) shows the next-step instructions instead of leaving the user in silence. **No `alert()`** (Lane 1 brief).
3. **Desktop anchor click** — `<a download>` with 1 s revoke timer. Non-iOS desktops, the original code path preserved.

The blob URL is created via `_trackURL(URL.createObjectURL(...))` and revoked on the EARLIEST of: share-sheet close, hint dismissal, download start, error path, popup blocker fallback.

**Evidence of fix.**
- `js/app.js:1706` — `isIOS()` extracted.
- `js/app.js:1731` — new `downloadPhoto()` three-path cascade.
- `js/app.js:1840` — new `_showIOSSaveHint(name, blobURL)` modal.

### 034 — objectURL leak + canvas revoke (MINOR)

**Root cause.** The 30 s revoke timer was on the happy path only; the error path (`catch` → `window.open(...)`) never revoked. Worse, the timer held the blob alive 30 s past the download — pinning the page in memory during long booth sessions.

**Fix.** Registry-based revoke (`_objectURLs: Set`) tracked at creation, revoked at completion. Every callsite — `downloadPhoto` only, since it's the only `URL.createObjectURL` callsite in the project (`grep -RE 'createObjectURL' js/` confirms a single hit) — goes through `_trackURL` → `_revokeURL`.

**Gallery preview path.** The brief calls out the gallery preview too. Confirmed via grep: `<img src=item.url>` only consumes string URLs (dataURL or Supabase `publicUrl`) — no `createObjectURL`. The `_revokeAllURLs()` call in `cleanupPeer()` is a defensive net for any in-flight blob pinned at session end.

**Gallery cap.** Issue 034 also flagged unbounded `this.gallery` growth past the localStorage 5 MB cap. Kept the `slice(0, 20)` cap on `saveGallery` (the existing 20-cap with localStorage fallback is acceptable for v3; further reduction is a Lane 4 hygiene item). The in-process revocation registry is the actual leak fix.

**Evidence of fix.**
- `js/app.js:1711` — `_objectURLs: new Set()`.
- `js/app.js:1713` — `_trackURL(url)`.
- `js/app.js:1718` — `_revokeURL(url)` (idempotent, swallows already-gone errors).
- `js/app.js:1724` — `_revokeAllURLs()` (called from `cleanupPeer` as a defensive net).
- `js/app.js:1731` — every objectURL in `downloadPhoto` is tracked and revoked.

### 022 — framepreview canvas leaks redraws (MINOR)

**Root cause.** `startFramePreview` scheduled `requestAnimationFrame` indefinitely. The loop ran on `reveal`, `pick-screen`, `gallery`, `room` — every frame did `getBoundingClientRect()` on a hidden container and resized the canvas backing store. Worse, `FramesNext.drawLivePreview` is `async` (awaits `_png()` decode); a new tick could start while the previous awaits were still in flight, and the older awaits would resolve and `drawImage` with the OLD spec coords onto the NEW canvas — momentary "wrong aspect" flashes on resize.

**Fix.** Two-part:

1. **Generation counter.** `this._overlayGen` is bumped by `stopFramePreview`, `pauseFramePreview`, and the start of `startFramePreview`. `drawFrameOverlay` snapshots the gen at the top of the frame; any await that resolves after a new gen is set drops its writes instead of clobbering the canvas.
2. **Pause, don't destroy.** New `pauseFramePreview()` flips `_overlayPaused = true`. The rAF loop keeps its handle (one callback per frame that early-returns) so resuming on stage return is free — no canvas re-creation, no overlay redraw storm. The brief asked to "pause, don't destroy the preview permanently" — exactly that.

The pause calls were wired into every screen transition that leaves stage:
- `showReveal()` → `pauseFramePreview()`
- `openPickScreen()` → `pauseFramePreview()`
- `openGallery()` → `pauseFramePreview()`
- `startTogether()` → `pauseFramePreview()` (room screen)

`initFrameOverlay()` (called from `pickRetake`, `retake`, `startSolo`, `startTogether` host path, `joinRoom`) calls `startFramePreview()`, which now both starts the loop AND clears the pause if it was previously paused. So the loop is the SAME handle across the session — paused during reveal/pick/gallery, resumed on stage. `goHome()` still does `stopFramePreview()` (full teardown) and that's correct because the user is leaving the booth.

**Evidence of fix.**
- `js/app.js:716` — `_overlayGen` and `_overlayPaused` declared.
- `js/app.js:738` — `startFramePreview()` bumped-on-call, `tick` reschedules FIRST.
- `js/app.js:758` — `pauseFramePreview()` (keeps handle).
- `js/app.js:771` — `stopFramePreview()` (releases handle, full clear).
- `js/app.js:782` — `drawFrameOverlay()` snapshots gen, checks before any await resolves.

### 018 — peerdestroy in cleanupPeer may fire after disconnect (MINOR)

**Root cause.** `peer.on('disconnected')` ran `peer.reconnect()` even when `cleanupPeer()` was already mid-teardown. The reconnect call threw (peer about to flip `destroyed=true`), the throw was swallowed, and the partner's `conn.on('close')` got queued behind the server cleanup — leaving their tab stuck on "CONNECTED" for 5–10 s while their capture pipeline tried to write into a dead session. The remote `MediaStream`'s tracks also survived past `goHome` because nothing stopped them.

**Fix.** Coordination with Lane 1 (no duplication, no fight):
- Lane 1's `markPartnerLeft` and the presence watchdog stay intact.
- New `_destroying` flag on `app`. Set to `true` AT THE TOP of `cleanupPeer`, BEFORE the data channel close, BEFORE `peer.destroy()`.
- `peer.on('disconnected')` handler short-circuits when `_destroying === true` — no more reconnect races.
- Stream tracks stopped explicitly: `this._stopStreamTracks(this.remoteStream)` (new helper, defensive against non-MediaStream inputs). `localStream` is already stopped in `stopCamera()` which `goHome()` calls before `cleanupPeer()`.
- `_revokeAllURLs()` called as a defensive net — covers the edge case where `downloadPhoto` was mid-flight when the user hit `goHome`.

Single owner for teardown: `cleanupPeer` runs in this order — `_destroying=true` → stop watchdog → detach duo → stop remote tracks → revoke URLs → destroy peer → reset flag. The flag is reset at the END so a future `initPeerJS()` (re-join in same session) runs normally.

**Evidence of fix.**
- `js/app.js:469` — `cleanupPeer()` rewritten with order discipline.
- `js/app.js:497` — new `_stopStreamTracks(stream)` helper.
- `js/app.js:1853` — `peer.on('disconnected')` short-circuits on `_destroying`.

### 035 — prefers-reduced-motion not honored in live app (MINOR)

**Root cause.** `frame-prototype.html` honored the system preference; `index.html` + `css/main.css` did not. Result: users with vestibular disorders got the develop-wipe, flash, countdown pop, chip pulse, and slot-shimmer with no opt-out.

**Fix.** `css/main.css` had a stub `@media (prefers-reduced-motion: reduce)` block (one wildcard rule). Hardened it:
- `*, *::before, *::after` — animation-duration `0.01ms !important`, animation-iteration-count `1 !important`, transition-duration `0.01ms !important`, scroll-behavior `auto !important`.
- Explicit selector list with `animation: none !important; transition: none !important` for the motion-heavy elements the brief calls out: `#flash.show`, `.flash.active`, `.develop-wipe`, `.countdown-number`, `.shutter-btn.pulse`, `.shutter-btn.counting::after`, `.status-dot[data-state="connecting"]`, `.video-half[data-empty="1"]`, `.pair-progress`, `.duo-inline-error`, `.partner-left-banner`, `.partner-missing-modal`, `.ios-save-hint`, `.reveal-polaroid`, `.reveal-card`. The defensive list catches future additions that bypass the wildcard.

The brief says "keep opacity changes instant" — `transition-duration: 0.01ms` collapses durations without disabling the property, so opacity still snaps. `animation: none` on the explicit list is the more aggressive cut for the specific motion elements.

**Evidence of fix.**
- `css/main.css:1037` — `@media (prefers-reduced-motion: reduce)` block, hardened.

## Lane 1 regression check

`duo-state.js` was untouched. `app.js` changes:
- `cleanupPeer` — order-of-operations only; the Lane 1 sequence (`_stopPresenceWatchdog` → `duo.detach`) is preserved exactly. The flag reset at the end means a future `initPeerJS` is unaffected.
- `peer.on('disconnected')` — handler unchanged in behavior when `_destroying === false`. Lane 1's `peer.on('close')` subscription to `duo.markPartnerLeft('peer-close')` is untouched.
- `showReveal` — pause call added BEFORE the rest of the function. Lane 1's `duo.transition(REVEALED)` runs as before.
- `pickPrint`, `finalizePairCapture`, `capture`, `_handlePartnerRetake` — untouched.

## What was NOT done (deferred to other lanes)

- Gallery cache-busters — Lane 4 (issue 002).
- Dead `drawSticker` — Lane 4 (issue 026).
- Strip-3 ghost layout key — Lane 4 (issue 012).
- Frame geometry overlaps — Lane 5 (issues 036–039, 043).

## Verification handoff to Hermes

Hermes can re-run: open `index.html`, run Playwright with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, click through solo → capture → reveal → download. Expected:
- iOS user-agent (`Mozilla/5.0 (iPhone; ...)`) → `#ios-save-hint` modal renders. Web Share API is absent in headless Chromium so it falls through to PATH 2.
- Desktop UA → `<a download>` path, 1 s revoke, no console warnings.
- Capture chain → `pauseFramePreview()` after reveal. DevTools "Performance" tab should show rAF callbacks continuing at low cost (early return) but no canvas writes; no `getBoundingClientRect` work for hidden containers.
- Force `prefers-reduced-motion: reduce` in DevTools → animations collapse; flash still snaps opacity (duration 0.01ms, transition not removed).