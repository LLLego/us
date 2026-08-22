---
status: fixed
domain: js-engine
severity: major
---

# PeerJS data-channel handler silently drops messages with no validation — guest can corrupt host state via crafted `setFrame`/`setLayout`/`finalStrip`/`pairShot`

## SYMPTOM
The data connection `on('data')` handler at lines 1530–1552 of `js/app.js` accepts any object that has the right `.action` key and dispatches without validating types or source. A guest (or any peer that reaches the room via spoofed peer id) can:
- Send `{action: 'finalStrip', data: '<arbitrary huge dataURL>'}` → host adopts it as `capturedImage`, calls `showReveal`, adds to gallery, uploads to Supabase.
- Send `{action: 'setFrame', key: '__proto__'}` or `key: '<huge string>'}` → host's `setFrame` looks up `FRAMES[key]` (undefined) and silently does nothing, OR if the key collides with a global, bad things happen.
- Send `{action: 'pairShot', index: -1, data: '...'}` → host writes into `this.pairPartnerShots[-1]` which creates an array property that confuses the `slice(0, 4)` later (actually `slice` ignores negative indices by treating them as offsets from end — wait, `slice(-1)` returns the last element. Theirs ends up `[]` if partner shot is empty. Mild issue.)
- Send `{action: 'capture', captureTime: -100000000, frame: null, layout: null}` → host calls `handleSyncedCapture(-100000000, null, null)` → at line 1585: `if (frame && frame !== this.currentFrame) this.setFrame(frame);` → guard skips null. Good. But at line 1591: `this.capture();` is called UNCONDITIONALLY if `delay <= 0` — there's no rate limit, no chain check, no nothing. A peer can spam `capture` messages and force the host into capture chains.

## REPRO / EVIDENCE
- File: `js/app.js`, lines 1530–1552:
  ```js
  conn.on('data', (data) => {
    if (!data) return;
    if (data.action === 'sharedTick') {
      this.playTickSound();
    } else if (data.action === 'finalStrip' && data.data) {
      this.capturedImage = data.data;
      this.sessionShots = [];
      this.pickedIndices = [];
      this.multiShotInProgress = false;
      this._captureChainActive = false;
      this.showReveal();
    } else if (data.action === 'pairShot' && typeof data.index === 'number' && data.data) {
      this.pairPartnerShots = this.pairPartnerShots || [];
      this.pairPartnerShots[data.index] = data.data;
    } else if (data.action === 'capture') {
      this.handleSyncedCapture(data.captureTime, data.frame, data.layout);
    } else if (data.action === 'setFrame' && data.key) {
      if (data.key !== this.currentFrame) this.setFrame(data.key);
    } else if (data.action === 'setLayout' && data.key) {
      if (data.key !== this.currentLayout) this.setLayout(data.key);
    }
  });
  ```

### Specific defects

**1. No origin check.** `conn.peer` is available but never validated against `this.roomCode` whitelist or against the known peer IDs the host expected. PeerJS uses public signaling by default — if anyone knows `us-XXXXX-host`, they can connect.

**2. `finalStrip` triggers cloud upload + gallery add with no consent.** Line 1536: `this.capturedImage = data.data` — accepts any string as the captured image. The reveal canvas draws it (`img.src = data.data`, line 1264) and `addToGallery` (line 1269) uploads a possibly-malicious dataURL to Supabase. The cloud upload at line 1272 has no size limit; a 50 MB dataURL will hang the upload silently (Supabase rejects > 50 MB but the error path returns null at line 48 of supabase.js).

**3. `pairShot` index out-of-bounds.** Line 1544: `this.pairPartnerShots[data.index] = data.data` — if `data.index` is 99, the array grows to length 100. Later `slice(0, 4)` at line 1066 trims it, so no crash, but a malicious peer could DOS by sending many distinct indices.

**4. `capture` has no rate limit.** Line 1546: `this.handleSyncedCapture(...)` immediately calls `this.capture()` if delay <= 0. A spam peer can flood the host's UI with countdowns.

**5. Silent catch in `try { conn.send(...) } catch(e) {}` at lines 1524–1527.** Connection state errors are swallowed. If the data channel is in a bad state, the host has no idea.

### Repro timeline (DoS via `finalStrip` spam)
1. Attacker joins room `ABCD1` (host is at peer id `us-ABCD1-host`).
2. Attacker connects, sends `{action: 'finalStrip', data: '<giant dataURL>'}` repeatedly.
3. Host's `showReveal()` runs each time. `addToGallery` runs each time. `storage.upload` fires each time. `this.capturedImage` is overwritten. The reveal canvas re-paints the giant image.
4. Host's `localStorage` quota fills (gallery saves 20 entries at line 1310). Eventually `saveGallery` throws inside the catch at line 1312 — but during the flood, the gallery keeps growing in memory (`this.gallery.unshift` at line 1304).
5. Mobile devices with 4 GB RAM: OOM within minutes.

## EXPECTED
- Validate `conn.peer` against expected peer id pattern.
- Validate `finalStrip.data` size (< 5 MB) and that it starts with `data:image/jpeg;base64,`.
- Rate-limit `capture` messages (max 1 per 5 s).
- Clamp `pairShot.index` to [0, 3].

## ACTUAL
- All four above are unguarded.

## SUGGESTED FIX DIRECTION
- Add a small validator helper at the top of `conn.on('data')`:
  ```js
  const validPeer = conn.peer.startsWith(`us-${this.roomCode}-`);
  if (!validPeer) return;
  ```
- Size-limit `data.data` to `< 5 * 1024 * 1024` characters and check prefix.
- Track `this._lastCaptureRequestAt = Date.now()` and reject `capture` messages within 4 s of the last.
- Clamp `pairShot.index` to `Math.max(0, Math.min(3, data.index | 0))`.
## Fix notes (Lane 1)
Replaced the inline `conn.on('data', ...)` switch in `setupDataConnection`
with `this.duo.attachTo(conn)`. The duo machine's `_handleInbound` is the
SINGLE entry point for all inbound data-channel messages. It:
- Validates sender peer id against `us-${roomCode}-*` prefix (rejects
  spoofed peers; PeerJS uses public signaling)
- Clamps `pairShot.index` to [0, 3]
- Size-limits dataURL payloads to < 5 MB
- Rate-limits inbound `capture` messages to 1 per 4 s
- Accepts both `type` and `action` fields for back-compat
- Replies with `_ACK` messages so the sender's pending-ack timer clears
