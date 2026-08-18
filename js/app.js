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

  // Canvas
  canvas: null,
  ctx: null,

  // ===== INIT =====
  init() {
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
    if (!this.dropFrameKey) this.computeMonthlyDrop();
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
    // Mirror pick to partner if connected
    if (this.dataConnection && this.dataConnection.open) {
      try { this.dataConnection.send({ action: 'setFrame', key: this.currentFrame }); } catch(e) {}
    }
    this.startSolo();
  },

  // ===== PICK-YOUR-BEST-FOUR (v3) =====
  shotsNeededForLayout(layoutKey) {
    // 2x the slots for multi-shot layouts, so the user can pick the best ones.
    // Single-shot layouts skip the pick screen.
    const layout = (typeof LAYOUTS !== 'undefined') ? LAYOUTS[layoutKey] : null;
    if (!layout || layout.shots <= 1) return 1;
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
        check.textContent = String(ord + 1);
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
    // v1 simplification: retake the WHOLE session (per-slot retake is a v2 feature)
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.multiShotCancelled = false;
    this.showScreen('stage');
    setTimeout(() => this.initFrameOverlay(), 100);
  },

  async pickPrint() {
    const total = (typeof LAYOUTS !== 'undefined') ? (LAYOUTS[this.currentLayout] ? LAYOUTS[this.currentLayout].shots : 4) : 4;
    if (this.pickedIndices.length !== total) return;

    // Order multiShots by tap order so the composite reflects picks left-to-right / top-to-bottom
    const ordered = this.pickedIndices.map(i => this.sessionShots[i]);
    this.multiShots = ordered;

    if (this.currentLayout === 'pair') {
      await this.finalizePairCapture();
    } else {
      await this.compositeMultiShot();
      this.showReveal();
      // duo: share our final strip with the partner so both reach the reveal
      if (this.mode === 'together' && this.dataConnection && this.dataConnection.open) {
        try { this.dataConnection.send({ action: 'finalStrip', data: this.capturedImage }); } catch(e) {}
      }
    }

    // Reset
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
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
    this.stopCamera();
    this.cleanupPeer();
    this.multiShotCancelled = true;
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.showScreen('landing');
    this.loadGalleryPreview();
    window.history.replaceState({}, '', window.location.pathname);
  },

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

    if (joining) {
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
      this.showScreen('room');
      document.getElementById('room-title').textContent = 'Your Room';
      document.getElementById('room-create').style.display = 'block';
      document.getElementById('room-join').style.display = 'none';
      document.getElementById('room-code-display').textContent = this.roomCode;

      this.startCamera().then(() => {
        this.showScreen('stage');
        setTimeout(() => this.initFrameOverlay(), 100);
        this.showRoomPill('WAITING · CODE ' + this.roomCode);
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

  setFrame(key) {
    this.currentFrame = key;
    this.applyPreviewAspect();
    this.updateFrameOverlay();
    if (this.dataConnection && this.dataConnection.open) {
      try { this.dataConnection.send({ action: 'setFrame', key }); } catch(e) {}
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

  setLayout(key) {
    if (!FramesNext.supports(key) && FRAMES[this.currentFrame] && FRAMES[this.currentFrame].framesNext) {
      key = 'strip-4';
    }
    const ddef = LAYOUTS[key];
    if (ddef && ddef.duoOnly && this.mode !== 'together') key = 'strip-4';
    this.currentLayout = key;
    if (this.dataConnection && this.dataConnection.open) {
      try { this.dataConnection.send({ action: 'setLayout', key }); } catch(e) {}
    }
    this.applyPreviewAspect();
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.multiShotCancelled = false;
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

    overlay.classList.add('active');

    return new Promise(resolve => {
      let count = seconds;
      const tick = () => {
        if (count > 0) {
          numEl.textContent = count;
          numEl.style.animation = 'none';
          void numEl.offsetWidth;
          numEl.style.animation = 'fadeInUp 0.5s ease-out';
          this.playTickSound();
          if (this.mode === 'together' && this.dataConnection && this.dataConnection.open && this.isHost) {
            try { this.dataConnection.send({ action: 'sharedTick', n: count }); } catch(e) {}
          }
          count--;
          setTimeout(tick, 1000);
        } else {
          flash.classList.add('active');
          this.playShutterSound();
          setTimeout(() => {
            flash.classList.remove('active');
            overlay.classList.remove('active');
            resolve();
          }, 150);
        }
      };
      tick();
    });
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

        if (shotNum < targetShots) {
          shutterBtn.title = `Shot ${shotNum + 1} of ${targetShots}`;
          this.flashFeedback();
          shutterBtn.disabled = false;
          setTimeout(() => {
            if (!this.multiShotCancelled) this.capture(true);
          }, 1500);
          return;
        }

        // All shots captured — go to PICK-YOUR-BEST-FOUR (skipped for pair v1 — see notes)
        shutterBtn.disabled = false;
        if (this.currentLayout === 'pair') {
          // pair v1: just composite everything in tap order, no pick screen
          this._captureChainActive = false;
          await this.finalizePairCapture();
          return;
        }
        this.openPickScreen();
        this.multiShots = [];
        this.multiShotInProgress = false;
        this._captureChainActive = false;
        return;
      } else {
        // Single shot — straight to reveal (no pick screen)
        await this.countdown(3);
        if (this.multiShotCancelled) return;
        await this.composite();
      }

      this.showReveal();
      this.multiShots = [];
      this.sessionShots = [];
      this.pickedIndices = [];
      this.multiShotInProgress = false;
      this._captureChainActive = false;
    } catch (err) {
      console.error('Capture error:', err);
      this._captureChainActive = false;
      alert('Something went wrong while capturing. Please try again.');
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
  async finalizePairCapture() {
    const mine = [...this.multiShots.length ? this.multiShots : this.sessionShots];
    this.pairPartnerShots = this.pairPartnerShots || [];
    for (let i = 0; i < 24 && this.pairPartnerShots.length < 4; i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    const theirs = this.pairPartnerShots.slice(0, 4);
    const isHost = this.isHost;
    const ordered = isHost
      ? [...mine, ...theirs, ...Array(Math.max(0, 8 - mine.length - theirs.length)).fill(mine[mine.length-1] || theirs[0])]
      : [...theirs, ...mine, ...Array(Math.max(0, 8 - mine.length - theirs.length)).fill(mine[mine.length-1] || theirs[0])];
    this.multiShots = ordered.slice(0, 8);
    try { await this.compositeMultiShot(); } catch (e) { console.warn('pair composite failed', e); }
    this.showReveal();
    this.multiShots = [];
    this.sessionShots = [];
    this.pickedIndices = [];
    this.multiShotInProgress = false;
    this.pairPartnerShots = [];
    document.getElementById('shutter-btn').disabled = false;
  },

  compositeMultiShot() {
    const layout = LAYOUTS[this.currentLayout];
    const shots = this.multiShots;
    const W = 1080;
    let H;

    if (this.currentLayout === 'strip-4') {
      const gap = 16;
      const cellW = W - gap * 2;
      const cellH = Math.round(cellW * 5 / 4);
      H = cellH * 4 + gap * 5;
    } else if (this.currentLayout === 'strip-3') {
      const gap = 16;
      const cellW = W - gap * 2;
      const cellH = Math.round(cellW * 5 / 4);
      H = cellH * 3 + gap * 4;
    } else if (this.currentLayout === 'grid-2x2') {
      H = W;
    } else {
      H = 1350;
    }

    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.ctx;

    ctx.fillStyle = '#FAF3E6';
    ctx.fillRect(0, 0, W, H);

    const gap = 16;

    return new Promise((resolve, reject) => {
      const loadPromises = shots.map(dataURL => {
        return new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = dataURL;
        });
      });

      Promise.all(loadPromises).then(images => {
        ctx.filter = 'none';

        if (this.currentLayout === 'strip-4' || this.currentLayout === 'strip-3') {
          const cellH = (H - gap * (shots.length + 1)) / shots.length;
          const cellW = W - gap * 2;
          images.forEach((img, i) => {
            const y = gap + i * (cellH + gap);
            this.drawCover(ctx, img, gap, y, cellW, cellH);
          });
        } else if (this.currentLayout === 'grid-2x2') {
          const cellW = (W - gap * 3) / 2;
          const cellH = (H - gap * 3) / 2;
          images.forEach((img, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = gap + col * (cellW + gap);
            const y = gap + row * (cellH + gap);
            this.drawCover(ctx, img, x, y, cellW, cellH);
          });
        }

        ctx.filter = 'none';
        const frameDef = FRAMES[this.currentFrame];
        if (frameDef && frameDef.framesNext) {
          FramesNext.renderToCanvas(this.currentFrame.replace('nx-',''),
            this.currentLayout, this.canvas, this.multiShots)
            .then(ok => {
              this.capturedImage = this.canvas.toDataURL('image/jpeg', 0.92);
              resolve();
            })
            .catch(e => {
              console.warn('[frames-next] render failed, falling back', e);
              this.capturedImage = this.canvas.toDataURL('image/jpeg', 0.92);
              resolve();
            });
          return;
        }
        if (frameDef) frameDef.draw(ctx, W, H);

        this.capturedImage = this.canvas.toDataURL('image/jpeg', 0.92);
        resolve();
      }).catch(reject);
    });
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

    this.startCamera().then(() => {
      this.showScreen('stage');
      setTimeout(() => this.initFrameOverlay(), 100);
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
  },

  setupDataConnection(conn) {
    this.dataConnection = conn;

    conn.on('open', () => {
      if (this.isHost) {
        const call = this.peer.call(conn.peer, this.localStream);
        if (call) this.setupCall(call);
      }
      this.updateStatus('connected', this.mode === 'together' ? 'PAIRED' : 'CONNECTED');
      const active = document.querySelector('.screen.active');
      if (this.mode === 'together' && active && active.id === 'room') {
        this.showScreen('stage');
        setTimeout(() => this.initFrameOverlay(), 100);
      }
      if (this.mode === 'together' && this.isHost) {
        this.showRoomPill('CONNECTED · ' + this.roomCode, true);
      }
      try {
        conn.send({ action: 'setFrame', key: this.currentFrame });
        conn.send({ action: 'setLayout', key: this.currentLayout });
      } catch(e) {}
    });

    conn.on('data', (data) => {
      if (!data) return;
      if (data.action === 'sharedTick') {
        this.playTickSound();
      } else if (data.action === 'finalStrip' && data.data) {
        // partner finished picking — adopt their strip and join the reveal
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

    conn.on('close', () => {
      this.dataConnection = null;
      this.updateStatus('', 'DISCONNECTED');
    });

    conn.on('error', (err) => {
      console.error('Data connection error:', err);
    });
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
      this.dataConnection.send({ action: 'capture', captureTime, frame: this.currentFrame, layout: this.currentLayout });
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
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => app.init());
