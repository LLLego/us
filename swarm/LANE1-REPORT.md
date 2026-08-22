# LANE 1 — Duo Session State Machine — REPORT

**Court diagnosis (unanimous):** five symptoms share one root cause —
peers mutate local session state fire-and-forget, with no unified
duo-session state contract, no handshake/ack protocol, and no shared
definition of "final." This lane fixes the contract ONCE; the symptoms
collapse.

**Status:** ✅ all 13 issues fixed, full code shipped under
`js/duo-state.js` + `js/app.js` + `index.html` + `css/main.css`. Ready
for Hermes hostile verification (timeline-sampled state traces on
retake/drop-frame/orphan paths).

---

## 1. State Machine (canonical)

```
                ┌──────────────────────────────────────────────────┐
                │                                                  │
                │                                                  ▼
  IDLE ──► ROOM_OPEN ──► CONNECTED ──► SYNCING ──► CAPTURING ──► PICKING
                ▲          │             │              │           │
                │          │             │              ▼           ▼
                │          │             │           FINALIZING ──► REVEALED
                │          │             │              │           │
                │          │             │              ▼           │
                │          │             │          CONNECTED ◄─────┘
                │          │             │              │
                │          ▼             ▼              ▼
                └──── JOINING ──► CONNECTED      DISCONNECTED
                                                  │
                                                  └─► IDLE (terminal)
                                                  └─► CONNECTED (rejoin)
```

**States (10):** IDLE · ROOM_OPEN · JOINING · CONNECTED · SYNCING ·
PICKING · CAPTURING · FINALIZING · REVEALED · DISCONNECTED.

**Transitions are centralized** in `DuoSession.transition()`. Every
unlisted path is rejected and logged (`[duo] INVALID transition ...`)
so any future bypass attempt is visible in the console.

### Where each transition is fired

| From → To | Trigger |
|---|---|
| IDLE → ROOM_OPEN | `startTogether()` host branch |
| IDLE → JOINING | `startTogether(true)` (URL-join) or `joinRoom()` |
| ROOM_OPEN/JOINING → CONNECTED | `conn.on('open')` on the data channel |
| CONNECTED → SYNCING | initial setFrame/setLayout echo sent (acked) |
| SYNCING → CAPTURING | `duo.beginCapture()` |
| CAPTURING → PICKING | chain finished, pick screen opened |
| PICKING → FINALIZING | `duo.beginPairFinalize()` (host starts pair composite) |
| FINALIZING → REVEALED | `duo.publishReveal(dataURL)` (host) or `_adoptPartnerReveal()` (guest) |
| any → DISCONNECTED | `duo.markPartnerLeft(reason)` or `conn.on('close')` |
| DISCONNECTED → CONNECTED | `duo.markPartnerBack()` (any inbound message) |
| any → IDLE | `duo.markSelfLeft(reason)` |

---

## 2. Data-Channel Message Protocol

### Actions (10)

| Action | Type | Payload | Ack? |
|---|---|---|---|
| `sharedTick` | FIRE | `{ n }` | no — one-way beep |
| `presence` | FIRE | `{}` | no — soft liveness ping |
| `pairShot` | FIRE | `{ index, data }` | no — fire-and-forget for the photo data (acked only at the composite-finalize level via `finalizePair`) |
| `finalStrip` | FIRE | `{ data }` | no — LEGACY path, kept for back-compat |
| `partnerLeft` | FIRE | `{ reason }` | no — one-way notice |
| `setFrame` | ACKED | `{ key, msgId }` | yes — reply `{ type: 'setFrame_ACK', msgId }` |
| `setLayout` | ACKED | `{ key, msgId }` | yes |
| `capture` | ACKED | `{ captureTime, frame, layout, msgId }` | yes |
| `retakeAll` | ACKED | `{ msgId }` | yes |
| `finalizePair` | ACKED | `{ msgId }` | yes |
| `finalReveal` | ACKED | `{ data, msgId }` | yes |

### ACK protocol

- Sender assigns a monotonic `msgId` (`m1_<ts>`, `m2_<ts>`, ...).
- Receiver replies with `{ type: '<ACTION>_ACK', msgId }` BEFORE processing.
- Sender tracks `msgId → { action, sentAt, retries, timer, warnTimer }`.
- Retry once at **2 s** (`ACK_TIMEOUT_MS`) if no ACK.
- After **4 s** total (`ACK_TOTAL_MS`), surface an in-page warning via
  `_surfaceInlineError()` (auto-dismissed after 6 s; tap to dismiss).
- Warnings are deduped per `(action, reason)` so spam doesn't fill the UI.
- Every pending ack is cleared on `detach()` (cleanupPeer) so we don't
  leak timers across connection teardown.

### Inbound validation (issue 030)

All inbound messages pass through `DuoSession._handleInbound()`:

1. **Peer id validation** — `conn.peer` must match
   `us-<roomCode>-*`. Drops spoofed peers (PeerJS uses public signaling).
2. **Size limit** — payload `data` strings must be < 5 MB.
3. **Index clamping** — `pairShot.index` clamped to [0, 3].
4. **Rate limiting** — inbound `capture` messages limited to 1 per 4 s.
5. **Action dispatch** — both `type` and `action` field names accepted
   for back-compat (the old code used `action`, the new code uses `type`).

---

## 3. Symptom Derivation (how each of the 5 symptoms is fixed)

### Symptom A — Duo layout chips never built

**Root cause:** `buildLayoutChips()` runs once at boot with `mode === null`.
The `if (l.duoOnly && this.mode !== 'together') continue;` filter strips
all three duo chips. Nothing rebuilds them when mode flips to 'together'.

**Fix (issue 001):**
- `startTogether()` (host + URL-join branches) and `joinRoom()` now call
  `this.buildLayoutChips()` AFTER `startCamera()` succeeds.
- The duo machine's observer in `_onDuoEvent()` calls `buildLayoutChips()`
  on every CONNECTED transition (covers reconnect / partner-back paths).
- Net result: as soon as `mode === 'together'`, the chip row renders
  `duo-strip`, `duo-grid`, and `pair`.

### Symptom B — FinalStrip adoption one-sided

**Root cause:** `pickPrint()` (line 298) sent host's strip as
`finalStrip`. Guest adopted it wholesale (line 1541). Neither side
reached REVEALED with a "joined" canvas — they each had the host's view.

**Fix (issue 020):**
- New `finalReveal` action (ACKED) replaces `finalStrip` as the
  authoritative "final" handoff.
- Host calls `this.duo.publishReveal(this.capturedImage)` after the
  composite completes.
- Guest's `_handleInbound()` dispatches `finalReveal` to
  `_adoptPartnerReveal(dataURL)`, which sets `capturedImage` identically
  and calls `showReveal()`.
- Both peers reach REVEALED with the SAME canvas. The transition is
  centralized in the machine: only the host can `publishReveal` because
  it owns the composite.

### Symptom C — Pair-capture finalization unreachable

**Root cause:** `finalizePairCapture` (line 1060) polled for partner
shots but `pair` layout chips were invisible (symptom A), so the code
path was dead. When manually forced, the wait was unbounded (no
progress, no cancel) and silently padded with the host's last shot
repeated 4× on timeout.

**Fix (issues 017, 032):**
- Issue 001 makes pair reachable.
- `finalizePairCapture` now uses a bounded 12 s wait (Date.now() deadline)
  with a visible `#pair-progress` overlay showing "joining your pair…"
  plus a progress bar updating every 250 ms.
- A CANCEL button on the overlay aborts the wait and returns to the
  pick screen with whatever partner shots arrived.
- On timeout with 0 partner shots, `_surfacePartnerMissingModal()`
  surfaces a modal: PRINT MY SIDE or RETAKE.
- `_captureChainActive` stays TRUE across the entire wait window (issue
  005), so the shutter is locked and a stray tap can't wipe `sessionShots`.

### Symptom D — pickRetake not synced to partner

**Root cause:** `pickRetake()` (line 273) only reset local state. No
wire message existed for "retake." The partner kept stale `sessionShots`
and stale screen.

**Fix (issue 023):**
- `pickRetake()` now calls `this.duo.requestRetake()` which sends an
  ACKED `retakeAll` message.
- Partner's `_handleInbound()` dispatches `retakeAll` to
  `_handlePartnerRetake()` which clears its session state and returns
  to STAGE.
- `_captureChainActive` is NOT touched — this is a UI reset, not a
  chain cancellation. Per the existing `capture(fromChain)` chain
  token, the chain itself stays valid; only the user-facing session
  state is cleared.

### Symptom E — drop-frame orphans peer

**Root cause:** `useDropFrame()` (line 190) sent one `setFrame` and
flipped the user to `startSolo()` without tearing down the peer
connection. The partner stayed CONNECTED and kept sending setFrame /
setLayout / pairShot into a ghost receiver.

**Fix (issue 008):**
- `useDropFrame()` and `goHome()` now broadcast `partnerLeft` to the
  duo machine FIRST (one-way FIRE), THEN `cleanupPeer()`, THEN
  `startSolo()` / `showScreen('landing')`.
- The partner's `conn.on('close')` triggers
  `this.duo.markPartnerLeft('connection-close')` which transitions the
  machine to DISCONNECTED and emits a `partner-left` event.
- App-side handler `_showPartnerLeftBanner()` renders a visible banner
  with COPY LINK / LEAVE buttons — the user is no longer orphan;
  they have a rejoin affordance.
- `cleanupPeer()` also calls `this.duo.detach()` so handlers don't
  double-bind on reconnect.

---

## 4. Files Changed

| File | Change |
|---|---|
| `js/duo-state.js` | **NEW** — full state machine class + ACK protocol + inbound handler |
| `js/app.js` | Init creates DuoSession; all peer data routed through it; 8 new bridge methods (`_onDuoEvent`, `_handlePartnerRetake`, `_handlePartnerFinalizePair`, `_adoptPartnerReveal`, `_surfaceInlineError`, `_showPairProgress`, `_surfacePartnerMissingModal`, `_showPartnerLeftBanner`, `_hidePartnerLeftBanner`); `finalizePairCapture` rewritten with bounded wait + cancel + missing-partner modal; `compositeMultiShot` extended with duo-strip/duo-grid/pair branches and a fallback; `shotsNeededForLayout` pair-aware; `countdown` cancellation-safe; `useDropFrame` / `goHome` / `pickRetake` / `pickPrint` all route through machine |
| `index.html` | Added `<script src="js/duo-state.js?v=33">` before app.js (cache-buster matches siblings) |
| `css/main.css` | Added 4 animation rules for the new UI overlays (`.duo-inline-error`, `.partner-left-banner`, `.pair-progress`, `.partner-missing-modal`) — minimal as briefed |

## 5. Issues Fixed

All 13 Lane 1 issues marked `status: fixed` with `## Fix notes` in
`swarm/issues/`:

- 001-duo-layout-chips-never-built
- 003-peerjs-host-double-call
- 005-capture-chain-reentry-loses-shots
- 008-usedropframe-silently-disconnects-peer
- 009-composite-silent-rejection-pickprint
- 014-compositemultishot-silently-drops-photos-for-duo
- 017-finalize-pair-silently-strips-host
- 020-together-mode-finalstrip-adoption-does-not-pair-strip
- 023-pickretake-in-together-mode-leaves-guest-stranded
- 025-countdown-settimeout-can-overlap
- 030-data-channel-message-handler-untyped
- 032-finalizepair-unbounded-wait-no-progress
- 041-pair-layout-double-shot-count

## 6. Anti-Regression Guards Preserved

Per the brief's HARD CONSTRAINTS, the following existing invariants are
preserved (each verified by `grep` / `Read`):

- ✅ `capture(fromChain)` chain token — `capture(true)` continuation
  skips `sessionShots = []` reset.
- ✅ `sessionShots` reset gated on `!fromChain`.
- ✅ `setLayout` / `setFrame` no-op guards while `multiShotInProgress &&
  _captureChainActive`.
- ✅ `sharedTick` voice countdown still routes through machine (FIRE).
- ✅ Host-left / guest-right pair interleave (host on left in
  `finalizePairCapture`, guest on right) preserved.
- ✅ Camera survives mic-denied fallback (`startCamera()` catch).

## 7. Constraint Compliance

- ✅ Every element ID the engine touches preserved (verified by
  grepping for `landing`, `room`, `stage`, `reveal`, `gallery-screen`,
  `local-video`, `remote-video`, `frame-overlay`, `frame-sheet`,
  `shutter-btn`, `theme-btn`, `theme-menu`, `countdown-*`, `reveal-*`,
  `gallery-grid`, `room-pill`, `shot-badge`, `pick-grid*`).
- ✅ No new dependencies, no frameworks. Vanilla JS only.
- ✅ CSS touched minimally (4 animation rules + 1 keyframe block).
- ✅ `?v=` not bumped — orchestrator handles cache-busting.
- ✅ No `alert()` in the new code path (replaced with
  `_surfaceInlineError()` inline cards).
- ✅ Playwright-compatible — uses only `navigator.mediaDevices`,
  `window.AudioContext`, `requestAnimationFrame` (all available in
  headless Chromium with `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream`).

## 8. What Hermes Should Verify (hostile verification gates)

Per the brief, Claude's self-checks are inadmissible for this lane.
Hermes should timeline-sample:

1. **Retake sync** — both peers return to STAGE together with
   identical empty session state.
2. **Drop-frame orphan path** — partner-left banner appears with COPY
   LINK + LEAVE within 200 ms of the local user tapping USE IT on the
   drop screen.
3. **Pair finalize** — progress overlay visible, progress bar updates
   every 250 ms, CANCEL returns to pick screen, modal appears on
   timeout with 0 partner shots.
4. **finalReveal handshake** — host publishes, guest acks within
   2 s; both peers reach REVEALED with the same canvas dataURL.
5. **ACK retry path** — disconnect the partner mid-`setFrame`, verify
   2 s retry fires once, 4 s warning surfaces.
6. **Spoofed-peer rejection** — open second tab, manually craft
   `peer.connect` with a non-room peer id; verify messages get
   dropped silently.

---

**Lane 1 ship-ready.** Awaiting Hermes hostile-verifier verdict
before human deploy.
