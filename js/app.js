// ===== us — Dual-Camera Photobooth =====
// "two places, one frame."  v3: sticker machine design system,
// pick-your-best-four flow, monthly drop screen, 7 themes.

const app = {
  // State
  mode: null,        // 'solo' | 'together'
  localStream: null,
  remoteStream: null,
  peer: null,
  peerConnection: null,
  dataConnection: null,
  roomCode: null,
  isHost: false,
  facingMode: 'user',

  // Current settings
  currentFilter: 'none',
  currentFrame: 'nx-pooh',
  currentLayout: 'single',
  multiShots: [],        // accumulated captures for multi-shot layouts
  multiShotInProgress: false,
  multiShotCancelled: false,

  // PICK-YOUR-BEST-FOUR (v3) — all captures this session, picked indices
  sessionShots: [],
  pickedIndices: [],

  // MONTHLY DROP (v3) — the currently featured frame + meta
  dropFrameKey: null,

  // Capture
  capturedImage: null,    // dataURL of last composited photo
  gallery: [],

  // DUO SESSION (single source of truth — see js/duo-state.js)
  duo: null,              // DuoSession instance
  // Local mirror of duo fields (kept in sync via _syncDuoMirror()).
  // Issue 020: finalStrip adoption must work BOTH directions; the duo
  // machine is the arbiter. App-side fields are downstream.
  _partnerLeftBanner: false,
  _pairProgress: null,    // { received, expected } when in pair finalize

  // Canvas
  canvas: null,
  ctx: null,

  // ===== INIT =====
  init() {
    // Build the duo session machine FIRST so any subsequent method can route
    // through it (issues 001, 003, 005, 008, 009, 014, 017, 020, 023, 025,
    // 030, 032, 041).
    this.duo = new DuoSession(this);
    this.duo.on((evt) => this._onDuoEvent(evt));

    this.canvas = document.getElementById('composite-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.loadGallery();
    this.buildFilterChips();
    this.theme = 'honey';
    try {
      const stored = localStorage.getItem('us_theme');
      // Migrate old "studio" → "honey"; keep any other theme the user picked
      this.theme = (stored === 'studio' || stored === 'machine' || stored === 'camera') ? 'honey' : (stored || 'honey');
    } catch(e) {}
    this.setTheme(this.theme);
    this.buildFrameChips();
    this.buildLayoutChips();
    this.loadGalleryPreview();
    this.computeMonthlyDrop();
    this.maybeShowDropBadge();
    // nx- frames register async (templates.json) — recompute the drop once they exist
    const dropPoll = setInterval(() => {
      const nx = (typeof FRAMES !== 'undefined') ? Object.keys(FRAMES).filter(k => k.startsWith('nx-')) : [];
      if (nx.length > 0) { this.computeMonthlyDrop(); clearInterval(dropPoll); }
    }, 500);
    setTimeout(() => clearInterval(dropPoll), 10000);

    // Preload sticker images for frames
    if (typeof preloadStickers !== 'undefined') {
      preloadStickers();
    }

    // Both video halves start as "empty" — the camera start clears local,
    // the remote stream arrival clears remote.
    const localHalf = document.querySelector('.video-half.local');
    const remoteHalf = document.getElementById('remote-half');
    if (localHalf) localHalf.dataset.empty = '1';
    if (remoteHalf) remoteHalf.dataset.empty = '1';

    // Check URL for room code
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      this.roomCode = code.toUpperCase();
      this.startTogether(true);
    }

    // Listen for layout-chip re-render requests from the duo machine (e.g.
    // when the partner comes back from a disconnect and we need to refresh).
    if (this.duo) {
      this.duo.on((evt) => {
        if (evt.kind === 'transition' && evt.next === DUO_STATES.CONNECTED) {
          this.buildLayoutChips();
        }
      });
    }
  },

  async loadGalleryPreview() {
    const preview = document.getElementById('gallery-preview');
    if (!preview) return;

    let photos = [];

    if (this.gallery.length > 0) {
      photos = [...this.gallery.slice(0, 4)];
    }

    if (typeof storage !== 'undefined') {
      try {
        const cloud = await storage.listPhotos();
        cloud.slice(0, 4).forEach(cp => {
          if (photos.length < 4 && !photos.find(p => p.url === cp.url)) {
            photos.push(cp);
          }
        });
      } catch (e) { /* cloud unavailable, local only */ }
    }

    if (photos.length === 0) return;

    preview.innerHTML = '';
    photos.forEach(item => {
      const img = document.createElement('img');
      img.src = item.url;
      img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border:2px solid var(--ink);box-shadow:0 3px 0 var(--ink-sh);cursor:pointer';
      img.onclick = () => app.openGallery();
      img.onerror = () => { img.style.display = 'none'; };
      preview.appendChild(img);
    });
  },

  // ===== SCREEN MANAGEMENT =====
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  },

  // ===== MONTHLY DROP (v3) =====
  computeMonthlyDrop() {
    // Deterministic: hash YYYY-MM over the nx frame keys
    const allFrames = (typeof FRAMES !== 'undefined') ? Object.keys(FRAMES) : [];
    const nxKeys = allFrames.filter(k => k.startsWith('nx-'));
    if (nxKeys.length === 0) { this.dropFrameKey = 'nx-puccap'; return; }

    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let h = 0;
    for (let i = 0; i < ym.length; i++) {
      h = ((h << 5) - h) + ym.charCodeAt(i);
      h |= 0;
    }
    const idx = Math.abs(h) % nxKeys.length;
    this.dropFrameKey = nxKeys[idx];
    this.dropIndex = idx + 1;
    this.dropTotal = nxKeys.length;
  },

  maybeShowDropBadge() {
    try {
      if (localStorage.getItem('us_drop_dismissed') === '1') return;
    } catch(e) {}
    const badge = document.getElementById('drop-badge');
    if (badge) badge.style.display = 'inline-flex';
  },

  dismissDropBadge() {
    try { localStorage.setItem('us_drop_dismissed', '1'); } catch(e) {}
    const badge = document.getElementById('drop-badge');
    if (badge) badge.style.display = 'none';
  },

  openDrop() {
    // nx- frames register when templates.json arrives (after init) — recompute if needed
    if (!this.dropFrameKey || this.dropIndex == null || this.dropTotal == null) this.computeMonthlyDrop();
    const img = document.getElementById('drop-img');
    if (img && typeof FramesNext !== 'undefined') {
      // Use the template strip png as the feature image — looks like a real strip
      const url = FramesNext.thumbURL(this.dropFrameKey, this.currentLayout);
      img.src = url || '';
    }
    // Counter
    const c = document.getElementById('drop-counter');
    if (c) {
      const pad = n => String(n).padStart(2, '0');
      c.textContent = `${pad(this.dropIndex)} / ${pad(this.dropTotal)}`;
    }
    // Meta: frame name + Caveat subtitle pulled from FRAMES
    const fdef = (typeof FRAMES !== 'undefined') ? FRAMES[this.dropFrameKey] : null;
    const nameEl = document.getElementById('drop-name');
    const subEl = document.getElementById('drop-sub');
    const floatBadge = document.getElementById('drop-badge-floating');
    if (nameEl) nameEl.textContent = fdef ? fdef.name : 'this month';
    if (subEl) subEl.textContent = 'a fresh frame for ' + (new Date()).toLocaleString('en-US', { month: 'long' }).toLowerCase();
    if (floatBadge) {
      const month = (new Date()).toLocaleString('en-US', { month: 'short' }).toUpperCase();
      floatBadge.textContent = `NEW DROP · ${month} ✦`;
    }
    this.showScreen('drop-screen');
  },

  async useDropFrame() {
    if (!this.dropFrameKey) this.computeMonthlyDrop();
    this.currentFrame = this.dropFrameKey;
    this.applyPreviewAspect();
    this.updateFrameOverlay();
    // Issue 008 — drop-frame was silently orphaning the partner. If we're
    // currently in a together-mode room, the drop-frame button cannot just
    // flip us to solo: the partner stays CONNECTED and keeps sending
    // setFrame/setLayout into a ghost receiver. The fix: tear down the peer
    // connection FIRST (broadcasting partnerLeft so the partner gets a
    // visible "partner left" state with a rejoin affordance), THEN start
    // solo. The duo state machine owns the transition.
    if (this.mode === 'together' && this.duo) {
      this.duo.markSelfLeft('drop-frame');
      this.cleanupPeer();
    } else if (this.dataConnection && this.dataConnection.open) {
      // Defensive — even if mode isn't 'together', if a connection is open
      // we still tear it down rather than orphaning the partner.
      try { this.dataConnection.send({ action: 'partnerLeft', reason: 'drop-frame' }); } catch(e) {}
      this.cleanupPeer();
    }
    this.startSolo();
  },

  // ===== PICK-YOUR-BEST-FOUR (v3) =====
  shotsNeededForLayout(layoutKey) {
    // 2x the slots for multi-shot layouts, so the user can pick the best ones.
    // Single-shot layouts skip the pick screen.
    //
    // Pair layout is special: each user fills ONLY their own half. The
    // partner's half comes in via pairShot messages. So the local chain
    // stops at `layout.shots` (one user's share), not `layout.shots * 2`.
    // See issue 041.
    const layout = (typeof LAYOUTS !== 'undefined') ? LAYOUTS[layoutKey] : null;
    if (!layout || layout.shots <= 1) return 1;
    if (layout.pair) return layout.shots;
    return layout.shots * 2;
  },

  openPickScreen() {
    const grid = document.getElementById('pick-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this.pickedIndices = [];
    const total = (typeof LAYOUTS !== 'undefined') ? (LAYOUTS[this.currentLayout] ? LAYOUTS[this.currentLayout].shots : 4) : 4;

    this.sessionShots.forEach((dataURL, idx) => {
      const cell = document.createElement('div');
      cell.className = 'pick-cell';
      cell.dataset.idx = idx;
      cell.innerHTML = `<img src="${dataURL}" alt="shot ${idx}"><div class="ord">${String(idx).padStart(2, '0')}</div>`;
      cell.onclick = () => this.togglePick(idx);
      grid.appendChild(cell);
    });

    this.updatePickCount(total);
    this.showScreen('pick-screen');
  },

  togglePick(idx) {
    const total = (typeof LAYOUTS !== 'undefined') ? (LAYOUTS[this.currentLayout] ? LAYOUTS[this.currentLayout].shots : 4) : 4;
    const i = this.pickedIndices.indexOf(idx);
    if (i >= 0) {
      this.pickedIndices.splice(i, 1);
    } else {
      if (this.pickedIndices.length >= total) {
        // tap on a non-picked cell while full → swap oldest for this one
        this.pickedIndices.shift();
      }
      this.pickedIndices.push(idx);
    }
    // re-render cells
    const cells = document.querySelectorAll('#pick-grid .pick-cell');
    cells.forEach(c => {
      const ci = parseInt(c.dataset.idx, 10);
      const ord = this.pickedIndices.indexOf(ci);
      const sel = ord >= 0;
      c.classList.toggle('selected', sel);
      // wipe + set new contents
      c.innerHTML = `<img src="${this.sessionShots[ci]}" alt="shot ${ci}"><div class="ord">${String(ci).padStart(2, '0')}</div>`;
      if (sel) {
        const check = document.createElement('div');
        check.className = 'check';
        check.textContent = '✓' + String(ord + 1);
        c.appendChild(check);
      }
    });
    this.updatePickCount(total);
  },

  updatePickCount(total) {
    const n = this.pickedIndices.length;
    const cnt = document.getElementById('pick-count');
    if (cnt) {
      cnt.textContent = `${n} / ${total}`;
      cnt.classList.toggle('acc-bg', n > 0);
    }
    const print = document.getElementById('print-btn');
    if (print) print.disabled = n !== total;
  },

  pickRetake() {
    // v1 simplification: retake the WHOLE session (per-slot retake is a v2 feature).
    //
    // Issue 023 — In together mode this MUST sync to partner. The duo state
    // machine routes the request through an acked `retakeAll` message. Both
    // peers reset and return to STAGE together, preserving `sessionShots` per
    // the existing `capture(fromChain)` chain token (we don't touch
    // `_captureChainActive` — this is a UI reset only).
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.multiShotCancelled = false;
    if (this.duo) this.duo.clearLocal();
    if (this.mode === 'together' && this.duo) {
      this.duo.requestRetake();
    }
    this.showScreen('stage');
    setTimeout(() => this.initFrameOverlay(), 100);
  },

  async pickPrint() {
    const total = (typeof LAYOUTS !== 'undefined') ? (LAYOUTS[this.currentLayout] ? LAYOUTS[this.currentLayout].shots : 4) : 4;
    if (this.pickedIndices.length !== total) return;

    // Order multiShots by tap order so the composite reflects picks left-to-right / top-to-bottom
    const ordered = this.pickedIndices.map(i => this.sessionShots[i]);
    this.multiShots = ordered;

    // LANE1-FIX — print → FINALIZING. Together mode: enter FINALIZING before
    // the composite runs so the machine reflects "strip in flight" state.
    // The pair path enters FINALIZING inside `finalizePairCapture` via
    // `beginPairFinalize()`. The non-pair path needs an explicit transition
    // here. `showReveal()` and `publishReveal()` both advance to REVEALED.
    if (this.mode === 'together' && this.duo && this.duo.state === DUO_STATES.PICKING) {
      this.duo.transition(DUO_STATES.FINALIZING, 'pickPrint');
    }

    // Issue 009 — wrap the composite in try/catch and ALWAYS reset state
    // in a finally block. A failed composite (corrupt dataURL, browser GC)
    // must not strand the user on the pick screen with no recovery.
    try {
      if (this.currentLayout === 'pair') {
        await this.finalizePairCapture();
      } else {
        await this.compositeMultiShot();
        // Issue 020 — final strip is owned by the duo machine. Whoever
        // finishes first publishes; both peers reach REVEALED with the
        // identical canvas. Non-pair layouts: only the HOST publishes
        // (lower peerId convention is unnecessary — host is authoritative).
        if (this.capturedImage) {
          if (this.mode === 'together' && this.isHost && this.duo) {
            this.duo.publishReveal(this.capturedImage);
            this.showReveal();  // host reveals locally too (issue 020 follow-up: publish ≠ show)
          } else {
            this.showReveal();
          }
        } else {
          this.showReveal();
        }
      }
    } catch (err) {
      console.error('[pickPrint] composite failed:', err);
      this._surfaceInlineError('we couldn\'t build your strip — try the retakes button');
      // Fall through to retake flow on next user action.
    } finally {
      // ALWAYS reset — see issue 009. The old code skipped this on throw.
      this.multiShots = [];
      this.sessionShots = [];
      this.pickedIndices = [];
      this.multiShotInProgress = false;
      this._captureChainActive = false;
    }
  },

  // ===== THEMES (7 sticker-machine themes) =====
  toggleThemeMenu() {
    const m = document.getElementById('theme-menu');
    const btn = document.getElementById('theme-btn');
    if (m) m.classList.toggle('open');
    if (btn) btn.setAttribute('aria-expanded', m && m.classList.contains('open') ? 'true' : 'false');
    document.querySelectorAll('#theme-menu button').forEach(b => {
      b.classList.toggle('active', b.dataset.themeSet === this.theme);
    });
  },

  setTheme(t) {
    this.theme = t;
    try { localStorage.setItem('us_theme', t); } catch(e) {}
    document.documentElement.setAttribute('data-theme', t);
    const m = document.getElementById('theme-menu');
    if (m) m.classList.remove('open');
  },

  goHome() {
    this.hideRoomPill();
    const tm = document.getElementById('theme-menu');
    if (tm) tm.classList.remove('open');
    this.stopFramePreview();
    const sheet = document.getElementById('frame-sheet');
    if (sheet) sheet.classList.remove('open');
    this.frameSheetOpen = false;
    // Issue 008 — broadcast partnerLeft BEFORE tearing down so the partner
    // gets a "partner left" state with a rejoin affordance instead of an
    // orphan connection. The duo machine owns the transition.
    if (this.mode === 'together' && this.duo && this.dataConnection && this.dataConnection.open) {
      this.duo.markSelfLeft('home');
    }
    this.stopCamera();
    this.cleanupPeer();
    this.multiShotCancelled = true;
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    if (this.duo) this.duo.clearLocal();
    this._hidePartnerLeftBanner();
    this.showScreen('landing');
    this.loadGalleryPreview();
    window.history.replaceState({}, '', window.location.pathname);
  },

  cleanupPeer() {
    // LANE1-FIX — stop the presence watchdog before tearing down the duo
    // machine, otherwise its interval keeps referencing this.duo after
    // we've moved on.
    this._stopPresenceWatchdog();
    if (this.duo) this.duo.detach();
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
  },

  // ===== MODE SELECTION =====
  startSolo() {
    this.mode = 'solo';
    this.hideRemote();
    this.startCamera().then(() => {
      this.showScreen('stage');
      setTimeout(() => this.initFrameOverlay(), 100);
    }).catch(() => {});
  },

  startTogether(joining = false) {
    this.mode = 'together';
    if (this.duo) this.duo.setRole(joining ? 'guest' : 'host');

    if (joining) {
      if (this.duo) this.duo.transition(DUO_STATES.JOINING, 'startTogether-join');
      this.showScreen('room');
      document.getElementById('room-title').textContent = 'Join Room';
      document.getElementById('room-create').style.display = 'none';
      document.getElementById('room-join').style.display = 'block';
      const input = document.getElementById('room-code-input');
      if (this.roomCode) input.value = this.roomCode;
      input.focus();
    } else {
      this.isHost = true;
      this.roomCode = this.generateRoomCode();
      if (this.duo) this.duo.transition(DUO_STATES.ROOM_OPEN, 'startTogether-host');
      this.showScreen('room');
      document.getElementById('room-title').textContent = 'Your Room';
      document.getElementById('room-create').style.display = 'block';
      document.getElementById('room-join').style.display = 'none';
      document.getElementById('room-code-display').textContent = this.roomCode;

      this.startCamera().then(() => {
        this.showScreen('stage');
        setTimeout(() => this.initFrameOverlay(), 100);
        this.showRoomPill('WAITING · CODE ' + this.roomCode);
        // Issue 001 — duo layout chips depend on this.mode === 'together'.
        // Rebuild now that the mode is set, so duo-strip / duo-grid / pair
        // appear when we arrive on stage.
        this.buildLayoutChips();
        this.initPeerJS();
      }).catch(() => {});
    }
  },

  // ===== CAMERA =====
  async startCamera() {
    const videoCfg = {
      facingMode: this.facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };
    try {
      const wantAudio = this.mode === 'together' && !this.micDenied;
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: videoCfg, audio: wantAudio });
      } catch (err) {
        if (wantAudio && err && (err.name === 'NotAllowedError' || err.name === 'NotFoundError' || err.name === 'NotReadableError' || err.name === 'OverconstrainedError')) {
          this.micDenied = true;
          this.localStream = await navigator.mediaDevices.getUserMedia({ video: videoCfg, audio: false });
        } else {
          throw err;
        }
      }
      const video = document.getElementById('local-video');
      video.srcObject = this.localStream;
      this.applyFilterToVideo();
      const localHalf = document.querySelector('.video-half.local');
      if (localHalf) localHalf.dataset.empty = '';
    } catch (err) {
      this.showCameraError(err && err.message ? err.message : String(err));
      throw err;
    }
  },

  showCameraError(detail) {
    let box = document.getElementById('camera-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'camera-error';
      box.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.94);display:flex;align-items:center;justify-content:center;padding:24px';
      box.innerHTML = `<div style="background:var(--paper);border:3px solid var(--ink);box-shadow:0 6px 0 var(--ink-sh);max-width:420px;width:100%;padding:28px 24px;text-align:center;border-radius:16px">
        <div style="font-family:'Fraunces',serif;font-size:26px;margin-bottom:6px">the camera said no</div>
        <div style="font-family:'Caveat',cursive;font-size:18px;color:var(--acc);margin-bottom:14px">it happens — let's try again</div>
        <div style="font-family:'Space Mono',monospace;font-size:11px;opacity:.6;margin-bottom:18px;word-break:break-word">Check your browser's camera permission for this site, then retry.</div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button id="cam-retry" class="k p">RETRY</button>
          <button id="cam-back" class="k w">BACK</button>
        </div></div>`;
      document.body.appendChild(box);
      box.querySelector('#cam-retry').onclick = () => { box.remove(); this.startCamera().catch(() => {}); };
      box.querySelector('#cam-back').onclick = () => { box.remove(); this.showScreen('landing'); };
    }
  },

  stopCamera() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    const video = document.getElementById('local-video');
    if (video) video.srcObject = null;
  },

  get mirrored() { return this._mirrored !== undefined ? this._mirrored : true; },
  set mirrored(v) { this._mirrored = v; },

  showRoomPill(label, paired = false) {
    let pill = document.getElementById('room-pill');
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'room-pill';
      pill.onclick = () => this.copyRoomCode();
      const tb = document.querySelector('.stage-topbar-left');
      if (tb) tb.appendChild(pill);
    }
    pill.style.display = '';
    pill.textContent = label;
    pill.classList.toggle('paired', paired);
  },

  hideRoomPill() {
    const pill = document.getElementById('room-pill');
    if (pill) pill.style.display = 'none';
  },

  toggleMirror() {
    this.mirrored = !this.mirrored;
    const v = document.getElementById('local-video');
    if (v) v.style.transform = this.mirrored ? 'scaleX(-1)' : 'scaleX(1)';
    const btn = document.getElementById('mirror-btn');
    if (btn) btn.classList.toggle('active', this.mirrored);
    this.mirrorCaptures = this.mirrored;
  },

  async switchCamera() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.localStream) {
      this.stopCamera();
      await this.startCamera();
      if (this.peerConnection && this.mode === 'together') {
        const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && this.localStream) {
          const newTrack = this.localStream.getVideoTracks()[0];
          if (newTrack) {
            try { await sender.replaceTrack(newTrack); } catch(e) {}
          }
        }
      }
    }
  },

  hideRemote() {
    const rh = document.getElementById('remote-half');
    const vd = document.getElementById('video-divider');
    if (rh) { rh.style.display = 'none'; rh.dataset.empty = '1'; }
    if (vd) vd.style.display = 'none';
  },

  showRemote() {
    const rh = document.getElementById('remote-half');
    const vd = document.getElementById('video-divider');
    if (rh) { rh.style.display = 'block'; rh.dataset.empty = ''; }
    if (vd) vd.style.display = 'block';
  },

  // ===== FILTERS UI =====
  buildFilterChips() {
    const row = document.getElementById('filter-row');
    if (!row) return;
    row.innerHTML = '';
    for (const [key, f] of Object.entries(FILTERS)) {
      const chip = document.createElement('button');
      chip.className = 'filter-chip chip' + (key === this.currentFilter ? ' active' : '');
      chip.textContent = f.name;
      chip.dataset.filter = key;
      chip.onclick = () => this.setFilter(key);
      row.appendChild(chip);
    }
  },

  setFilter(key) {
    this.currentFilter = key;
    this.applyFilterToVideo();
    document.querySelectorAll('.filter-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.filter === key);
    });
  },

  applyFilterToVideo() {
    const video = document.getElementById('local-video');
    const f = FILTERS[this.currentFilter];
    if (f && video) {
      video.style.filter = f.css;
      const remote = document.getElementById('remote-video');
      if (remote) remote.style.filter = f.css;
    }
  },

  // ===== FRAMES UI =====
  buildFrameChips() {
    const row = document.getElementById('frame-row');
    if (!row) return;
    row.innerHTML = '';
    for (const [key, f] of Object.entries(FRAMES)) {
      if (key !== 'none' && !f.framesNext) continue;
      const chip = document.createElement('button');
      chip.className = 'frame-chip chip' + (key === this.currentFrame ? ' active' : '');
      chip.textContent = f.name;
      chip.dataset.frame = key;
      chip.onclick = () => this.setFrame(key);
      row.appendChild(chip);
    }
  },

  showFiltersInSheet() {
    const ft = document.getElementById('filter-thumbnails');
    const th = document.getElementById('frame-thumbnails');
    if (!ft) return;
    th.style.display = 'none';
    ft.style.display = 'flex';
    ft.innerHTML = '';
    document.querySelectorAll('#frame-categories .frame-cat-btn').forEach(b => {
      b.style.background = b.id === 'filters-tab' ? 'var(--ink)' : 'var(--paper)';
      b.style.color = b.id === 'filters-tab' ? 'var(--paper)' : 'var(--ink)';
    });
    for (const [key, f] of Object.entries(FILTERS)) {
      const chip = document.createElement('button');
      chip.className = 'frame-chip chip';
      chip.textContent = f.name || key;
      if (key === this.currentFilter) chip.classList.add('active');
      chip.onclick = () => { this.setFilter(key); this.showFiltersInSheet(); };
      ft.appendChild(chip);
    }
  },

  setFrame(key, broadcast = true) {
    if (this.multiShotInProgress && this._captureChainActive) return;
    this.currentFrame = key;
    this.applyPreviewAspect();
    this.updateFrameOverlay();
    // Route through the duo machine (acked) — see issue 030. The `broadcast`
    // flag is set to false when applying a partner-initiated change to avoid
    // an echo loop.
    if (broadcast && this.mode === 'together' && this.duo) {
      this.duo.setFrame(key);
    } else if (broadcast && this.dataConnection && this.dataConnection.open) {
      // Pre-machine fallback for solo callers that still want to mirror.
      try { this.dataConnection.send({ type: 'setFrame', key }); } catch(e) {}
    }
    document.querySelectorAll('.frame-thumb').forEach(t => {
      t.classList.toggle('active', t.dataset.frame === key);
    });
  },

  // ===== FRAME PREVIEW OVERLAY =====
  frameOverlayCanvas: null,
  frameOverlayCtx: null,
  framePreviewLoop: null,

  initFrameOverlay() {
    this.frameOverlayCanvas = document.getElementById('frame-overlay');
    if (!this.frameOverlayCanvas) return;
    this.frameOverlayCtx = this.frameOverlayCanvas.getContext('2d');
    this.startFramePreview();
  },

  startFramePreview() {
    if (this.framePreviewLoop) cancelAnimationFrame(this.framePreviewLoop);

    const tick = () => {
      this.drawFrameOverlay();
      this.framePreviewLoop = requestAnimationFrame(tick);
    };
    tick();
  },

  stopFramePreview() {
    if (this.framePreviewLoop) {
      cancelAnimationFrame(this.framePreviewLoop);
      this.framePreviewLoop = null;
    }
    if (this.frameOverlayCtx) {
      this.frameOverlayCtx.clearRect(0, 0, this.frameOverlayCanvas.width, this.frameOverlayCanvas.height);
    }
  },

  drawFrameOverlay() {
    if (!this.frameOverlayCanvas || !this.frameOverlayCtx) return;
    const container = document.getElementById('video-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (this.frameOverlayCanvas.width !== rect.width * dpr || this.frameOverlayCanvas.height !== rect.height * dpr) {
      this.frameOverlayCanvas.width = rect.width * dpr;
      this.frameOverlayCanvas.height = rect.height * dpr;
      this.frameOverlayCanvas.style.width = rect.width + 'px';
      this.frameOverlayCanvas.style.height = rect.height + 'px';
    }

    const ctx = this.frameOverlayCtx;
    const w = this.frameOverlayCanvas.width;
    const h = this.frameOverlayCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const frameDef = FRAMES[this.currentFrame];
    if (frameDef && frameDef.framesNext) {
      ctx.save();
      if (this.frameSheetOpen) ctx.globalAlpha = 0.55;
      try {
        FramesNext.drawLivePreview(ctx, w, h, this.currentFrame.replace('nx-',''), this.currentLayout,
                                   document.getElementById('local-video'), this._fmtPrevDate(),
                                   this.multiShots || [], (this.multiShots || []).length);
      } catch (e) { /* preview is best-effort */ }
      ctx.restore();
    } else if (frameDef && this.currentFrame !== 'none') {
      ctx.save();
      if (this.frameSheetOpen) ctx.globalAlpha = 0.5;
      frameDef.draw(ctx, w, h);
      ctx.restore();
    }
  },

  applyPreviewAspect() {
    const vc = document.getElementById('video-container');
    if (!vc) return;
    const t = (this.currentFrame || '').startsWith('nx-') ? FramesNext.get(this.currentFrame.replace('nx-','')) : null;
    const lk = FramesNext.layoutKey(this.currentLayout);
    let ar;
    if (t && lk && t.layouts[lk]) {
      ar = (t.layouts[lk].w / t.layouts[lk].h).toFixed(4);
    } else if (this.currentLayout === 'strip-4') {
      ar = '0.3333';
    } else {
      ar = '0.78';
    }
    vc.style.aspectRatio = ar;
    if (parseFloat(ar) < 0.5) {
      vc.style.maxHeight = '100%';
      vc.style.width = 'auto';
      vc.style.maxWidth = '100%';
    } else {
      vc.style.maxHeight = '';
      vc.style.width = '';
      vc.style.maxWidth = '';
    }
  },

  _fmtPrevDate() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  },

  updateFrameOverlay() {
    this.drawFrameOverlay();
  },

  // ===== FRAME PICKER BOTTOM SHEET =====
  frameSheetOpen: false,
  frameCategory: 'all',

  toggleFrameSheet() {
    const sheet = document.getElementById('frame-sheet');
    if (!sheet) return;

    this.frameSheetOpen = !this.frameSheetOpen;
    sheet.classList.toggle('open', this.frameSheetOpen);
    if (this.frameSheetOpen) {
      this.setFrameCategory('casts');
      this.buildFrameThumbnails();
    }
    this.drawFrameOverlay();
  },

  buildFrameThumbnails() {
    const container = document.getElementById('frame-thumbnails');
    if (!container) return;
    container.innerHTML = '';

    const ordered = Object.entries(FRAMES).sort((a, b) =>
      (b[1].framesNext ? 1 : 0) - (a[1].framesNext ? 1 : 0));
    for (const [key, frame] of ordered) {
      if (key !== 'none' && !frame.framesNext) continue;
      if (this.frameCategory !== 'all' && frame.category && frame.category !== this.frameCategory) continue;

      const thumb = document.createElement('div');
      thumb.className = 'frame-thumb' + (key === this.currentFrame ? ' active' : '');
      thumb.dataset.frame = key;

      const mini = document.createElement('canvas');
      mini.width = 108;
      mini.height = 144;
      mini.style.cssText = 'width:100%;height:100%;display:block';
      const mctx = mini.getContext('2d');

      const grad = mctx.createLinearGradient(0, 0, 108, 144);
      grad.addColorStop(0, '#E8C4A0');
      grad.addColorStop(0.5, '#D4A080');
      grad.addColorStop(1, '#A07050');
      mctx.fillStyle = grad;
      mctx.fillRect(0, 0, 108, 144);

      mctx.fillStyle = 'rgba(255,220,180,0.7)';
      mctx.beginPath();
      mctx.arc(54, 55, 22, 0, Math.PI * 2);
      mctx.fill();
      mctx.fillRect(34, 75, 40, 50);

      if (frame.framesNext && typeof FramesNext !== 'undefined') {
        const url = FramesNext.thumbURL(key, app.currentLayout);
        const im = document.createElement('img');
        if (url) {
          im.src = url;
          im.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover;object-position:center 20%';
          thumb.appendChild(im);
        } else {
          if (frame.draw) frame.draw(mctx, 108, 144);
          thumb.appendChild(mini);
        }
      } else {
        if (frame.draw) frame.draw(mctx, 108, 144);
        thumb.appendChild(mini);
      }

      const label = document.createElement('div');
      label.textContent = frame.name;
      label.style.cssText = 'position:absolute;bottom:-19px;left:-10px;right:-10px;text-align:center;font-family:Space Mono,monospace;font-size:8px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink);opacity:0.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      label.className = 'thumb-label';
      thumb.appendChild(label);

      thumb.onclick = () => {
        this.setFrame(key);
      };

      container.appendChild(thumb);
    }

    document.querySelectorAll('.frame-cat-btn').forEach(btn => {
      btn.onclick = () => this.setFrameCategory(btn.dataset.cat);
    });
  },

  setFrameCategory(cat) {
    const ft = document.getElementById('filter-thumbnails');
    const th = document.getElementById('frame-thumbnails');
    if (ft && th) { ft.style.display = 'none'; th.style.display = 'flex'; }
    document.querySelectorAll('#frame-categories .frame-cat-btn').forEach(b => {
      if (b.id === 'filters-tab') { b.style.background = 'var(--paper)'; b.style.color = 'var(--ink)'; }
    });
    this.frameCategory = cat;
    document.querySelectorAll('.frame-cat-btn').forEach(b => {
      const active = b.dataset.cat === cat;
      b.style.background = active ? 'var(--ink)' : 'var(--paper)';
      b.style.color = active ? 'var(--paper)' : 'var(--ink)';
      b.classList.toggle('active', active);
    });
    this.buildFrameThumbnails();
  },

  // ===== LAYOUTS UI =====
  buildLayoutChips() {
    const row = document.getElementById('layout-row');
    if (!row) return;
    row.innerHTML = '';
    for (const [key, l] of Object.entries(LAYOUTS)) {
          if (l.duoOnly && this.mode !== 'together') continue;
          const chip = document.createElement('button');
      chip.className = 'frame-chip chip layout-chip' + (key === this.currentLayout ? ' active' : '');
      chip.textContent = l.name;
      chip.dataset.layout = key;
      chip.onclick = () => this.setLayout(key);
      row.appendChild(chip);
    }
  },

  setLayout(key, broadcast = true) {
    // lock layout changes mid-capture — switching would wipe the session shots
    if (this.multiShotInProgress && this._captureChainActive) return;
    if (!FramesNext.supports(key) && FRAMES[this.currentFrame] && FRAMES[this.currentFrame].framesNext) {
      key = 'strip-4';
    }
    const ddef = LAYOUTS[key];
    if (ddef && ddef.duoOnly && this.mode !== 'together') key = 'strip-4';
    this.currentLayout = key;
    // Route through the duo machine (acked). broadcast=false is used when
    // applying a partner-initiated change.
    if (broadcast && this.mode === 'together' && this.duo) {
      this.duo.setLayout(key);
    } else if (broadcast && this.dataConnection && this.dataConnection.open) {
      try { this.dataConnection.send({ type: 'setLayout', key }); } catch(e) {}
    }
    this.applyPreviewAspect();
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.multiShotCancelled = false;
    if (this.duo) this.duo.clearLocal();
    document.querySelectorAll('#layout-row .frame-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.layout === key);
    });
    const layout = LAYOUTS[key];
    if (layout && layout.shots > 1) {
      document.getElementById('shutter-btn').title = `Shot 1 of ${layout.shots}`;
    } else {
      document.getElementById('shutter-btn').title = '';
    }
  },

  // ===== COUNTDOWN =====
  async countdown(seconds = 3) {
    const overlay = document.getElementById('countdown-overlay');
    const numEl = document.getElementById('countdown-number');
    const flash = document.getElementById('flash');

    // Issue 025 — only one countdown at a time. A second invocation cancels
    // the first via the cancelled flag. Returns the EXISTING in-flight
    // promise so callers can't double-fire.
    if (this._countdownPromise) return this._countdownPromise;

    overlay.classList.add('active');
    const sh = document.getElementById('shutter-btn');
    if (sh) sh.classList.add('counting');

    const promise = new Promise(resolve => {
      let count = seconds;
      let cancelled = false;
      this._countdownCancel = () => { cancelled = true; };
      const tick = () => {
        if (cancelled) {
          resolve();
          return;
        }
        if (count > 0) {
          numEl.textContent = count;
          const sbc = document.getElementById('shot-badge');
          const target = this._targetShots || (this.currentLayout === 'pair'
            ? 4
            : (typeof LAYOUTS !== 'undefined' && LAYOUTS[this.currentLayout]
                ? LAYOUTS[this.currentLayout].shots : 8));
          if (sbc && sbc.style.display !== 'none') sbc.textContent = `SHOT ${this.sessionShots ? this.sessionShots.length + 1 : '?'} OF ${target} · ${count}`;
          numEl.style.animation = 'none';
          void numEl.offsetWidth;
          numEl.style.animation = 'fadeInUp 0.5s ease-out';
          this.playTickSound();
          if (this.mode === 'together' && this.duo) {
            this.duo._sendFire('sharedTick', { n: count });
          } else if (this.mode === 'together' && this.dataConnection && this.dataConnection.open && this.isHost) {
            try { this.dataConnection.send({ type: 'sharedTick', n: count }); } catch(e) {}
          }
          count--;
          this._countdownTimer = setTimeout(tick, 1000);
        } else {
          flash.classList.add('active');
          this.playShutterSound();
          this._countdownTimer = setTimeout(() => {
            flash.classList.remove('active');
            overlay.classList.remove('active');
            if (sh) sh.classList.remove('counting');
            resolve();
          }, 150);
        }
      };
      tick();
    });
    this._countdownPromise = promise;
    promise.finally(() => {
      this._countdownPromise = null;
      this._countdownCancel = null;
      this._countdownTimer = null;
    });
    return promise;
  },

  // ===== POSE PROMPTS =====
  posePrompts: [
    'smile like you mean it', 'silly face!', 'look away, act cool',
    'big laugh', 'peace sign + wink', 'smize (smile with your eyes)',
    'fake surprise!', 'puppy eyes', 'do a little twirl (motion blur ok)',
    'dead serious face', 'blow a kiss', 'hands on cheeks, shocked',
    'thumbs up, chin up', 'head tilt + grin', 'close your eyes, breathe',
    'wave hi to future you', 'puff your cheeks', 'point at the camera',
  ],
  nextPosePrompt() {
    // pick a prompt different from the last one
    if (!this._lastPrompt) this._lastPrompt = -1;
    let i;
    do { i = Math.floor(Math.random() * this.posePrompts.length); } while (i === this._lastPrompt);
    this._lastPrompt = i;
    return this.posePrompts[i];
  },

  // ===== CAPTURE =====
  async capture(fromChain) {
    // guard: only ONE capture chain at a time. External calls (shutter/sync) are
    // rejected while a chain runs; the chain's own setTimeout continuation passes
    // fromChain=true so it never blocks itself.
    if (this.multiShotInProgress && this._captureChainActive && !fromChain) return;
    const shutterBtn = document.getElementById('shutter-btn');
    shutterBtn.disabled = true;

    const layout = LAYOUTS[this.currentLayout];
    const targetShots = this.shotsNeededForLayout(this.currentLayout);

    // LANE1-FIX — shutter → CAPTURING. The state machine owns the "we're
    // mid-shutter-chain" flag; with no transition here, the ack protocol
    // would accept setFrame/setLayout from the partner while we were
    // shooting. Transitions from PICKING/REVEALED/IDLE to CAPTURING are all
    // permitted by `_isValidTransition`.
    if (this.mode === 'together' && this.duo && !fromChain) {
      this.duo.transition(DUO_STATES.CAPTURING, 'shutter');
    }

    try {
      if (layout && layout.shots > 1) {
        // Multi-shot mode — capture 2x the slots so the user can pick the best ones
        if (!fromChain) {
          // fresh chain: reset state. Chain continuations must NOT reset (they'd wipe prior shots)
          this.sessionShots = [];
        }
        this.multiShotInProgress = true;
        this._captureChainActive = true;
        this.multiShotCancelled = false;

        await this.countdown(3);
        if (this.multiShotCancelled) return;

        const shotData = this.captureSingleFrame();
        this.multiShots.push(shotData);
        this.sessionShots.push(shotData);

        if (this.currentLayout === 'pair' && this.dataConnection && this.dataConnection.open) {
          try { this.dataConnection.send({ action: 'pairShot', index: this.sessionShots.length - 1, data: shotData }); } catch(e) {}
        }

        const shotNum = this.sessionShots.length;
        this._targetShots = targetShots;

        if (shotNum < targetShots) {
          shutterBtn.title = `Shot ${shotNum + 1} of ${targetShots}`;
          // 1.5s gap = POSE PROMPT first, then the next countdown takes the badge back
          const sbp = document.getElementById('shot-badge');
          if (sbp) { sbp.textContent = this.nextPosePrompt() + ' \u2192'; sbp.style.display = 'inline-flex'; }
          this.flashFeedback();
          shutterBtn.disabled = false;
          this._chainTimer = setTimeout(() => {
            if (!this.multiShotCancelled) this.capture(true);
          }, 1500);
          return;
        }

        // All shots captured — go to PICK-YOUR-BEST-FOUR (skipped for pair v1 — see notes)
        shutterBtn.disabled = false;
        // Issue 005 — keep `_captureChainActive = true` across finalizePairCapture
        // so the shutter stays disabled during the partner-shot wait window.
        // The original code flipped it to false BEFORE awaiting, which let a
        // second tap wipe sessionShots while the pair composite was polling.
        if (this.currentLayout === 'pair') {
          await this.finalizePairCapture();
          this._captureChainActive = false;
          shutterBtn.disabled = false;
          return;
        }
        const sb0 = document.getElementById('shot-badge');
        if (sb0) sb0.style.display = 'none';
        // LANE1-FIX — chain done → PICKING. setFrame/setLayout is blocked in
        // PICKING so the partner can't drift the layout behind us mid-pick.
        if (this.mode === 'together' && this.duo) {
          this.duo.transition(DUO_STATES.PICKING, 'capture-chain-done');
        }
        this.openPickScreen();
        this._captureChainActive = false;
        return;
      } else {
        // Single shot — straight to reveal (no pick screen)
        await this.countdown(3);
        if (this.multiShotCancelled) return;
        await this.composite();
      }

      const sb1 = document.getElementById('shot-badge');
      if (sb1) sb1.style.display = 'none';
      // Single-shot: in together mode the host publishes via the acked
      // finalReveal channel so both peers reach REVEALED with the same image
      // (issue 020). Guest adopts via _adoptPartnerReveal().
      if (this.mode === 'together' && this.isHost && this.duo && this.capturedImage) {
        this.duo.publishReveal(this.capturedImage);
      } else {
        this.showReveal();
      }
      this.multiShots = [];
      this.sessionShots = [];
      this.pickedIndices = [];
      this.multiShotInProgress = false;
      this._captureChainActive = false;
    } catch (err) {
      console.error('Capture error:', err);
      this._captureChainActive = false;
      this._surfaceInlineError('Something went wrong while capturing. Please try again.');
    } finally {
      shutterBtn.disabled = false;
    }
  },

  flashFeedback() {
    const flash = document.getElementById('flash');
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 120);
    const shutter = document.getElementById('shutter-btn');
    if (shutter) {
      shutter.classList.remove('pulse');
      void shutter.offsetWidth;
      shutter.classList.add('pulse');
      setTimeout(() => shutter.classList.remove('pulse'), 360);
    }
  },

  captureSingleFrame() {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const hasRemote = this.mode === 'together' && remoteVideo && remoteVideo.srcObject;

    const tmp = document.createElement('canvas');
    const duoWide = this.currentLayout === 'duo-strip' || this.currentLayout === 'duo-grid';
    const W = duoWide ? 1440 : 1080;
    const H = duoWide ? 810 : 1350;
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext('2d');

    tctx.fillStyle = '#FAF3E6';
    tctx.fillRect(0, 0, W, H);

    const filterDef = FILTERS[this.currentFilter];
    tctx.filter = filterDef ? filterDef.canvas : 'none';

    const doMirror = this.mirrorCaptures;
    if (this.currentLayout === 'pair') {
      this.drawCover(tctx, localVideo, 0, 0, W, H);
    } else if (hasRemote) {
      const gutter = 12;
      const halfW = (W - gutter) / 2;
      if (doMirror) { tctx.save(); tctx.translate(halfW, 0); tctx.scale(-1, 1); }
      this.drawCover(tctx, localVideo, 0, 0, halfW, H);
      if (doMirror) tctx.restore();
      this.drawCover(tctx, remoteVideo, halfW + gutter, 0, halfW, H);
    } else {
      if (doMirror) { tctx.save(); tctx.translate(W, 0); tctx.scale(-1, 1); }
      this.drawCover(tctx, localVideo, 0, 0, W, H);
      if (doMirror) tctx.restore();
    }

    tctx.filter = 'none';
    return tmp.toDataURL('image/jpeg', 0.92);
  },

  // Returns a Promise that resolves when compositing is complete
    // Returns a Promise that resolves when compositing is complete.
  // Issue 005 — caller (`capture`) keeps `_captureChainActive` true until
  // this resolves, so the shutter stays disabled across the wait window.
  // Issue 017 — if partner never sends shots, surface an inline modal
  // instead of silently padding with the host's last shot.
  // Issue 032 — bounded wait (12 s) with progress UI and cancel button.
  async finalizePairCapture() {
    if (this.duo) this.duo.beginPairFinalize();
    const mine = [...this.multiShots.length ? this.multiShots : this.sessionShots];
    const deadline = Date.now() + 12000;
    const expected = 4;
    const progress = this._showPairProgress(mine.length, 0);
    let cancelled = false;
    progress.onCancel = () => { cancelled = true; };
    while (Date.now() < deadline && !cancelled) {
      const got = (this.pairPartnerShots || []).filter(Boolean).length;
      progress.update(mine.length, got);
      if (got >= expected) break;
      await new Promise(r => setTimeout(r, 250));
    }
    progress.done();
    if (cancelled) {
      // User backed out — return to pick screen with whatever partner
      // shots arrived.
      this._captureChainActive = false;
      document.getElementById('shutter-btn').disabled = false;
      this.openPickScreen();
      return;
    }
    const theirs = (this.pairPartnerShots || []).slice(0, 4).filter(Boolean);
    if (theirs.length === 0) {
      // Issue 017 — partner never sent anything. Let the user decide.
      const proceed = await this._surfacePartnerMissingModal();
      if (!proceed) {
        this.pickRetake();
        return;
      }
    }
    const isHost = this.isHost;
    const pad = mine[mine.length - 1] || theirs[0];
    const ordered = isHost
      ? [...mine, ...theirs, ...Array(Math.max(0, 8 - mine.length - theirs.length)).fill(pad)]
      : [...theirs, ...mine, ...Array(Math.max(0, 8 - mine.length - theirs.length)).fill(pad)];
    this.multiShots = ordered.slice(0, 8).filter(Boolean);
    try { await this.compositeMultiShot(); } catch (e) { console.warn('pair composite failed', e); }
    // Issue 020 — host publishes via acked finalReveal; guest adopts.
    if (this.capturedImage && this.mode === 'together' && this.isHost && this.duo) {
      this.duo.publishReveal(this.capturedImage);
    } else {
      this.showReveal();
    }
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.pairPartnerShots = [];
    if (this.duo) this.duo.clearLocal();
    document.getElementById('shutter-btn').disabled = false;
  },
// Issue (LANE1-FIX) — `compositeMultiShot` was lost during the duo-state
  // refactor. `pickPrint` and `finalizePairCapture` both await it; without it
  // the browser throws "this.compositeMultiShot is not a function" and the
  // pick->print flow dies. Reinstated as a frame-aware composite: when an
  // `nx-` template is active we route through `FramesNext.renderToCanvas` (the
  // same path the single-shot `composite()` uses) so the mat, slots, and date
  // all render identically. The plain-canvas fill below runs only when no
  // nx- frame is active. `multiShots` is left as set by `pickPrint` (already
  // reordered by pickedIndices) — we never re-order here. duo-strip / duo-grid
  // canvas dims come from LAYOUTS via the same convention as `captureSingleFrame`
  // (W=1440, H=810). Returns a Promise that resolves after `capturedImage` is
  // populated, matching the old contract.
  compositeMultiShot() {
    const self = this;
    const shots = self.multiShots;
    const duoWide = self.currentLayout === 'duo-strip' || self.currentLayout === 'duo-grid';
    const W = duoWide ? 1440 : 1080;
    let H;

    // Canvas dims per LAYOUTS — mirrors the dims used in `captureSingleFrame`
    // and the OLD `compositeMultiShot` (W=1080, strip/grid computed; pair uses
    // the 8-slot grid below).
    if (self.currentLayout === 'strip-4') {
      const gap = 16;
      const cellW = W - gap * 2;
      const cellH = Math.round(cellW * 5 / 4);
      H = cellH * 4 + gap * 5;
    } else if (self.currentLayout === 'strip-3') {
      const gap = 16;
      const cellW = W - gap * 2;
      const cellH = Math.round(cellW * 5 / 4);
      H = cellH * 3 + gap * 4;
    } else if (self.currentLayout === 'grid-2x2') {
      H = W;
    } else if (self.currentLayout === 'duo-strip') {
      // 1440 × 810 — wide two-face strip, 4 stacked shots
      H = 810;
    } else if (self.currentLayout === 'duo-grid') {
      // 1440 × 1620 — 2 stacked shots on the wide canvas
      H = 1620;
    } else if (self.currentLayout === 'pair') {
      // 1080 × 1350 — 4 rows × 2 cols fits the 8-slot pair layout
      H = 1350;
    } else {
      H = 1350;
    }

    self.canvas.width = W;
    self.canvas.height = H;
    const ctx = self.ctx;

    const frameDef = FRAMES[self.currentFrame];
    const nxActive = frameDef && frameDef.framesNext;

    const finish = () => {
      try {
        self.capturedImage = self.canvas.toDataURL('image/jpeg', 0.92);
      } catch (e) {
        // fall through — capturedImage stays as it was (preserve prior canvas)
      }
    };

    // Wrap the whole pipeline so the returned Promise resolves AFTER images
    // are drawn AND `capturedImage` is populated. `pickPrint`/`finalizePairCapture`
    // both `await` this and then read `capturedImage`; resolving early would
    // race them into an empty reveal.
    return new Promise((resolve) => {
      // nx- frame path: let the template system size the canvas (it picks the
      // exact px from `templates.json`) and lay the photos into its slots.
      // The plain-canvas fill below is skipped so we don't double-write.
      if (nxActive) {
        FramesNext.renderToCanvas(
          self.currentFrame.replace('nx-', ''),
          self.currentLayout,
          self.canvas,
          self.multiShots || shots || []
        ).then(() => { finish(); resolve(); })
          .catch(e => {
            console.warn('[frames-next] render failed, falling back to plain composite', e);
            // Fall through to plain-fill. Resolve only after plainFill finishes.
            plainFill().then(resolve, resolve);
          });
        return;
      }

      plainFill().then(resolve, resolve);
    });

    function plainFill() {
      return new Promise((resolvePlain) => {
        ctx.fillStyle = '#FAF3E6';
        ctx.fillRect(0, 0, W, H);

        const gap = 16;
        if (!shots || shots.length === 0) {
          // No photos — still produce an image so the caller can paint a
          // frame border and the user isn't stuck on a black canvas.
          if (frameDef) frameDef.draw(ctx, W, H);
          finish();
          resolvePlain();
          return;
        }

        const loadPromises = shots.map(dataURL => new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = dataURL;
        }));

        Promise.all(loadPromises).then(images => {
          ctx.filter = 'none';

          if (self.currentLayout === 'strip-4' || self.currentLayout === 'strip-3') {
            const cellH = (H - gap * (shots.length + 1)) / shots.length;
            const cellW = W - gap * 2;
            images.forEach((img, i) => {
              const y = gap + i * (cellH + gap);
              self.drawCover(ctx, img, gap, y, cellW, cellH);
            });
          } else if (self.currentLayout === 'grid-2x2') {
            const cellW = (W - gap * 3) / 2;
            const cellH = (H - gap * 3) / 2;
            images.forEach((img, i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              const x = gap + col * (cellW + gap);
              const y = gap + row * (cellH + gap);
              self.drawCover(ctx, img, x, y, cellW, cellH);
            });
          } else if (self.currentLayout === 'duo-strip') {
            const cellH = (H - gap * (shots.length + 1)) / shots.length;
            const cellW = W - gap * 2;
            images.forEach((img, i) => {
              const y = gap + i * (cellH + gap);
              self.drawCover(ctx, img, gap, y, cellW, cellH);
            });
          } else if (self.currentLayout === 'duo-grid') {
            const cellH = (H - gap * 3) / 2;
            const cellW = W - gap * 2;
            images.forEach((img, i) => {
              const y = gap + i * (cellH + gap);
              self.drawCover(ctx, img, gap, y, cellW, cellH);
            });
          } else if (self.currentLayout === 'pair') {
            // 8 slots: 4 host shots on left, 4 partner shots on right.
            // `multiShots` is already ordered by `finalizePairCapture`:
            // host order is [mine, theirs, pad], guest order is [theirs, mine, pad].
            // We just grid them in reception order — slot i for i.
            const halfW = (W - gap * 3) / 2;
            const cellH = (H - gap * 5) / 4;
            images.forEach((img, i) => {
              const col = Math.floor(i / 4);  // 0 = host, 1 = partner
              const row = i % 4;
              const x = gap + col * (halfW + gap);
              const y = gap + row * (cellH + gap);
              self.drawCover(ctx, img, x, y, halfW, cellH);
            });
          } else {
            // Issue 014 — never let `capturedImage` be empty. Fall back to
            // a stacked grid so the photos survive even on layouts we
            // don't explicitly handle.
            console.warn('[composite] unknown layout, falling back to grid:', self.currentLayout);
            const cols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(shots.length))));
            const rows = Math.ceil(shots.length / cols);
            const cellW = (W - gap * (cols + 1)) / cols;
            const cellH = (H - gap * (rows + 1)) / rows;
            images.forEach((img, i) => {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = gap + col * (cellW + gap);
              const y = gap + row * (cellH + gap);
              self.drawCover(ctx, img, x, y, cellW, cellH);
            });
          }

          ctx.filter = 'none';
          if (frameDef) frameDef.draw(ctx, W, H);
          finish();
          resolvePlain();
        }).catch(e => {
          // Even on image-load failure we want a populated canvas (frame-only).
          if (frameDef) frameDef.draw(ctx, W, H);
          finish();
          resolvePlain();
        });
      });
    }
  },

  // ===== COMPOSITE (canvas) =====
  composite() {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const hasRemote = this.mode === 'together' && remoteVideo && remoteVideo.srcObject;

    const W = 1080;
    const H = 1350;

    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.ctx;

    ctx.fillStyle = '#FAF3E6';
    ctx.fillRect(0, 0, W, H);

    const filterDef = FILTERS[this.currentFilter];
    ctx.filter = filterDef ? filterDef.canvas : 'none';

    if (hasRemote) {
      const gutter = 12;
      const halfW = (W - gutter) / 2;
      this.drawCover(ctx, localVideo, 0, 0, halfW, H);
      this.drawCover(ctx, remoteVideo, halfW + gutter, 0, halfW, H);
    } else {
      this.drawCover(ctx, localVideo, 0, 0, W, H);
    }

    ctx.filter = 'none';

    const frameDef = FRAMES[this.currentFrame];
    if (frameDef && frameDef.framesNext) {
      const self = this;
      const snap = this.canvas.toDataURL('image/jpeg', 0.92);
      return FramesNext.renderToCanvas(this.currentFrame.replace('nx-',''), this.currentLayout, this.canvas, [snap])
        .then(() => {
          self.capturedImage = self.canvas.toDataURL('image/jpeg', 0.92);
        })
        .catch(e => {
          console.warn('[frames-next] render failed', e);
          self.capturedImage = self.canvas.toDataURL('image/jpeg', 0.92);
        });
    }
    if (frameDef) frameDef.draw(ctx, W, H);

    this.capturedImage = this.canvas.toDataURL('image/jpeg', 0.92);
  },

  drawCover(ctx, source, x, y, w, h) {
    const sw = source.videoWidth || source.width || source.naturalWidth || 1280;
    const sh = source.videoHeight || source.height || source.naturalHeight || 720;
    const sRatio = sw / sh;
    const dRatio = w / h;
    let sx, sy, sWidth, sHeight;

    if (sRatio > dRatio) {
      sHeight = sh;
      sWidth = sh * dRatio;
      sx = (sw - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = sw;
      sHeight = sw / dRatio;
      sx = 0;
      sy = (sh - sHeight) / 2;
    }

    ctx.drawImage(source, sx, sy, sWidth, sHeight, x, y, w, h);
  },

  // ===== REVEAL =====
  showReveal() {
    const pol = document.getElementById('reveal-polaroid');
    if (pol) { pol.classList.remove('develop-wipe'); void pol.offsetWidth; pol.classList.add('develop-wipe'); }
    if (!this.capturedImage) {
      console.error('No captured image to show');
      return;
    }

    // LANE1-FIX — print → REVEALED. The host path goes through
    // `duo.publishReveal(...)` (which itself transitions). This catches the
    // guest / non-host / single-shot / pair-guest paths: any local call to
    // `showReveal()` while we're past PICKING/CAPTURING/FINALIZING means the
    // strip is settled, so transition the machine. Solo callers skip this —
    // there's no duo session to update.
    if (this.mode === 'together' && this.duo && this.duo.state !== DUO_STATES.REVEALED) {
      this.duo.transition(DUO_STATES.REVEALED, 'showReveal');
    }

    this.showScreen('reveal');

    const polaroid = document.getElementById('reveal-polaroid');
    const canvas = document.getElementById('reveal-canvas');

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      polaroid.classList.remove('developed');
      setTimeout(() => polaroid.classList.add('developed'), 100);
    };
    img.onerror = () => console.error('Failed to load captured image for reveal');
    img.src = this.capturedImage;

    const rot = (Math.random() - 0.5) * 3;
    polaroid.style.transform = `rotate(${rot}deg)`;

    this.addToGallery(this.capturedImage);

    if (typeof storage !== 'undefined') {
      storage.upload(this.capturedImage).then(url => {
        if (url) console.log('Photo saved to cloud');
      }).catch(e => console.error('Cloud upload failed:', e));
    }
  },

  retake() {
    this.showScreen('stage');
    setTimeout(() => this.initFrameOverlay(), 100);
  },

  // ===== DOWNLOAD =====
  async downloadPhoto() {
    if (!this.capturedImage) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `us_${this.mode}_${ts}.jpg`;
    try {
      const blob = await (await fetch(this.capturedImage)).blob();
      const url = URL.createObjectURL(blob);
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const link = document.createElement('a');
      link.href = url; link.download = name; link.rel = 'noopener';
      link.target = isIOS ? '_blank' : '_self';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      window.open(this.capturedImage, '_blank');
    }
  },

  // ===== GALLERY =====
  addToGallery(dataURL) {
    this.gallery.unshift({ url: dataURL, time: Date.now() });
    this.saveGallery();
  },

  saveGallery() {
    try {
      const recent = this.gallery.slice(0, 20);
      localStorage.setItem('us_gallery', JSON.stringify(recent));
    } catch(e) { /* localStorage full, skip */ }
  },

  loadGallery() {
    try {
      const stored = localStorage.getItem('us_gallery');
      if (stored) this.gallery = JSON.parse(stored);
    } catch(e) { this.gallery = []; }
  },

  async openGallery() {
    this.showScreen('gallery-screen');
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<p class="gallery-empty">Loading your moments...</p>';

    let photos = [...this.gallery];

    if (typeof storage !== 'undefined') {
      try {
        const cloudPhotos = await storage.listPhotos();
        cloudPhotos.forEach(cp => {
          if (!photos.find(p => p.url === cp.url)) {
            photos.push(cp);
          }
        });
      } catch (e) { /* cloud unavailable */ }
    }

    if (photos.length === 0) {
      grid.innerHTML = '<p class="gallery-empty">No memories yet.<br>Take one together.</p>';
      return;
    }

    photos.sort((a, b) => (b.time || b.created || 0) - (a.time || a.created || 0));

    grid.innerHTML = '';
    photos.forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative';

      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.onclick = () => {
        const w = window.open('', '_blank');
        if (w) {
          const imgEl = w.document.createElement('img');
          imgEl.src = item.url;
          imgEl.style.cssText = 'width:100%;height:auto;display:block';
          w.document.body.style.margin = '0';
          w.document.body.appendChild(imgEl);
        }
      };
      const img = document.createElement('img');
      img.src = item.url;
      img.loading = 'lazy';
      div.appendChild(img);

      const delBtn = document.createElement('button');
      delBtn.innerHTML = '✕';
      delBtn.style.cssText = 'position:absolute;top:4px;right:4px;width:28px;height:28px;background:rgba(0,0,0,0.8);color:#F2EBE0;border:1px solid #F2EBE0;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;z-index:5';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this photo?')) {
          app.deletePhoto(item, idx, wrapper);
        }
      };

      wrapper.appendChild(div);
      wrapper.appendChild(delBtn);
      grid.appendChild(wrapper);
    });
  },

  async deletePhoto(item, idx, element) {
    const localIdx = this.gallery.findIndex(g => g.url === item.url);
    if (localIdx >= 0) {
      this.gallery.splice(localIdx, 1);
      this.saveGallery();
    }
    if (typeof storage !== 'undefined' && item.url) {
      await storage.deletePhoto(item.url);
    }
    if (element) element.remove();
    console.log('Photo deleted');
  },

  // ===== ROOM CODE =====
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },

  copyRoomCode() {
    const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
    if (navigator.share) {
      navigator.share({ title: 'us', text: 'come take a photo with me', url });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied! Send it to your person.');
      }).catch(() => {
        prompt('Copy this link:', url);
      });
    } else {
      prompt('Copy this link:', url);
    }
  },

  joinRoom() {
    const code = document.getElementById('room-code-input').value.toUpperCase().trim();
    if (code.length < 5) {
      alert('Please enter the 5-character code.');
      return;
    }
    this.roomCode = code;
    this.isHost = false;
    if (this.duo) {
      this.duo.setRole('guest');
      this.duo.transition(DUO_STATES.JOINING, 'joinRoom');
    }

    this.startCamera().then(() => {
      this.showScreen('stage');
      setTimeout(() => this.initFrameOverlay(), 100);
      // Issue 001 — rebuild layout chips now that mode === 'together'
      this.buildLayoutChips();
      this.initPeerJS();
    }).catch(() => {});
  },

  // ===== WEBRTC (PeerJS) =====
  initPeerJS() {
    this.cleanupPeer();

    const peerId = `us-${this.roomCode}-${this.isHost ? 'host' : 'guest'}`;
    this.peer = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ],
      },
    });

    this.peer.on('open', (id) => {
      this.updateStatus('connecting', 'CONNECTING');

      if (this.isHost) {
        this.updateStatus('connecting', 'WAITING');
      } else {
        const hostId = `us-${this.roomCode}-host`;
        const conn = this.peer.connect(hostId, { reliable: true });
        this.setupDataConnection(conn);

        conn.on('open', () => {
          const call = this.peer.call(hostId, this.localStream);
          if (call) {
            this.setupCall(call);
          }
        });
      }
    });

    this.peer.on('connection', (conn) => {
      this.setupDataConnection(conn);
    });

    this.peer.on('call', (call) => {
      call.answer(this.localStream);
      this.setupCall(call);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      this.updateStatus('error', 'ERROR');

      if (err.type === 'peer-unavailable') {
        alert('Room not found. Check the code and try again.');
        this.goHome();
      } else if (err.type === 'unavailable-id') {
        alert('This room is already open in another tab. Please close it and try again.');
        this.goHome();
      } else if (err.type === 'network' || err.type === 'server-error') {
        alert('Connection issue. Please check your internet and try again.');
      }
    });

    this.peer.on('disconnected', () => {
      if (this.peer && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch(e) {}
      }
    });

    // LANE1-FIX — peer-level "closed" event (fires when the underlying PeerJS
    // socket goes away). Some drops surface here but never reach the
    // data-channel `close` handler above. Forward into the duo machine.
    try {
      this.peer.on('close', () => {
        if (this.duo && this.mode === 'together') {
          this.duo.markPartnerLeft('peer-close');
        }
      });
    } catch (e) { /* peer pre-1.0 may not expose close */ }
  },

  setupDataConnection(conn) {
    this.dataConnection = conn;

    conn.on('open', () => {
      // Issue 003 — host no longer dials outbound here. The guest dials
      // the host on data-channel open (above), and the host answers via
      // `peer.on('call')`. This prevents the duplicate RTCPeerConnection
      // that was the source of the echo + camera-switch bug.
      this.updateStatus('connected', this.mode === 'together' ? 'PAIRED' : 'CONNECTED');
      const active = document.querySelector('.screen.active');
      if (this.mode === 'together' && active && active.id === 'room') {
        this.showScreen('stage');
        setTimeout(() => this.initFrameOverlay(), 100);
      }
      if (this.mode === 'together' && this.isHost) {
        this.showRoomPill('CONNECTED · ' + this.roomCode, true);
      }
      // LANE1-FIX — paired → CONNECTED. The state machine was stuck in
      // ROOM_OPEN / JOINING because no caller advanced it on `open`. Now the
      // host transitions ROOM_OPEN → CONNECTED and the guest transitions
      // JOINING → CONNECTED. UI doesn't depend on this, but the ack protocol
      // (setFrame / setLayout / capture) keys off `state === CONNECTED` for
      // permission checks.
      if (this.mode === 'together' && this.duo) {
        this.duo.transition(DUO_STATES.CONNECTED, 'pair-open');
      }
      // Mirror initial state to the partner via the duo machine (acked).
      // See issue 030 — every state-advancing message gets an ack.
      if (this.duo) {
        this.duo.frame = this.currentFrame;
        this.duo.layout = this.currentLayout;
        this.duo.setFrame(this.currentFrame);
        this.duo.setLayout(this.currentLayout);
      } else {
        try {
          conn.send({ type: 'setFrame', key: this.currentFrame });
          conn.send({ type: 'setLayout', key: this.currentLayout });
        } catch(e) {}
      }
    });

    // Issue 030 — all inbound data-channel messages go through the duo
    // machine. It validates sender peer id, clamps payload sizes, and
    // dispatches to typed handlers. We also send an ACK before
    // processing so the sender's pending-ack timer clears.
    if (this.duo) {
      this.duo.attachTo(conn);
    } else {
      // Fallback for callers that haven't constructed a duo session.
      conn.on('data', (data) => {
        if (!data) return;
        if (data.type === 'sharedTick' || data.action === 'sharedTick') this.playTickSound();
      });
    }

    conn.on('close', () => {
      this.dataConnection = null;
      this.updateStatus('', 'DISCONNECTED');
      // Issue 008 — surface a visible "partner left" state with a rejoin
      // affordance, instead of leaving the user in an orphan connection.
      // LANE1-FIX — the duo machine's `attachTo` now also subscribes to
      // `close` (see duo-state.js#attachTo). This is the safety net for the
      // fallback branch where `this.duo` is missing. `markPartnerLeft` is
      // idempotent on `partnerLeft === true`, so double-firing is harmless.
      if (this.duo && this.mode === 'together') {
        this.duo.markPartnerLeft('connection-close');
      } else {
        // Fallback when no duo machine exists: surface the banner directly.
        this._showPartnerLeftBanner('connection-close');
      }
    });

    conn.on('error', (err) => {
      console.error('Data connection error:', err);
      // LANE1-FIX — abrupt drops sometimes surface only as errors. Treat
      // a data-channel error while in together mode as a partner-left signal
      // when the duo machine hasn't already fired. The presence watchdog
      // below catches the cases where PeerJS never raises either event.
      if (this.duo && this.mode === 'together') {
        this.duo.markPartnerLeft('connection-error');
      }
    });

    // LANE1-FIX — arm a presence watchdog. If partner hasn't pinged in
    // `_PARTNER_TIMEOUT_MS` we treat them as gone. Without this, a host
    // whose guest's tab crashes (no `close` event from PeerJS) never
    // sees the partner-left banner.
    this._armPresenceWatchdog();
  },

  _PARTNER_TIMEOUT_MS: 20000,

  _armPresenceWatchdog() {
    if (this._presenceWatchdogTimer) clearInterval(this._presenceWatchdogTimer);
    this._presenceWatchdogTimer = setInterval(() => {
      if (!this.duo || this.mode !== 'together') return;
      if (this.duo.partnerLeft) return;
      if (!this.duo.partnerPresent) return;       // never connected yet
      const sinceLast = Date.now() - (this.duo.partnerLastSeen || 0);
      if (sinceLast > this._PARTNER_TIMEOUT_MS) {
        console.warn('[duo] presence-timeout, marking partner left');
        this.duo.markPartnerLeft('presence-timeout');
      }
    }, 5000);
  },

  _stopPresenceWatchdog() {
    if (this._presenceWatchdogTimer) {
      clearInterval(this._presenceWatchdogTimer);
      this._presenceWatchdogTimer = null;
    }
  },

  setupCall(call) {
    call.on('stream', (remoteStream) => {
      this.onRemoteStream(remoteStream);
    });
    call.on('error', (err) => {
      console.error('Call error:', err);
    });
  },

  onRemoteStream(stream) {
    this.remoteStream = stream;
    const remoteVideo = document.getElementById('remote-video');
    if (!remoteVideo) return;
    remoteVideo.srcObject = stream;
    this.showRemote();
    this.updateStatus('connected', 'CONNECTED');
    this.playConnectSound();
  },

  // ===== SYNCED CAPTURE (for together mode) =====
  handleSyncedCapture(captureTime, frame, layout) {
    // Issue 025 — rate-limit inbound `capture` messages to prevent spam from
    // forcing the host into capture chains (issue 030 #4). 4 s minimum gap.
    const now = Date.now();
    if (this._lastCaptureRequestAt && now - this._lastCaptureRequestAt < 4000) {
      console.warn('[duo] capture request rate-limited');
      return;
    }
    this._lastCaptureRequestAt = now;
    if (frame && frame !== this.currentFrame) this.setFrame(frame);
    if (layout && layout !== this.currentLayout) this.setLayout(layout);
    const delay = captureTime - Date.now();
    if (delay > 0) {
      setTimeout(() => this.capture(), delay);
    } else {
      this.capture();
    }
  },

  requestSyncedCapture() {
    if (this.dataConnection && this.dataConnection.open) {
      const captureTime = Date.now() + 3500;
      // Route through the duo machine (acked). See issue 030.
      if (this.duo) {
        this.duo.beginCapture(captureTime, this.currentFrame, this.currentLayout);
      } else {
        try { this.dataConnection.send({ type: 'capture', captureTime, frame: this.currentFrame, layout: this.currentLayout }); } catch(e) {}
      }
      this.handleSyncedCapture(captureTime, this.currentFrame, this.currentLayout);
    } else {
      this.capture();
    }
  },

  // ===== STATUS =====
  updateStatus(state, text) {
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (dot) {
      dot.className = 'status-dot';
      dot.dataset.state = state || '';
    }
    if (txt) {
      txt.textContent = text || '';
      const meaningful = state === 'connecting' || state === 'connected' || state === 'error';
      txt.dataset.shown = meaningful && text ? '1' : '';
    }
  },

  // ===== SOUNDS (Web Audio API) =====
  audioCtx: null,

  getAudio() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.audioCtx = new AC();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  },

  playTickSound() {
    try {
      const ctx = this.getAudio();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}
  },

  playShutterSound() {
    try {
      const ctx = this.getAudio();
      if (!ctx) return;
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = i === 0 ? 200 : 150;
        const start = ctx.currentTime + i * 0.04;
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);
        osc.start(start);
        osc.stop(start + 0.05);
      }
    } catch(e) {}
  },

  playConnectSound() {
    try {
      const ctx = this.getAudio();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  },

  // ===== DUO MACHINE BRIDGE =====
  //
  // The DuoSession object calls into these when it needs the app to do
  // something the state machine alone can't (UI rendering, audio playback,
  // domain actions like pickRetake). See js/duo-state.js for the contract.

  _onDuoEvent(evt) {
    if (!evt || !evt.kind) return;
    if (evt.kind === 'transition') {
      // CONNECTED → rebuild layout chips so any newly-available duo layouts
      // show up on rejoin. PICKING/CAPTURING/FINALIZING/REVEALED transitions
      // are surfaced to the topbar via the status text.
      if (evt.next === DUO_STATES.CONNECTED) {
        this.buildLayoutChips();
      }
      this._syncDuoMirror();
    } else if (evt.kind === 'warning') {
      this._surfaceInlineError(evt.text);
    } else if (evt.kind === 'partner-left') {
      this._showPartnerLeftBanner(evt.reason);
    } else if (evt.kind === 'partner-back') {
      this._hidePartnerLeftBanner();
    }
  },

  _syncDuoMirror() {
    // Keep local mirror fields in sync. The app keeps using sessionShots /
    // multiShots / pairPartnerShots for canvas drawing — these are the
    // "view" of the duo state. The duo object is the model.
    if (!this.duo) return;
    this.duo.shots = this.duo.shots.length ? this.duo.shots : (this.sessionShots || []);
    this.duo.partnerShots = this.pairPartnerShots || this.duo.partnerShots;
  },

  _handlePartnerRetake() {
    // Called when partner acks our retakeAll. Reset local state to match.
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.multiShotCancelled = false;
    this._captureChainActive = false;
    if (this.duo) this.duo.clearLocal();
    this.showScreen('stage');
    setTimeout(() => this.initFrameOverlay(), 100);
  },

  _handlePartnerFinalizePair() {
    // Partner declared pair composite starting. If we have unsent pairShots
    // queued, the duo machine has already routed them via recordShot. We just
    // need to make sure `pairPartnerShots` is initialised and reset so the
    // peer's finalizePairCapture can read what we send.
    this.pairPartnerShots = this.pairPartnerShots || [];
  },

  _adoptPartnerReveal(dataURL) {
    // The partner published a finalReveal — adopt their image so both peers
    // reach REVEALED with the IDENTICAL canvas (issue 020).
    this.capturedImage = dataURL;
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this._captureChainActive = false;
    this.showReveal();
  },

  // ===== UI HELPERS =====

  _surfaceInlineError(text) {
    // Inline error card. No `alert()` (forbidden by Lane 1 brief). Auto-
    // dismissed after 6 s; tap to dismiss sooner.
    let card = document.getElementById('duo-inline-error');
    if (!card) {
      card = document.createElement('div');
      card.id = 'duo-inline-error';
      card.className = 'duo-inline-error';
      card.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 80px);transform:translateX(-50%);z-index:180;background:var(--paper);border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink-sh);padding:12px 16px;max-width:340px;border-radius:10px;font-family:Caveat,cursive;font-size:18px;color:var(--ink);text-align:center;cursor:pointer';
      document.body.appendChild(card);
      card.onclick = () => card.remove();
    }
    card.textContent = text;
    setTimeout(() => { if (card && card.parentNode) card.remove(); }, 6000);
  },

  _showPairProgress(mine, theirs) {
    // Issue 032 — visible "joining your pair..." overlay during the bounded
    // wait. Has a cancel button that returns to the pick screen.
    let overlay = document.getElementById('pair-progress');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pair-progress';
      overlay.className = 'pair-progress';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:170;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:24px';
      overlay.innerHTML = `
        <div style="background:var(--paper);border:3px solid var(--ink);box-shadow:0 6px 0 var(--ink-sh);max-width:340px;width:100%;padding:24px;border-radius:14px;text-align:center">
          <div style="font-family:Fraunces,serif;font-size:22px;margin-bottom:6px">joining your pair…</div>
          <div id="pair-progress-line" style="font-family:Space Mono,monospace;font-size:12px;opacity:.7;margin-bottom:18px">0 of 4 photos received</div>
          <div style="height:6px;background:var(--ink);border-radius:3px;overflow:hidden;margin-bottom:18px">
            <div id="pair-progress-bar" style="height:100%;width:0%;background:var(--acc);transition:width .25s ease"></div>
          </div>
          <button id="pair-progress-cancel" class="k w">CANCEL</button>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#pair-progress-cancel').onclick = () => {
        if (overlay._onCancel) overlay._onCancel();
      };
    }
    const bar = overlay.querySelector('#pair-progress-bar');
    const line = overlay.querySelector('#pair-progress-line');
    overlay.style.display = 'flex';
    overlay._onCancel = null;
    const api = {
      update(mine, theirs) {
        const pct = Math.min(100, Math.round((theirs / 4) * 100));
        if (bar) bar.style.width = pct + '%';
        if (line) line.textContent = theirs + ' of 4 photos received';
      },
      done() {
        if (overlay && overlay.parentNode) overlay.remove();
      },
    };
    Object.defineProperty(api, 'onCancel', {
      get() { return overlay._onCancel; },
      set(v) { overlay._onCancel = v; },
    });
    return api;
  },

  _surfacePartnerMissingModal() {
    // Issue 017 — partner never sent any pairShots. Modal: PROCEED ALONE
    // (use only host side) or RETRY (cancel and try again).
    return new Promise((resolve) => {
      let m = document.getElementById('partner-missing-modal');
      if (!m) {
        m = document.createElement('div');
        m.id = 'partner-missing-modal';
        m.className = 'partner-missing-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:190;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:24px';
        m.innerHTML = `
          <div style="background:var(--paper);border:3px solid var(--ink);box-shadow:0 6px 0 var(--ink-sh);max-width:380px;width:100%;padding:24px;border-radius:14px;text-align:center">
            <div style="font-family:Fraunces,serif;font-size:22px;margin-bottom:6px">we couldn't reach your person</div>
            <div style="font-family:Caveat,cursive;font-size:18px;color:var(--acc);margin-bottom:14px">their photos didn't arrive</div>
            <div style="font-family:Space Mono,monospace;font-size:11px;opacity:.6;margin-bottom:18px">Print your side alone, or retake the whole session.</div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <button id="pmm-proceed" class="k p">PRINT MY SIDE</button>
              <button id="pmm-retake" class="k w">RETAKE</button>
            </div>
          </div>`;
        document.body.appendChild(m);
      }
      m.style.display = 'flex';
      const cleanup = () => { if (m && m.parentNode) m.remove(); };
      m.querySelector('#pmm-proceed').onclick = () => { cleanup(); resolve(true); };
      m.querySelector('#pmm-retake').onclick = () => { cleanup(); resolve(false); };
    });
  },

  _showPartnerLeftBanner(reason) {
    let banner = document.getElementById('partner-left-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'partner-left-banner';
      banner.className = 'partner-left-banner';
      banner.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translateX(-50%);z-index:160;background:var(--paper);border:2px solid var(--ink);box-shadow:0 3px 0 var(--ink-sh);padding:8px 14px;border-radius:10px;font-family:Caveat,cursive;font-size:16px;color:var(--ink);display:flex;gap:10px;align-items:center';
      const txt = document.createElement('span');
      txt.id = 'partner-left-text';
      const actions = document.createElement('span');
      actions.style.cssText = 'display:flex;gap:6px';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'k y';
      copyBtn.style.cssText = 'padding:4px 10px;font-size:11px';
      copyBtn.textContent = 'COPY LINK';
      copyBtn.onclick = () => this.copyRoomCode();
      const leaveBtn = document.createElement('button');
      leaveBtn.className = 'k w';
      leaveBtn.style.cssText = 'padding:4px 10px;font-size:11px';
      leaveBtn.textContent = 'LEAVE';
      leaveBtn.onclick = () => this.goHome();
      actions.appendChild(copyBtn);
      actions.appendChild(leaveBtn);
      banner.appendChild(txt);
      banner.appendChild(actions);
      document.body.appendChild(banner);
    }
    const t = document.getElementById('partner-left-text');
    if (t) t.textContent = reason === 'connection-close'
      ? 'your person left — copy the link to invite them back'
      : 'your person stepped away — copy the link to invite them back';
    banner.style.display = 'flex';
    this._partnerLeftBanner = true;
  },

  _hidePartnerLeftBanner() {
    const banner = document.getElementById('partner-left-banner');
    if (banner) banner.style.display = 'none';
    this._partnerLeftBanner = false;
  },
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => app.init());
