---
status: fixed
domain: flows
severity: major
---

SYMPTOM
Tapping "USE IT" on the monthly drop screen while connected to a partner in together mode silently switches the user to solo mode: `startSolo()` is called (line 199), which overwrites `this.mode = 'solo'`, calls `hideRemote()`, calls `startCamera()`, but never tears down the existing PeerJS connection. The partner keeps a one-sided "CONNECTED" state and tries to send `setFrame`/`setLayout`/`pairShot` to a peer whose mode has silently flipped.

REPRO / EVIDENCE
- `js/app.js:190-200` `useDropFrame()`:
  ```js
  async useDropFrame() {
    if (!this.dropFrameKey) this.computeMonthlyDrop();
    this.currentFrame = this.dropFrameKey;
    this.applyPreviewAspect();
    this.updateFrameOverlay();
    if (this.dataConnection && this.dataConnection.open) {
      try { this.dataConnection.send({ action: 'setFrame', key: this.currentFrame }); } catch(e) {}
    }
    this.startSolo();
  }
  ```
  Sends one final `setFrame` to the partner then jumps to solo.
- `startSolo()` (line 364-371):
  ```js
  startSolo() {
    this.mode = 'solo';
    this.hideRemote();
    this.startCamera().then(() => {
      this.showScreen('stage');
      setTimeout(() => this.initFrameOverlay(), 100);
    }).catch(() => {});
  }
  ```
  No `cleanupPeer()` call. `this.peer` and `this.dataConnection` remain live; `this.isHost` and `this.roomCode` remain set.
- The partner, seeing the `setFrame` come through, calls `setFrame(data.key)` (line 1548) which mutates their `currentFrame`. They then continue waiting for sync — until the next capture attempt. The "remote" video element is now hidden locally (`hideRemote`), but on the partner's screen their `currentFrame` keeps drifting toward whatever the (no-longer-really-there) user supposedly picks.

EXPECTED
The drop-frame button is meant to be a quick frame picker for solo use. If invoked while connected to a partner, either (a) confirm "leave the room and use this frame solo?" and run `cleanupPeer()` before `startSolo()`, or (b) just set the frame and stay in together mode (call `useDropFrame` from the stage context only).

ACTUAL
The drop screen is reachable from anywhere (landing — line 161-188 `openDrop()` is invoked from the badge; index.html:29). Tapping USE IT silently orphans the partner's session and leaves the local `dataConnection` half-open. Subsequent `setFrame` from the partner will arrive at a `solo`-mode receiver that just updates its own chip row silently.

SUGGESTED FIX DIRECTION
In `useDropFrame`, check `this.mode === 'together'` and either: bail to stage with the frame applied (no `startSolo`), or run `cleanupPeer()` + a confirm before flipping to solo. Either way, never leave the peer connection dangling.
## Fix notes (Lane 1)
`useDropFrame()` now broadcasts `partnerLeft` to the duo machine BEFORE
tearing down the peer connection. If we're in together mode, we call
`this.duo.markSelfLeft('drop-frame')` first (which sends the one-way
`partnerLeft` message), then `cleanupPeer()`, then `startSolo()`. The
partner's `conn.on('close')` triggers the duo machine's
`markPartnerLeft('connection-close')` which surfaces the new
`partner-left-banner` with COPY LINK / LEAVE buttons. Same fix applied to
`goHome()`.
