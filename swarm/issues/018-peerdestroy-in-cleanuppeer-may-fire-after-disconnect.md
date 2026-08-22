---
status: fixed
domain: flows
severity: minor
---

SYMPTOM
When a user exits (✕ button → `goHome()`) while the partner is mid-capture, `cleanupPeer()` (line 349-361) calls `peer.destroy()` on a peer that may already be in a disconnect-reconnect loop (`peer.on('disconnected')`, line 1500-1504 attempts `peer.reconnect()`). Destroying a peer mid-reconnect throws or no-ops inconsistently across browsers; in some cases the partner's UI never receives a close signal because their connection's `close` event is queued behind a still-warming peer.

REPRO / EVIDENCE
- `js/app.js:349-361` `cleanupPeer()`:
  ```js
  cleanupPeer() {
    if (this.dataConnection) {
      try { this.dataConnection.close(); } catch(e) {}
      this.dataConnection = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
      this.peer = null;
    }
    this.remoteStream = null;
    this.hideRemote();
    this.updateStatus('', 'READY');
  }
  ```
  `peer.destroy()` is called synchronously. If `peer.on('disconnected')` fires on the SAME peer during destruction (because the data connection close triggered a server-side disconnect), the `peer.reconnect()` call on line 1502 runs against a peer that is being torn down — which throws `Error: The peer object's destroyed property is true`.
- The `try { ... } catch(e) {}` swallows the error, but the partner side never gets a clean close signal. Their `conn.on('close')` (line 1554) fires only when the data channel fully tears down — which can be delayed by the server's session cleanup.
- Additionally, `stopCamera` is called inside `goHome` but only the LOCAL stream — `this.remoteStream` is set to null without its tracks being stopped. The remote `MediaStream` keeps its video tracks alive on the partner's tab until garbage collection.

EXPECTED
Tearing down a partner connection should (a) immediately notify the partner of close, (b) cleanly stop all media tracks including the remote stream, and (c) not race with the reconnect loop.

ACTUAL
The partner sees a delay (sometimes 5-10 s) before their `conn.on('close')` fires, during which their UI still shows "CONNECTED" and may attempt a capture into a dead session. The partner's `remoteStream` tracks persist past the user-side `goHome` call.

SUGGESTED FIX DIRECTION
Inside `cleanupPeer`: first stop all tracks on `this.remoteStream` and `this.localStream`; then set a `this._destroying = true` flag so the `disconnected` handler short-circuits and skips `reconnect`; then `peer.destroy()`. Consider also sending an explicit `{action: 'bye'}` over the data connection before closing so the partner can react immediately rather than waiting on PeerJS's close propagation.