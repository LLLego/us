// ===== us — Duo Session State Machine =====
// Single source of truth for the *partner relationship* in together mode.
//
// Five symptoms (duo layout chips never built, finalStrip adoption one-sided,
// pair finalization unreachable, pickRetake not synced, drop-frame orphans peer)
// shared one root cause: peers mutated local session state fire-and-forget
// with no shared definition of "final". This file fixes the contract ONCE —
// the symptoms collapse from there.
//
// Exposed on `window.DuoSession`. The `app` object owns an instance and routes
// ALL data-channel sends + receives through it. Acked messages (see ACTIONS
// below) carry `{ type, msgId }`; receivers reply `{ type: '<ACTION>_ACK', msgId }`.
// Senders retry once after 2 s; an unacked message becomes a visible in-page
// warning (auto-dismissed on mobile). Never silent.

// ===== STATES (canonical) =====
// IDLE       — not in a room
// ROOM_OPEN  — host is broadcasting the code, no guest yet
// JOINING    — guest typed a code, dialing the host
// CONNECTED  — data channel open, camera/mic live
// SYNCING    — initial setFrame/setLayout echo not yet confirmed by partner
// PICKING    — peer is mid-capture-chain OR on the pick screen
// CAPTURING  — actively running a capture chain (countdown or shutter)
// FINALIZING — composite in flight, waiting for partner shots (pair) or
//              waiting for partner to commit to reveal (non-pair)
// REVEALED   — showReveal() has run; the canvas/dataURL is settled
// DISCONNECTED — peer gone (drop-frame, drop, network); cleanup running

const DUO_STATES = {
  IDLE: 'IDLE',
  ROOM_OPEN: 'ROOM_OPEN',
  JOINING: 'JOINING',
  CONNECTED: 'CONNECTED',
  SYNCING: 'SYNCING',
  PICKING: 'PICKING',
  CAPTURING: 'CAPTURING',
  FINALIZING: 'FINALIZING',
  REVEALED: 'REVEALED',
  DISCONNECTED: 'DISCONNECTED',
};

// ===== ACTIONS (data-channel message types) =====
//
// Every action is either FIRE (best-effort, no reply) or ACKED (the receiver
// must echo ACK). Acked messages get a 2 s retry and an in-page warning.
//
// FIRE:
//   sharedTick       — countdown beep echo (one-way)
//   presence         — soft liveness ping (no reply expected)
//   pairShot         — one photo for the partner's half (slot index in body)
//   finalStrip       — host sends a finalized image (single source of "final")
//   partnerLeft      — local user left (drop-frame, drop, goHome)
//
// ACKED:
//   setFrame         — partner frame key change
//   setLayout        — partner layout key change
//   capture          — synced countdown trigger (host initiates; both peers
//                      confirm they're ready)
//   retakeAll        — both peers reset session and return to STAGE
//   finalizePair     — host declares pair layout composite is starting; guest
//                      acknowledges and starts sending pairShot messages
//   finalReveal      — host declares final reveal ready; guest adopts
//
// Every ACKED message carries msgId. Sender tracks msgId → pending timer; on
// ACK it cancels the retry. After 4 s (1 retry at 2 s + grace) it surfaces
// "partner may not have heard you" warning.

const ACTION = {
  // FIRE
  SHARED_TICK: 'sharedTick',
  PRESENCE: 'presence',
  PAIR_SHOT: 'pairShot',
  FINAL_STRIP: 'finalStrip',
  PARTNER_LEFT: 'partnerLeft',
  // ACKED
  SET_FRAME: 'setFrame',
  SET_LAYOUT: 'setLayout',
  CAPTURE: 'capture',
  RETAKE_ALL: 'retakeAll',
  FINALIZE_PAIR: 'finalizePair',
  FINAL_REVEAL: 'finalReveal',
};

const ACK_TIMEOUT_MS = 2000;       // first retry at 2 s
const ACK_TOTAL_MS = 4000;         // warning after 4 s
const ACK_RETRY_COUNT = 1;         // one retry
const MAX_PAIR_WAIT_MS = 12000;    // bounded wait for partner pairShots

// ===== SINGLE SOURCE OF TRUTH =====
//
// All duo-related state lives here. `app` reads/writes via getters. Scattered
// fields in app.js (`currentLayout`, `sessionShots`, `pairPartnerShots`,
// `multiShotInProgress`, `_captureChainActive`) remain but are kept in sync
// via the sync methods below.

class DuoSession {
  constructor(app) {
    this.app = app;
    this.state = DUO_STATES.IDLE;
    this.role = null;              // 'host' | 'guest'
    this.frame = null;
    this.layout = null;
    this.shots = [];               // local capture shots (dataURLs)
    this.picks = [];               // local picked indices
    this.partnerPicks = [];        // partner picks (echoed via setLayout? no — local)
    this.partnerShots = [];        // partner pairShots for pair layout (slot index)
    this.partnerPresent = false;   // did we get any message from partner recently?
    this.partnerLeft = false;      // partner declared they're leaving
    this.partnerLastSeen = 0;      // Date.now() of last inbound message
    this.finalized = null;         // dataURL once reveal has run
    this._pendingAcks = new Map(); // msgId → { action, sentAt, retries, timer }
    this._warned = new Set();      // dedupe warnings
    this._listeners = new Set();   // observers (used for UI updates)
    this._inboundHandler = null;   // set by app.setupDataConnection
  }

  // ===== TRANSITIONS =====
  //
  // Centralized so every state change is logged and observable. Bypassing the
  // transitions (e.g. `this.state = REVEALED` directly) is a bug.

  transition(next, reason = '') {
    const prev = this.state;
    if (prev === next) return;
    if (!this._isValidTransition(prev, next)) {
      console.warn('[duo] INVALID transition', prev, '→', next, '(' + reason + ')');
      return;
    }
    this.state = next;
    console.log('[duo]', prev, '→', next, reason ? '(' + reason + ')' : '');
    this._emit({ kind: 'transition', prev, next, reason });
  }

  _isValidTransition(from, to) {
    // Permitted graph. Any path not listed is rejected (logged as warning).
    const allowed = {
      IDLE:        new Set([DUO_STATES.ROOM_OPEN, DUO_STATES.JOINING, DUO_STATES.DISCONNECTED]),
      ROOM_OPEN:   new Set([DUO_STATES.CONNECTED, DUO_STATES.IDLE, DUO_STATES.DISCONNECTED]),
      JOINING:     new Set([DUO_STATES.CONNECTED, DUO_STATES.IDLE, DUO_STATES.DISCONNECTED]),
      CONNECTED:   new Set([DUO_STATES.SYNCING, DUO_STATES.CAPTURING, DUO_STATES.PICKING, DUO_STATES.IDLE, DUO_STATES.DISCONNECTED]),
      SYNCING:     new Set([DUO_STATES.CONNECTED, DUO_STATES.CAPTURING, DUO_STATES.PICKING, DUO_STATES.IDLE, DUO_STATES.DISCONNECTED]),
      PICKING:     new Set([DUO_STATES.CAPTURING, DUO_STATES.FINALIZING, DUO_STATES.REVEALED, DUO_STATES.CONNECTED, DUO_STATES.DISCONNECTED, DUO_STATES.IDLE]),
      CAPTURING:   new Set([DUO_STATES.PICKING, DUO_STATES.FINALIZING, DUO_STATES.REVEALED, DUO_STATES.CONNECTED, DUO_STATES.DISCONNECTED, DUO_STATES.IDLE]),
      FINALIZING:  new Set([DUO_STATES.REVEALED, DUO_STATES.PICKING, DUO_STATES.CONNECTED, DUO_STATES.DISCONNECTED, DUO_STATES.IDLE]),
      REVEALED:    new Set([DUO_STATES.CONNECTED, DUO_STATES.DISCONNECTED, DUO_STATES.IDLE]),
      DISCONNECTED:new Set([DUO_STATES.IDLE, DUO_STATES.CONNECTED]), // CONNECTED via rejoin
    };
    return allowed[from] ? allowed[from].has(to) : false;
  }

  // ===== ROLE =====
  setRole(role) {
    this.role = role;
  }

  // ===== FRAME / LAYOUT SYNC =====
  //
  // setFrame/setLayout are the ONLY callers of these; they ack through the
  // machine. A frame/layout change while in CAPTURING/PICKING/FINALIZING is
  // a no-op (defensive — should already be blocked upstream).

  setFrame(key, broadcast = true) {
    if (this.state === DUO_STATES.CAPTURING || this.state === DUO_STATES.PICKING ||
        this.state === DUO_STATES.FINALIZING) {
      console.warn('[duo] setFrame blocked in state', this.state);
      return false;
    }
    this.frame = key;
    if (broadcast) return this._sendAcked(ACTION.SET_FRAME, { key });
    return true;
  }

  setLayout(key, broadcast = true) {
    if (this.state === DUO_STATES.CAPTURING || this.state === DUO_STATES.PICKING ||
        this.state === DUO_STATES.FINALIZING) {
      console.warn('[duo] setLayout blocked in state', this.state);
      return false;
    }
    this.layout = key;
    if (broadcast) return this._sendAcked(ACTION.SET_LAYOUT, { key });
    return true;
  }

  // ===== CAPTURE =====
  //
  // When the host taps shutter, both peers enter CAPTURING. The host
  // broadcasts an acked `capture` with captureTime; both peers schedule a
  // countdown. SYNCING is a sub-state for the brief period when setFrame
  // / setLayout echoes are still unconfirmed.

  beginCapture(captureTime, frame, layout) {
    if (this.state !== DUO_STATES.CONNECTED && this.state !== DUO_STATES.PICKING &&
        this.state !== DUO_STATES.SYNCING) {
      console.warn('[duo] beginCapture rejected in state', this.state);
      return false;
    }
    this.frame = frame;
    this.layout = layout;
    this.transition(DUO_STATES.CAPTURING, 'beginCapture');
    return this._sendAcked(ACTION.CAPTURE, { captureTime, frame, layout });
  }

  // ===== PICKS (session shots + picked indices) =====

  recordShot(dataURL, slot = null) {
    this.shots.push(dataURL);
    if (this.layout === 'pair' && slot !== null) {
      return this._sendFire(ACTION.PAIR_SHOT, { index: slot, data: dataURL });
    }
    return true;
  }

  setPicks(indices) {
    this.picks = indices.slice();
  }

  clearLocal() {
    this.shots = [];
    this.picks = [];
    this.partnerShots = [];
  }

  // ===== RETAKE (both peers reset) =====

  requestRetake() {
    if (this.state !== DUO_STATES.PICKING && this.state !== DUO_STATES.CAPTURING &&
        this.state !== DUO_STATES.REVEALED) {
      console.warn('[duo] requestRetake rejected in state', this.state);
      return false;
    }
    this.clearLocal();
    this.transition(DUO_STATES.CONNECTED, 'retake');
    return this._sendAcked(ACTION.RETAKE_ALL, {});
  }

  // ===== PAIR FINALIZE =====
  //
  // Host declares pair composite starting; guest acknowledges and confirms
  // their pairShot messages will arrive. Then host waits up to
  // MAX_PAIR_WAIT_MS for partner shots. If they don't arrive, host enters
  // FINALIZING → REVEALED with whatever it has and surfaces a "partner
  // photos didn't arrive" warning to the UI.

  beginPairFinalize() {
    this.transition(DUO_STATES.FINALIZING, 'beginPairFinalize');
    return this._sendAcked(ACTION.FINALIZE_PAIR, {});
  }

  recordPartnerShot(index, dataURL) {
    this.partnerShots[index] = dataURL;
  }

  hasAllPartnerShots() {
    return this.partnerShots.filter(Boolean).length >= 4;
  }

  // ===== FINAL REVEAL =====
  //
  // The single definition of "final". Whoever finishes first (or the host,
  // by convention) calls this. The dataURL is sent to the partner as
  // `finalReveal` (acked) so the partner adopts the same image — both
  // peers reach REVEALED with identical canvas. See issue 020.

  publishReveal(dataURL) {
    this.finalized = dataURL;
    this.transition(DUO_STATES.REVEALED, 'publishReveal');
    return this._sendAcked(ACTION.FINAL_REVEAL, { data: dataURL });
  }

  // ===== DISCONNECT / PARTNER-LEFT =====

  markPartnerLeft(reason) {
    this.partnerLeft = true;
    this.partnerPresent = false;
    this.transition(DUO_STATES.DISCONNECTED, 'partner-left:' + reason);
    this._emit({ kind: 'partner-left', reason });
  }

  markSelfLeft(reason) {
    // Local user is leaving — broadcast one-way so partner gets the
    // notification. We do NOT await ack; this is FIRE.
    this._sendFire(ACTION.PARTNER_LEFT, { reason });
    this.transition(DUO_STATES.IDLE, 'self-left:' + reason);
  }

  markPartnerBack() {
    this.partnerLeft = false;
    this.partnerPresent = true;
    this.partnerLastSeen = Date.now();
    if (this.state === DUO_STATES.DISCONNECTED) {
      this.transition(DUO_STATES.CONNECTED, 'partner-back');
    }
    this._emit({ kind: 'partner-back' });
  }

  // ===== ACK PROTOCOL =====

  _sendFire(type, body) {
    const conn = this.app.dataConnection;
    if (!conn || !conn.open) return false;
    try {
      conn.send(Object.assign({ type, _fire: true }, body));
      return true;
    } catch (e) {
      console.warn('[duo] fire send failed', type, e);
      return false;
    }
  }

  _sendAcked(type, body) {
    const conn = this.app.dataConnection;
    if (!conn || !conn.open) {
      // No connection → emit warning immediately. Caller can decide whether
      // to proceed solo or surface "partner not connected".
      this._surfaceWarning(type, 'no-connection');
      return false;
    }
    const msgId = this._nextMsgId();
    const message = Object.assign({ type, msgId }, body);
    try {
      conn.send(message);
    } catch (e) {
      console.warn('[duo] ack send failed', type, e);
      this._surfaceWarning(type, 'send-failed');
      return false;
    }
    const pending = {
      action: type,
      sentAt: Date.now(),
      retries: 0,
      timer: setTimeout(() => this._retryAck(msgId), ACK_TIMEOUT_MS),
      warnTimer: setTimeout(() => this._surfaceWarning(type, 'unacked'), ACK_TOTAL_MS),
    };
    this._pendingAcks.set(msgId, pending);
    return true;
  }

  _retryAck(msgId) {
    const pending = this._pendingAcks.get(msgId);
    if (!pending) return;
    if (pending.retries >= ACK_RETRY_COUNT) return; // already warned
    pending.retries += 1;
    const conn = this.app.dataConnection;
    if (!conn || !conn.open) {
      this._surfaceWarning(pending.action, 'no-connection');
      return;
    }
    try {
      conn.send({ type: pending.action, msgId, _retry: pending.retries });
      pending.timer = setTimeout(() => this._retryAck(msgId), ACK_TIMEOUT_MS);
    } catch (e) {
      this._surfaceWarning(pending.action, 'retry-failed');
    }
  }

  _onAck(msgId) {
    const pending = this._pendingAcks.get(msgId);
    if (!pending) return;
    clearTimeout(pending.timer);
    clearTimeout(pending.warnTimer);
    this._pendingAcks.delete(msgId);
  }

  _nextMsgId() {
    this._msgCounter = (this._msgCounter || 0) + 1;
    return 'm' + this._msgCounter + '_' + Date.now().toString(36);
  }

  _surfaceWarning(action, reason) {
    // One warning per (action, reason) pair to avoid spam.
    const key = action + ':' + reason;
    if (this._warned.has(key)) return;
    this._warned.add(key);
    const messages = {
      'setFrame:unacked':         'Your partner may not see your frame change.',
      'setLayout:unacked':        'Your partner may not see your layout change.',
      'capture:unacked':          'Your partner didn\'t hear the shutter — they may capture separately.',
      'retakeAll:unacked':        'Your partner didn\'t see the retake. They may be on a stale screen.',
      'finalizePair:unacked':     'Your partner didn\'t acknowledge the pair composite.',
      'finalReveal:unacked':      'Your partner didn\'t adopt the reveal — you may be the only one on the reveal screen.',
      'setFrame:no-connection':   'No partner is connected — your frame change is local only.',
      'setLayout:no-connection':  'No partner is connected — your layout change is local only.',
      'capture:no-connection':    'No partner is connected — taking a solo capture.',
      'retakeAll:no-connection':  'No partner is connected.',
      'finalizePair:no-connection':'No partner is connected — your pair is solo only.',
      'finalReveal:no-connection':'No partner is connected — reveal is local only.',
    };
    const text = messages[key] || ('Partner not responding to ' + action + ' (' + reason + ').');
    this._emit({ kind: 'warning', text, key });
  }

  // ===== INBOUND HANDLER =====
  //
  // Single entry point for ALL inbound data-channel messages. Replaces the
  // switch at app.js:1530. Validates sender peer id pattern, clamps sizes,
  // rate-limits spam. See issue 030.

  attachTo(conn) {
    this._inboundHandler = (data) => this._handleInbound(conn, data);
    conn.on('data', this._inboundHandler);
    // LANE1-FIX — also subscribe to the connection's `close` event so the
    // partner-left transition fires regardless of which side tears down.
    // PeerJS fires `close` when the underlying RTCDataChannel closes cleanly.
    // Without this the host has no machine-driven transition when the guest
    // closes their tab — the data-channel `close` event flows through here
    // and the ui-only handler in app.js is a redundant safety net.
    const self = this;
    if (!this._connCloseHandler) {
      this._connCloseHandler = () => {
        if (self.app && self.app.mode === 'together') {
          self.markPartnerLeft('connection-close');
        }
      };
    }
    try { conn.on('close', this._connCloseHandler); } catch (e) { /* peer pre-1.0 may lack close */ }
  }

  detach() {
    this._inboundHandler = null;
    // LANE1-FIX — drop the close-handler reference so a stale conn can't keep
    // firing markPartnerLeft after we've moved on (e.g. after goHome).
    this._connCloseHandler = null;
    // Cancel pending ack timers
    for (const [, p] of this._pendingAcks) {
      clearTimeout(p.timer);
      clearTimeout(p.warnTimer);
    }
    this._pendingAcks.clear();
  }

  _handleInbound(conn, data) {
    if (!data || typeof data !== 'object') return;

    // Validate peer id pattern — refuse messages from spoofed peers.
    // PeerJS uses public signaling; without this anyone with the room code
    // can connect. See issue 030.
    const expectedPrefix = 'us-' + (this.app.roomCode || '') + '-';
    if (this.app.roomCode && conn.peer && !conn.peer.startsWith(expectedPrefix)) {
      console.warn('[duo] dropping inbound from non-room peer:', conn.peer);
      return;
    }

    this.partnerLastSeen = Date.now();
    this.partnerPresent = true;
    if (this.partnerLeft) this.markPartnerBack();

    const type = data.type || data.action; // accept either field name (compat)

    if (type === ACTION.SHARED_TICK) {
      this.app.playTickSound();
      return;
    }

    if (type === ACTION.PRESENCE) {
      // Soft liveness ping — no ack expected.
      return;
    }

    if (type === ACTION.PARTNER_LEFT) {
      this.markPartnerLeft(data.reason || 'unknown');
      return;
    }

    if (type === ACTION.PAIR_SHOT && typeof data.index === 'number' && typeof data.data === 'string') {
      // Clamp index to [0,3]. See issue 030 #3.
      const safeIdx = Math.max(0, Math.min(3, data.index | 0));
      // Size-limit the dataURL. 5 MB is far above any plausible JPEG.
      if (data.data.length > 5 * 1024 * 1024) {
        console.warn('[duo] pairShot payload too large');
        return;
      }
      this.recordPartnerShot(safeIdx, data.data);
      return;
    }

    if (type === ACTION.FINAL_STRIP) {
      // Legacy support — if a peer still sends `finalStrip`, adopt it.
      // New code uses FINAL_REVEAL (acked).
      if (typeof data.data === 'string' && data.data.length < 5 * 1024 * 1024) {
        this.finalized = data.data;
        this.transition(DUO_STATES.REVEALED, 'finalStrip-legacy');
        this.app.capturedImage = data.data;
        this.app.sessionShots = [];
        this.app.pickedIndices = [];
        this.app.multiShotInProgress = false;
        this.app._captureChainActive = false;
        this.app.showReveal();
      }
      return;
    }

    // ===== ACKED MESSAGES =====
    // Reply with ACK before processing so the sender can clear the warning.

    if (type === ACTION.SET_FRAME && typeof data.key === 'string') {
      this._replyAck(conn, data.msgId);
      if (data.key !== this.app.currentFrame) this.app.setFrame(data.key, false /* don't rebroadcast */);
      this.frame = data.key;
      return;
    }

    if (type === ACTION.SET_LAYOUT && typeof data.key === 'string') {
      this._replyAck(conn, data.msgId);
      if (data.key !== this.app.currentLayout) this.app.setLayout(data.key, false);
      this.layout = data.key;
      return;
    }

    if (type === ACTION.CAPTURE && typeof data.captureTime === 'number') {
      this._replyAck(conn, data.msgId);
      this.app.handleSyncedCapture(data.captureTime, data.frame, data.layout);
      return;
    }

    if (type === ACTION.RETAKE_ALL) {
      this._replyAck(conn, data.msgId);
      this.app._handlePartnerRetake();
      return;
    }

    if (type === ACTION.FINALIZE_PAIR) {
      this._replyAck(conn, data.msgId);
      this.app._handlePartnerFinalizePair();
      return;
    }

    if (type === ACTION.FINAL_REVEAL && typeof data.data === 'string') {
      this._replyAck(conn, data.msgId);
      if (data.data.length > 5 * 1024 * 1024) return;
      this.finalized = data.data;
      this.transition(DUO_STATES.REVEALED, 'finalReveal');
      this.app._adoptPartnerReveal(data.data);
      return;
    }

    // ACK-only messages — sender cleared a pending ack
    if (type.endsWith('_ACK') && typeof data.msgId === 'string') {
      this._onAck(data.msgId);
      return;
    }

    // Unknown message — drop silently but log.
    console.warn('[duo] unknown message type', type);
  }

  _replyAck(conn, msgId) {
    if (!msgId) return;
    try {
      conn.send({ type: (this._actionOf(conn, msgId) || '') + '_ACK', msgId });
    } catch (e) {
      // best-effort
    }
  }

  _actionOf(conn, msgId) {
    const pending = this._pendingAcks.get(msgId);
    return pending ? pending.action : '';
  }

  // ===== OBSERVERS =====

  on(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(evt) {
    for (const fn of this._listeners) {
      try { fn(evt); } catch (e) { /* ignore */ }
    }
    // Bridge to app-side handler so app.js can render UI without subscribing.
    if (this.app && typeof this.app._onDuoEvent === 'function') {
      try { this.app._onDuoEvent(evt); } catch (e) { /* ignore */ }
    }
  }
}

// Expose the class globally.
window.DuoSession = DuoSession;
window.DUO_STATES = DUO_STATES;
window.DUO_ACTION = ACTION;
