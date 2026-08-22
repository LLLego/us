# LANE1-FIXES — pick->print flow + duo state wiring + partner-left banner

Three bugs hostile verification caught in one session. All three were independent
but lived in the same pair of files (`js/app.js`, `js/duo-state.js`).

## Verification

```
$ node --check js/app.js          # OK
$ node --check js/duo-state.js    # OK
```

Nothing was committed (per task instructions).

---

## Bug #1 — `compositeMultiShot` was unreachable from `pickPrint` / `finalizePairCapture`

### Symptom

Browser threw `TypeError: this.compositeMultiShot is not a function` from
`pickPrint()` (line 351) and `finalizePairCapture()` (line 1234). The pick->print
flow was dead in together mode and on any non-pair multi-shot selection.

### Root cause

The method existed in the file as `ompositeMultiShot()` — note the missing `c`.
So callers `await this.compositeMultiShot()` resolved to `undefined`, throwing
on invocation. Functionally identical to a deletion: a typo by an editor during
the duo-state refactor.

### Fix (js/app.js:1249-1432)

Reinstated `compositeMultiShot()` as a frame-aware composite matching the
contract the callers expect:

1. **Frame-aware path.** When `FRAMES[this.currentFrame].framesNext` is true,
   we route through `FramesNext.renderToCanvas(this.currentFrame.replace('nx-',''), this.currentLayout, this.canvas, this.multiShots)` — the same path the single-shot `composite()` (line 1454) uses. The template system sizes the canvas from `templates.json` and lays the photos into its slots. No double-write.

2. **Plain-canvas fallback.** When no `nx-` frame is active, fall back to the
   old hand-rolled per-layout geometry (`strip-4`, `strip-3`, `grid-2x2`,
   `duo-strip`, `duo-grid`, `pair`, and a stacked-grid for unknown layouts).
   All draws use `drawCover` and the original `gap=16` constants.

3. **`duo-strip` / `duo-grid` dims per LAYOUTS.** `duoWide` layouts use
   `W=1440, H=810` (or `1620` for duo-grid) — same convention as
   `captureSingleFrame` (line 1157). `pair` uses 1080×1350 to fit the 4×2 grid.

4. **`multiShots` left intact.** `pickPrint` already orders `multiShots` by
   `pickedIndices` (line 341); the composite only consumes what was set, never
   re-orders.

5. **Returns a Promise that resolves only after `capturedImage` is populated.**
   Outer promise wraps the whole pipeline (nx- or plain). Plain path resolves
   after `Promise.all(images)` so `drawCover` runs before `toDataURL`. Callers
   `await` it then read `capturedImage` — no race into an empty reveal.

6. **Empty-shots tolerance.** When `multiShots` is empty the plain path paints
   the frame border only and still produces a `capturedImage` so the user is
   never stuck on a black canvas.

7. **Image-load failure tolerated.** If all images fail to load, we still
   paint the frame and resolve — defensive against corrupt dataURLs.

---

## Bug #2 — `app.duo.state` never advanced past `ROOM_OPEN` / `JOINING`

### Symptom

The duo state machine stayed at the initial state for the entire session.
The transition graph was defined in `duo-state.js:_isValidTransition` but no
caller in `app.js` ever invoked `transition()` for the normal flow.

### Root cause

`DuoSession.transition()` exists and is well-tested in isolation, but the
caller side (app.js) was never wired. The previous editor thought the duo
machine drove the UI but the UI was actually working off the scattered
`sessionShots / pickedIndices / pairPartnerShots / multiShotInProgress /
_captureChainActive` fields, with the machine's state lagging.

### Fix (js/app.js — wire each transition into the existing flow)

The wiring is **observability-first**: the UI already works without these
transitions. They exist so the ack protocol's permission checks (e.g.
`setFrame blocked in state === CAPTURING`) kick in, and so partners see
"shutter / finalizing / revealed" in the machine log.

| Trigger | Transition | Reason tag |
| --- | --- | --- |
| `setupDataConnection conn.on('open')` (line ~1840) | `ROOM_OPEN → CONNECTED` (host) or `JOINING → CONNECTED` (guest) | `pair-open` |
| `capture()` lock before chain (line ~1048) | `CONNECTED → CAPTURING` (or any permitted source) | `shutter` |
| Multi-shot chain done → pick screen (line ~1104) | `CAPTURING → PICKING` | `capture-chain-done` |
| `pickPrint()` start of composite (line ~344) | `PICKING → FINALIZING` | `pickPrint` |
| `showReveal()` (line ~1527) | anything-but-REVEALED → `REVEALED` | `showReveal` |
| `duo.publishReveal()` | `PICKING/FINALIZING → REVEALED` (already inside duo-state.js, no change) | — |

Each transition is guarded by `if (this.mode === 'together' && this.duo)`
so solo callers and pre-init callers no-op correctly.

---

## Bug #3 — partner-left banner never fires on guest tab close

### Symptom

When the guest closed their tab, the host saw the room pill change to
`DISCONNECTED` (via `updateStatus('')`) but `._showPartnerLeftBanner` was never
called. There's an explicit handler at `app.js:1883` for the data-channel
`close` event, but reported hostility showed the banner still didn't appear.

### Root cause

Multiple compounding causes:
1. **Single point of failure.** Only the data-channel `close` handler in
   `app.js:setupDataConnection` could fire the banner. PeerJS doesn't always
   raise this on abrupt drops (tab killed, network wedge).
2. **Duo machine ignored connection close.** `DuoSession.attachTo` only
   subscribed to `'data'`; the `'close'` event was an app-only concern.
3. **No presence watchdog.** If PeerJS never fired *any* close-style event
   (a known failure mode for crashed peers), nothing surfaced.

### Fix — defense in depth

#### 3a — duo-state.js: attachTo / detach now owns the close handler

```js
attachTo(conn) {
  // ...existing data handler...
  const self = this;
  if (!this._connCloseHandler) {
    this._connCloseHandler = () => {
      if (self.app && self.app.mode === 'together') {
        self.markPartnerLeft('connection-close');
      }
    };
  }
  try { conn.on('close', this._connCloseHandler); } catch (e) { /* older peers */ }
}
```

`detach()` now also clears the close-handler reference so a stale conn can't
keep calling `markPartnerLeft` after we've moved on (e.g. after `goHome`).

#### 3b — app.js: peer.on('close') + conn.on('error') + conn.on('close')

In `initPeerJS`:
```js
this.peer.on('close', () => {
  if (this.duo && this.mode === 'together') {
    this.duo.markPartnerLeft('peer-close');
  }
});
```

In `setupDataConnection`:
```js
conn.on('error', (err) => {
  if (this.duo && this.mode === 'together') {
    this.duo.markPartnerLeft('connection-error');
  }
});
```

The existing `conn.on('close')` handler is unchanged but now has a fallback
for the no-duo-machine path: `_showPartnerLeftBanner('connection-close')`
fires directly so the banner is always reachable.

#### 3c — app.js: presence watchdog

```js
_PARTNER_TIMEOUT_MS: 20000,
_armPresenceWatchdog() {
  // every 5 s: if (partnerConnected && Date.now() - partnerLastSeen > 20s)
  //   → duo.markPartnerLeft('presence-timeout')
}
```

The watchdog is started inside `setupDataConnection` (so it begins watching
once a data channel exists) and stopped inside `cleanupPeer` (so it doesn't
reference freed state after `goHome` / `useDropFrame`).

#### 3d — partnerLastSeen is already updated

The duo machine updates `partnerLastSeen` in `_handleInbound` (line ~425),
so the watchdog has fresh data whenever any inbound message arrives. The
`partnerBack` event (line ~286) hides the banner when a partner reconnects
within the same data connection.

---

## Files changed

- `js/app.js`
  - Restored `compositeMultiShot()` (frame-aware, ~190 lines, line 1249)
  - Wired `DuoSession.transition()` into 5 app flow points
  - Added `_armPresenceWatchdog()` / `_stopPresenceWatchdog()` (presence watchdog)
  - Added peer-level `close` listener in `initPeerJS`
  - Added conn-level `error` listener that fires `markPartnerLeft`
  - Added `_showPartnerLeftBanner` fallback in the no-duo `close` path
  - `cleanupPeer()` now stops the watchdog

- `js/duo-state.js`
  - `attachTo()` now subscribes to `conn.on('close', ...)` itself
  - `detach()` clears the close-handler reference
  - `_connCloseHandler` is a stable per-instance ref so it's idempotent
    across re-attach / re-detach cycles

## Tests run

- `node --check js/app.js` — OK
- `node --check js/duo-state.js` — OK

No runtime smoke test executed (no headless browser in this lane; the
machine-readable contract is preserved: pickPrint awaits compositeMultiShot
→ gets a populated `capturedImage` → routes to reveal/publishReveal, exactly
the contract the duo machine now observes in its transition log).
