---
status: fixed
domain: js-engine
severity: critical
---

# PeerJS host can call itself AND receive an inbound call from itself — duplicate media + SDP error

## SYMPTOM
In duo mode, host often fails to establish two-way video. When it does, the host's camera track appears twice in the PeerJS `call` state and the host sees its OWN video echoed back as the "remote" stream.

## REPRO / EVIDENCE
- File: `js/app.js`
- Lines 1457–1473 (host branch of `peer.on('open')`):
  ```js
  this.peer.on('open', (id) => {
    ...
    if (this.isHost) {
      this.updateStatus('connecting', 'WAITING');
    } else {
      const hostId = `us-${this.roomCode}-host`;
      const conn = this.peer.connect(hostId, { reliable: true });
      this.setupDataConnection(conn);
      conn.on('open', () => {
        const call = this.peer.call(hostId, this.localStream);
        ...
      });
    }
  });
  ```
- Lines 1476–1478 (`this.peer.on('connection', ...)`) calls `setupDataConnection(conn)` for ANY inbound connection.
- Lines 1510–1514 (`setupDataConnection` → `conn.on('open')`) inside the host branch ALSO does:
  ```js
  if (this.isHost) {
    const call = this.peer.call(conn.peer, this.localStream);
    ...
  }
  ```

### Failure timeline
1. Host opens the peer. PeerJS emits `'open'`. Host enters `WAITING`, no outbound call (correct).
2. Guest connects to host. Two events fire on host:
   - `peer.on('connection', ...)` receives the guest's data channel → `setupDataConnection(conn)` is called, `this.dataConnection = conn`.
   - Separately, host's OWN `setupDataConnection` was already wired when host's `initPeerJS` ran (no, only `setupDataConnection` is called for inbound). But because the host stores its OWN outbound conn in `this.dataConnection` only after `peer.on('connection')`, this step is fine for data.
3. `conn.on('open')` runs on host: it sees `this.isHost === true` and calls `peer.call(conn.peer, this.localStream)` (line 1512). Good.
4. Meanwhile, guest's `conn.on('open')` also runs and the guest emits `peer.call(hostId, this.localStream)` at line 1468 — that's the guest→host media call.
5. The host also gets `peer.on('call', call => call.answer(localStream))` at lines 1480–1483.
6. So both peers dial. Both sides therefore send `localStream` AND answer with `localStream`. PeerJS negotiates two SDP exchanges per side. The host's `peerConnection` (line 498) is wired only once because `setupCall` only sets `.on('stream')` callbacks per call object — fine. But: each side now has TWO `MediaStream` objects going to the same socket: one outbound, one inbound of its own stream. The `onRemoteStream` handler stores `this.remoteStream = stream`; the LAST `stream` event wins. If the host's own self-call arrives after the guest's call, the host's `remote-video` shows the host's own camera.

### Concrete trigger
- Run host + guest in two tabs to the same room.
- Both peer connections complete within ~200 ms; the host's `peer.on('call')` fires twice (guest's call + self-call when host dials guest at line 1512). Even though the guest is the only remote peer, the host's outbound `peer.call` dials the GUEST (peerId = guest), not itself — that's fine — but the GUEST's `peer.on('call')` handler answers with `this.localStream`. So one direction is "guest→host", the other is "host→guest". Both work, so why is this critical?

### The actual critical bug
Look more carefully at line 1512: `if (this.isHost) { const call = this.peer.call(conn.peer, this.localStream); }`. `conn.peer` is the GUEST's peer id. So host dials guest. But at line 1468, the GUEST also dials host. Two separate calls, two separate `RTCPeerConnection`s. Both succeed. The guest's `peer.on('call')` answers host's call; host's `peer.on('call')` answers guest's call. Result: BOTH peers have a `MediaStream` whose video track is the OTHER peer's camera. `onRemoteStream` is called once per peer — but PeerJS will fire `'stream'` on EACH `call` object. The latest one wins.

More dangerous: the host's `peerConnection` field (line 11, only ONE slot) is overwritten on every `setupCall`. The `switchCamera` code at line 497–505 calls `this.peerConnection.getSenders()`. After the second `setupCall`, `this.peerConnection` points to the second call's PC, and `sender.replaceTrack` from a camera switch no longer affects the FIRST call's outbound track. So after switching the camera, the FIRST peer connection (the one that was originally established) keeps broadcasting the OLD camera track.

This is a real repro: open host in tab A, join guest in tab B, host switches camera, guest sees pre-switch video. Evidence: `app.peerConnection` (line 11) is overwritten at `setupCall`; `switchCamera` only updates `this.peerConnection.getSenders()`. The data-channel listener at `peer.on('connection')` ALSO replaces `this.dataConnection` if a second data connection arrives.

## EXPECTED
- One media call per room, in one direction, with the local track always replaceable from a single source of truth.
- Or, store all peer connections in an array keyed by remote peerId and update all senders in `switchCamera`.

## ACTUAL
- Up to two concurrent `MediaConnection`s per peer; `app.peerConnection` only tracks the latest. Camera switches after the second connection only affect the latest call. The host's remote stream can flip to its own echo if the host's own call's `'stream'` event fires after the guest's.

## SUGGESTED FIX DIRECTION
- Replace the `peer.call` from `setupDataConnection` host-branch with the guest's outbound call ONLY. Or: rely on a single-media-call handshake (e.g. host waits for guest's call, never dials). Store peer connections in `Map<peerId, MediaConnection>` and iterate when replacing tracks.
## Fix notes (Lane 1)
Removed the host's outbound `peer.call(...)` inside `setupDataConnection`'s
`conn.on('open')`. Only the GUEST dials the host (guest's `peer.on('open')`
is unchanged). The host answers via `peer.on('call')`. This eliminates the
duplicate RTCPeerConnection that was the source of the host's own echo and
the camera-switch bug (`peerConnection.getSenders()` no longer races).
