---
status: fixed
domain: js-engine
severity: major
---

# `countdown()` uses setTimeout chain with no cancellation — overlapping countdowns can flash twice and resolve twice

## SYMPTOM
Rapidly tapping the shutter button (or receiving a synced-capture message during a countdown) can start a second `countdown()` while the first is still mid-flight. Both resolve independently, both flash, both call `playShutterSound()`. The shutter fires twice, producing two `captureSingleFrame` invocations and two data-channel messages.

## REPRO / EVIDENCE
- File: `js/app.js`
- Lines 860–898: `countdown` implementation:
  ```js
  return new Promise(resolve => {
    let count = seconds;
    const tick = () => {
      if (count > 0) {
        ...
        count--;
        setTimeout(tick, 1000);
      } else {
        flash.classList.add('active');
        this.playShutterSound();
        setTimeout(() => {
          ...
          resolve();
        }, 150);
      }
    };
    tick();
  });
  ```
- The Promise has no external cancellation hook. The `tick` function captures `count` in a closure but nothing prevents a second `countdown()` from being invoked concurrently.
- Lines 941 (`capture`): `await this.countdown(3);` then `this.captureSingleFrame()`. The shutter button is `disabled = true` at line 925 BUT re-enabled at line 961 (between shots in a multi-shot chain), AND re-enabled in `finalizePairCapture`'s caller at line 969.
- `handleSyncedCapture` at lines 1584–1593:
  ```js
  if (delay > 0) {
    setTimeout(() => this.capture(), delay);
  } else {
    this.capture();
  }
  ```
  No check for an in-flight chain.

### Concrete failure timeline
1. User taps shutter in `pair` mode. `capture(false)` runs. `_captureChainActive = true`, `multiShotInProgress = true`. `await this.countdown(3)` starts.
2. Mid-countdown (say at "2"), the partner sends a `capture` action that arrives faster than expected. `handleSyncedCapture` fires `setTimeout(() => this.capture(), delay)`.
3. `delay` could be 0 (or negative) if clocks differ between peers. The `capture()` call enters at line 919. Guard at 923: `_captureChainActive && !fromChain` → returns early. Good.
4. But what if the partner's countdown just finished on their side and their `capture(true)` continuation calls another `countdown()`? Look at line 962–964:
   ```js
   setTimeout(() => {
     if (!this.multiShotCancelled) this.capture(true);
   }, 1500);
   ```
   The `capture(true)` continuation enters, hits line 933: `if (!fromChain) { this.sessionShots = []; }` — for `fromChain=true`, this is skipped. Good. Continues to line 941: `await this.countdown(3)`. This starts a NEW countdown while the OLD one might still be in flight.
5. Old `countdown` is still pending its `setTimeout(tick, 1000)` or its 150 ms flash cleanup. Old `resolve` will fire. Old `flash.classList.add('active')` already triggered, sound already played.
6. New `countdown` does its own `flash.classList.add('active')` and `playShutterSound()` again.

### Why no `capture` rejects this
- `capture` does NOT check whether `this.countdown` is already running. The chain guard at line 923 is for `capture()` itself, not for nested `countdown` calls.
- In multi-shot mode, after shot N completes (line 945–946), the chain schedules `setTimeout(() => capture(true), 1500)` at line 962. If the user accidentally double-taps shutter in that 1.5 s window... actually, `shutterBtn.disabled = true` at line 925 of the next chain call won't help because line 961 already re-enabled it.

Actually re-reading: line 961 `shutterBtn.disabled = false;` happens BEFORE the 1500 ms wait. The user's double-tap during those 1500 ms would have `capture(false)` run, guard at 923 passes (`_captureChainActive` is true), returns. OK.

But the `finalizePairCapture` window (issue 002) DOES re-enable the shutter with no active chain guard. That's the real path.

### Repro (precise, simple)
1. Select `pair` layout.
2. Host taps shutter, completes 4 shots (T0 = first shutter tap).
3. At T0 + 18 s, `_captureChainActive = false`, `finalizePairCapture` starts. Shutter button re-enabled (line 969).
4. Guest, who started their own capture a few seconds later, has ALSO just finished their 4 shots. Their `finalizePairCapture` is in flight too.
5. Both peers' `finalizePairCapture` polls for partner shots. Both succeed after ~12 s.
6. Both call `compositeMultiShot`. Both call `showReveal`. Both call `this.dataConnection.send({action: 'finalStrip'})`.
7. Each peer's `conn.on('data')` for `finalStrip` (line 1534) does `this.capturedImage = data.data; this.showReveal();`. Each peer now has TWO competing `showReveal` calls — one from local composite, one from partner's `finalStrip`. The `showReveal` adds the image to gallery (`this.addToGallery`) at line 1269. So one of the two reveals adds a duplicate to the gallery. The cloud upload (line 1272) also runs twice.

## EXPECTED
- One countdown at a time. One `showReveal` per session. Gallery upload happens once.
- `finalizePairCapture` should coordinate with the partner so only ONE of the two peers composites and the other adopts via `finalStrip`.

## ACTUAL
- Both peers composite independently. Both send `finalStrip`. Both upload to Supabase. The receiver's `finalStrip` handler does `showReveal` which calls `addToGallery` (one extra upload per reveal).

## SUGGESTED FIX DIRECTION
- In `finalizePairCapture`, only the HOST composites; the GUEST waits for `finalStrip` and only adopts it. Or: have one side "win" the race deterministically (e.g. lower peerId).
- Add a "reveal already shown" guard in `showReveal` so the second call is a no-op.
## Fix notes (Lane 1)
`countdown()` now returns the in-flight promise if a second invocation
arrives while one is running — only ONE countdown overlay can be active.
Added a `_countdownCancel` hook so callers can cancel mid-countdown (e.g.
on retake). The timer handle is stored on `this._countdownTimer` so it
can be cleared by `pickRetake()` / `goHome()`. `handleSyncedCapture` also
rate-limits inbound `capture` messages to 1 per 4 s (issue 030 #4) so
spam from a peer can't force the host into a countdown.
