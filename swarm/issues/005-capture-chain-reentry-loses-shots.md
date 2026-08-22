---
status: fixed
domain: js-engine
severity: critical
---

# Multi-shot capture chain can wipe already-captured shots via setTimeout re-entry

## SYMPTOM
In a multi-shot session (strip-4 / grid-2x2 / duo-strip), if the user taps the shutter DURING the inter-shot 1.5 s gap (after `flashFeedback` but before the next `countdown`), the entire session is silently reset and the user starts over from shot 1 — losing all the prior picks-in-progress.

## REPRO / EVIDENCE
- File: `js/app.js`
- `capture(fromChain)` at lines 919–1005. The guard at line 923 reads:
  ```js
  if (this.multiShotInProgress && this._captureChainActive && !fromChain) return;
  ```
  So a fresh `capture()` call WHILE the chain is mid-flight is rejected. **However**, look at the "exit-the-function-but-keep-running" path at lines 962–965:
  ```js
  shutterBtn.disabled = false;
  setTimeout(() => {
    if (!this.multiShotCancelled) this.capture(true);
  }, 1500);
  return;          // <-- returns from this frame of the chain
  ```

  After `shutterBtn.disabled = false` (line 961) the button is enabled. The chain function is still "in flight" — `this._captureChainActive` is still true — but the function frame has returned. There is a 1500 ms window where:
  - `_captureChainActive === true`
  - `multiShotInProgress === true`
  - The shutter button is **enabled** (`disabled = false`).
  - The next chain call will fire via setTimeout.

  A user tap in that window: `capture(false)` → guard at 923 fires → function returns early. The tap is silently dropped. **No visible error, no shutter feedback.** This is a usability bug but not data-loss.

### The actual data-loss path

Now consider `setLayout` at line 830:
```js
setLayout(key) {
  if (this.multiShotInProgress && this._captureChainActive) return;
  ...
}
```
Same guard — layout change is blocked mid-chain. Fine.

But `setFrame` (line 593):
```js
setFrame(key) {
  if (this.multiShotInProgress && this._captureChainActive) return;
  ...
}
```
Also blocked.

### BUT `goHome()` (line 329) is NOT guarded:
```js
goHome() {
  this.hideRoomPill();
  ...
  this.stopCamera();
  this.cleanupPeer();
  this.multiShotCancelled = true;
  this.multiShots = [];
  this.sessionShots = [];
  ...
}
```
Tapping "home" while in a capture chain sets `multiShotCancelled = true` and clears arrays. Good — but it does NOT cancel the pending `setTimeout(() => this.capture(true), 1500)` at line 962. When the timer fires at line 963, the chain resumes (`this.multiShotCancelled` is the only check, and it is true, so capture returns at line 942). Safe.

### The REAL data-loss bug

`finalizePairCapture` at lines 1060–1080 — and how it interacts with the **`capture` chain that called it**. Look at line 970–975 inside `capture`:
```js
if (this.currentLayout === 'pair') {
  this._captureChainActive = false;
  await this.finalizePairCapture();
  return;
}
```
This sets `_captureChainActive = false` BEFORE awaiting `finalizePairCapture`. `finalizePairCapture` itself loops:
```js
for (let i = 0; i < 24 && this.pairPartnerShots.length < 4; i++) {
  await new Promise(r => setTimeout(r, 500));
}
```
…then composites. During those 24 × 500 ms = 12 s, `_captureChainActive` is FALSE. `shutterBtn.disabled` was set to `false` at line 969. So:

1. User starts a `pair` capture, four shots are taken.
2. `finalizePairCapture` begins. `_captureChainActive = false`. Shutter button re-enabled.
3. User taps shutter again → `capture(false)` → guard at 923 fails (`!_captureChainActive`) → `multiShotInProgress` is still true → enters the multi-shot branch → at line 935: `this.sessionShots = []` ← **WIPES THE JUST-CAPTURED PAIR SHOTS.**
4. Then `this.multiShotInProgress = true; _captureChainActive = true;` and a fresh chain begins while the old `finalizePairCapture` is still polling for partner shots.
5. When partner's `pairShot` messages arrive at line 1543–1544, they write into `this.pairPartnerShots[data.index]`, which is the SAME object the orphan `finalizePairCapture` is reading. When it eventually composites (line 1072), it grabs whatever the freshly-running capture chain has accumulated, OR the user's 4 new shots, OR an undefined array.

### Concrete repro timeline
- T0: User selects `pair` layout. Both peers connect. Host taps shutter.
- T1: 4 shots taken over ~4 × (countdown 3s + shot 1.5s) ≈ 18 s.
- T2: `_captureChainActive = false`, `finalizePairCapture` starts polling for partner's 4 shots.
- T3 (T2 + 1 s): host (impatient, didn't realize "wait for partner" was implicit) taps shutter again.
- T4: `capture(false)` runs. Guard at 923 passes. Multi-shot branch (pair layout). Line 935 wipes `sessionShots`. New chain begins.
- T5 (T2 + ~12 s): orphan `finalizePairCapture` from the FIRST chain finishes polling. It composites `this.multiShots` (now polluted) and sends `finalStrip` over the data channel. Both peers see a confused mixed strip; the original 4 host shots are gone.

## EXPECTED
- During `finalizePairCapture`'s 12-second wait, the shutter must remain disabled OR the `multiShotInProgress` guard must extend across the entire pair-composite lifecycle.
- The "wait for partner" UX should be surfaced (spinner, message), not silent.

## ACTUAL
- Shutter is enabled between `_captureChainActive = false` and the chain's `try/finally` `shutterBtn.disabled = false` cleanup (lines 972–1004). A tap during this window enters the multi-shot branch with `layout.shots > 1`, wipes session state, and starts a parallel chain.

## SUGGESTED FIX DIRECTION
- Move the `_captureChainActive = false` reset from BEFORE `finalizePairCapture` to AFTER (line 1079 region), so the chain is considered active until `finalizePairCapture` fully resolves.
- Or hold `shutterBtn.disabled = true` for the entire `finalizePairCapture` window and surface a "waiting for partner" overlay.
## Fix notes (Lane 1)
Two changes in `capture()`:
1. The pair branch keeps `_captureChainActive = true` until
   `finalizePairCapture()` fully resolves. Old code flipped it BEFORE
   awaiting, leaving a window where the shutter was re-enabled mid-wait
   and a tap could wipe `sessionShots` and start a parallel chain.
2. The chain's setTimeout continuation is now stored on `this._chainTimer`
   so it can be cancelled by `pickRetake()` / `goHome()` if needed.
The duo machine owns the `CAPTURING → FINALIZING` transition; re-entry is
prevented because the chain token (`_captureChainActive`) stays true
throughout the partner-wait window.
