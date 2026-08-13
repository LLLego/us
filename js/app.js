// ===== us — Dual-Camera Photobooth =====
// "two places, one frame."

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
  currentFrame: 'none',
  currentLayout: 'single',
  multiShots: [],        // accumulated captures for multi-shot layouts
  multiShotInProgress: false,
  multiShotCancelled: false,

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
    this.buildFrameChips();
    this.buildLayoutChips();
    this.loadGalleryPreview();
    
    // Preload sticker images for frames
    if (typeof preloadStickers !== 'undefined') {
      preloadStickers();
    }

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

    // Local photos
    if (this.gallery.length > 0) {
      photos = [...this.gallery.slice(0, 4)];
    }

    // Cloud photos (dedup by url)
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
      img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border:1px solid var(--fg);box-shadow:2px 2px 0 var(--fg);cursor:pointer';
      img.onclick = () => app.openGallery();
      // Graceful fallback if image fails to load
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

  goHome() {
    this.stopFramePreview();
    const sheet = document.getElementById('frame-sheet');
    if (sheet) sheet.style.display = 'none';
    this.frameSheetOpen = false;
    this.stopCamera();
    this.cleanupPeer();
    this.multiShotCancelled = true; // halt any in-progress multi-shot
    this.multiShots = [];
    this.multiShotInProgress = false;
    this.showScreen('landing');
    this.loadGalleryPreview();
    // Clear URL
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
    }).catch(() => {
      // Camera failed, error already shown
    });
  },

  startTogether(joining = false) {
    this.mode = 'together';

    if (joining) {
      // Joining existing room
      this.showScreen('room');
      document.getElementById('room-title').textContent = 'Join Room';
      document.getElementById('room-create').style.display = 'none';
      document.getElementById('room-join').style.display = 'block';
      const input = document.getElementById('room-code-input');
      if (this.roomCode) input.value = this.roomCode;
      input.focus();
    } else {
      // Create new room
      this.isHost = true;
      this.roomCode = this.generateRoomCode();
      this.showScreen('room');
      document.getElementById('room-title').textContent = 'Your Room';
      document.getElementById('room-create').style.display = 'block';
      document.getElementById('room-join').style.display = 'none';
      document.getElementById('room-code-display').textContent = this.roomCode;

      // Start camera + PeerJS
      this.startCamera().then(() => {
        this.initPeerJS();
      }).catch(() => {});
    }
  },

  // ===== CAMERA =====
  async startCamera() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: this.mode === 'together',
      });
      const video = document.getElementById('local-video');
      video.srcObject = this.localStream;
      this.applyFilterToVideo();
    } catch (err) {
      alert('We need your camera for this to work.\n\nCheck your browser settings and try again.\n\nError: ' + err.message);
      throw err; // propagate so callers can react
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

  async switchCamera() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.localStream) {
      this.stopCamera();
      await this.startCamera();
      // Re-add tracks to peer connection if connected
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
    if (rh) rh.style.display = 'none';
    if (vd) vd.style.display = 'none';
  },

  showRemote() {
    const rh = document.getElementById('remote-half');
    const vd = document.getElementById('video-divider');
    if (rh) rh.style.display = 'block';
    if (vd) vd.style.display = 'block';
  },

  // ===== FILTERS UI =====
  buildFilterChips() {
    const row = document.getElementById('filter-row');
    if (!row) return;
    row.innerHTML = '';
    for (const [key, f] of Object.entries(FILTERS)) {
      const chip = document.createElement('button');
      chip.className = 'filter-chip' + (key === this.currentFilter ? ' active' : '');
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
      // Also apply to remote video
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
      const chip = document.createElement('button');
      chip.className = 'frame-chip' + (key === this.currentFrame ? ' active' : '');
      chip.textContent = f.name;
      chip.dataset.frame = key;
      chip.onclick = () => this.setFrame(key);
      row.appendChild(chip);
    }
  },

  setFrame(key) {
    this.currentFrame = key;
    this.updateFrameOverlay();
    // Update visual thumbnails active state
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
    
    // Resize canvas to match container
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
    
    // Draw current frame at semi-transparent during browse, full when locked
    const frameDef = FRAMES[this.currentFrame];
    if (frameDef && this.currentFrame !== 'none') {
      ctx.save();
      if (this.frameSheetOpen) {
        ctx.globalAlpha = 0.5; // ghost mode while browsing
      }
      frameDef.draw(ctx, w, h);
      ctx.restore();
    }
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
    
    if (this.frameSheetOpen) {
      // Close
      sheet.style.transform = 'translateY(100%)';
      this.frameSheetOpen = false;
      setTimeout(() => { sheet.style.display = 'none'; }, 300);
    } else {
      // Open
      sheet.style.display = 'flex';
      this.frameSheetOpen = true;
      requestAnimationFrame(() => {
        sheet.style.transform = 'translateY(0)';
      });
      this.buildFrameThumbnails();
    }
    this.drawFrameOverlay();
  },
  
  buildFrameThumbnails() {
    const container = document.getElementById('frame-thumbnails');
    if (!container) return;
    container.innerHTML = '';
    
    for (const [key, frame] of Object.entries(FRAMES)) {
      // Category filter
      if (this.frameCategory !== 'all' && frame.category && frame.category !== this.frameCategory) continue;
      
      const thumb = document.createElement('div');
      thumb.className = 'frame-thumb' + (key === this.currentFrame ? ' active' : '');
      thumb.dataset.frame = key;
      thumb.style.cssText = 'flex-shrink:0;width:54px;height:72px;cursor:pointer;position:relative;border:2px solid var(--fg);box-shadow:2px 2px 0 var(--fg);transition:all 0.2s ease';
      
      // Mini canvas showing frame on placeholder
      const mini = document.createElement('canvas');
      mini.width = 108;
      mini.height = 144;
      mini.style.cssText = 'width:100%;height:100%;display:block';
      const mctx = mini.getContext('2d');
      
      // Draw placeholder background (warm gradient simulating a photo)
      const grad = mctx.createLinearGradient(0, 0, 108, 144);
      grad.addColorStop(0, '#E8C4A0');
      grad.addColorStop(0.5, '#D4A080');
      grad.addColorStop(1, '#A07050');
      mctx.fillStyle = grad;
      mctx.fillRect(0, 0, 108, 144);
      
      // Simple face silhouette
      mctx.fillStyle = 'rgba(255,220,180,0.7)';
      mctx.beginPath();
      mctx.arc(54, 55, 22, 0, Math.PI * 2);
      mctx.fill();
      mctx.fillRect(34, 75, 40, 50);
      
      // Draw frame on top
      if (frame.draw) frame.draw(mctx, 108, 144);
      
      thumb.appendChild(mini);
      
      // Name label
      const label = document.createElement('div');
      label.textContent = frame.name;
      label.style.cssText = 'position:absolute;bottom:-18px;left:0;right:0;text-align:center;font-family:Space Mono,monospace;font-size:7px;text-transform:uppercase;letter-spacing:0.05em;color:var(--fg);opacity:0.6;white-space:nowrap;overflow:hidden';
      thumb.appendChild(label);
      
      thumb.onclick = () => {
        this.setFrame(key);
      };
      
      // Add margin for label
      thumb.style.marginBottom = '20px';
      
      container.appendChild(thumb);
    }
    
    // Category tab handlers
    document.querySelectorAll('.frame-cat-btn').forEach(btn => {
      btn.onclick = () => {
        this.frameCategory = btn.dataset.cat;
        document.querySelectorAll('.frame-cat-btn').forEach(b => {
          b.style.background = 'var(--bg)';
          b.style.color = 'var(--fg)';
        });
        btn.style.background = 'var(--fg)';
        btn.style.color = 'var(--bg)';
        this.buildFrameThumbnails();
      };
    });
  },

  // ===== LAYOUTS UI =====
  buildLayoutChips() {
    const row = document.getElementById('layout-row');
    if (!row) return;
    row.innerHTML = '';
    for (const [key, l] of Object.entries(LAYOUTS)) {
      const chip = document.createElement('button');
      chip.className = 'frame-chip layout-chip' + (key === this.currentLayout ? ' active' : '');
      chip.textContent = l.name;
      chip.dataset.layout = key;
      chip.onclick = () => this.setLayout(key);
      row.appendChild(chip);
    }
  },

  setLayout(key) {
    this.currentLayout = key;
    this.multiShots = [];
    this.multiShotInProgress = false;
    this.multiShotCancelled = false;
    document.querySelectorAll('#layout-row .frame-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.layout === key);
    });
    // Update shutter button label
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
          void numEl.offsetWidth; // force reflow
          numEl.style.animation = 'fadeInUp 0.5s ease-out';
          this.playTickSound();
          count--;
          setTimeout(tick, 1000);
        } else {
          // FLASH
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
  async capture() {
    const shutterBtn = document.getElementById('shutter-btn');
    shutterBtn.disabled = true;

    const layout = LAYOUTS[this.currentLayout];

    try {
      if (layout && layout.shots > 1) {
        // Multi-shot mode
        this.multiShotInProgress = true;
        this.multiShotCancelled = false;

        await this.countdown(3);

        if (this.multiShotCancelled) return;

        // Capture single frame to temp canvas
        const shotData = this.captureSingleFrame();
        this.multiShots.push(shotData);

        const shotNum = this.multiShots.length;

        if (shotNum < layout.shots) {
          // More shots needed
          shutterBtn.title = `Shot ${shotNum + 1} of ${layout.shots}`;
          // Quick visual feedback
          this.flashFeedback();
          shutterBtn.disabled = false;
          // Auto-countdown for next shot after a short breather
          setTimeout(() => {
            if (!this.multiShotCancelled) this.capture();
          }, 1500);
          return;
        }

        // All shots taken — composite them (await the async result!)
        await this.compositeMultiShot();
      } else {
        // Single shot
        await this.countdown(3);
        if (this.multiShotCancelled) return;
        this.composite();
      }

      this.showReveal();
      this.multiShots = [];
      this.multiShotInProgress = false;
    } catch (err) {
      console.error('Capture error:', err);
      alert('Something went wrong while capturing. Please try again.');
    } finally {
      shutterBtn.disabled = false;
    }
  },

  flashFeedback() {
    const flash = document.getElementById('flash');
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 120);
  },

  captureSingleFrame() {
    // Capture current video to a temp canvas, return dataURL
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const hasRemote = this.mode === 'together' && remoteVideo && remoteVideo.srcObject;

    const tmp = document.createElement('canvas');
    // Portrait aspect ratio 4:5 (1080×1350) for each shot
    const W = 1080;
    const H = 1350;
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext('2d');

    tctx.fillStyle = '#F2EBE0';
    tctx.fillRect(0, 0, W, H);

    const filterDef = FILTERS[this.currentFilter];
    tctx.filter = filterDef ? filterDef.canvas : 'none';

    if (hasRemote) {
      const gutter = 12;
      const halfW = (W - gutter) / 2;
      this.drawCover(tctx, localVideo, 0, 0, halfW, H);
      this.drawCover(tctx, remoteVideo, halfW + gutter, 0, halfW, H);
    } else {
      this.drawCover(tctx, localVideo, 0, 0, W, H);
    }

    tctx.filter = 'none';
    return tmp.toDataURL('image/jpeg', 0.92);
  },

  // Returns a Promise that resolves when compositing is complete
  compositeMultiShot() {
    const layout = LAYOUTS[this.currentLayout];
    const shots = this.multiShots;
    const W = 1080;
    let H;

    // Calculate canvas size based on layout
    if (this.currentLayout === 'strip-4') {
      // Each cell is ~4:5 aspect, 4 stacked vertically + gaps
      const gap = 16;
      const cellW = W - gap * 2;
      const cellH = Math.round(cellW * 5 / 4); // 4:5 per cell
      H = cellH * 4 + gap * 5;
    } else if (this.currentLayout === 'strip-3') {
      const gap = 16;
      const cellW = W - gap * 2;
      const cellH = Math.round(cellW * 5 / 4);
      H = cellH * 3 + gap * 4;
    } else if (this.currentLayout === 'grid-2x2') {
      // Square canvas: 2 cols × 2 rows
      H = W;
    } else {
      H = 1350;
    }

    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.ctx;

    // Background
    ctx.fillStyle = '#F2EBE0';
    ctx.fillRect(0, 0, W, H);

    const gap = 16;

    // Load all images then draw — RETURN the promise so caller can await
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
        // No filter on composite level — each shot already has filter baked in
        ctx.filter = 'none';

        if (this.currentLayout === 'strip-4' || this.currentLayout === 'strip-3') {
          // Vertical strip
          const cellH = (H - gap * (shots.length + 1)) / shots.length;
          const cellW = W - gap * 2;
          images.forEach((img, i) => {
            const y = gap + i * (cellH + gap);
            this.drawCover(ctx, img, gap, y, cellW, cellH);
          });
        } else if (this.currentLayout === 'grid-2x2') {
          // 2x2 grid
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

        // Draw frame on top
        ctx.filter = 'none';
        const frameDef = FRAMES[this.currentFrame];
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

    // Canvas dimensions (portrait for photobooth feel)
    const W = 1080;
    const H = 1350;

    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.ctx;

    // Fill background
    ctx.fillStyle = '#F2EBE0';
    ctx.fillRect(0, 0, W, H);

    // Apply filter
    const filterDef = FILTERS[this.currentFilter];
    ctx.filter = filterDef ? filterDef.canvas : 'none';

    if (hasRemote) {
      // Dual mode — side by side
      const gutter = 12;
      const halfW = (W - gutter) / 2;

      // Local (left) — un-mirror for export (video is CSS-mirrored but canvas draws raw)
      this.drawCover(ctx, localVideo, 0, 0, halfW, H);
      // Remote (right)
      this.drawCover(ctx, remoteVideo, halfW + gutter, 0, halfW, H);
    } else {
      // Solo mode — full frame
      this.drawCover(ctx, localVideo, 0, 0, W, H);
    }

    // Reset filter for frame
    ctx.filter = 'none';

    // Draw frame
    const frameDef = FRAMES[this.currentFrame];
    if (frameDef) frameDef.draw(ctx, W, H);

    // Store result
    this.capturedImage = this.canvas.toDataURL('image/jpeg', 0.92);
  },

  drawCover(ctx, source, x, y, w, h) {
    // Object-fit: cover math
    const sw = source.videoWidth || source.width || source.naturalWidth || 1280;
    const sh = source.videoHeight || source.height || source.naturalHeight || 720;
    const sRatio = sw / sh;
    const dRatio = w / h;
    let sx, sy, sWidth, sHeight;

    if (sRatio > dRatio) {
      // Source is wider — crop sides
      sHeight = sh;
      sWidth = sh * dRatio;
      sx = (sw - sWidth) / 2;
      sy = 0;
    } else {
      // Source is taller — crop top/bottom
      sWidth = sw;
      sHeight = sw / dRatio;
      sx = 0;
      sy = (sh - sHeight) / 2;
    }

    ctx.drawImage(source, sx, sy, sWidth, sHeight, x, y, w, h);
  },

  // ===== REVEAL =====
  showReveal() {
    if (!this.capturedImage) {
      console.error('No captured image to show');
      return;
    }

    this.showScreen('reveal');

    const polaroid = document.getElementById('reveal-polaroid');
    const canvas = document.getElementById('reveal-canvas');
    const dateEl = document.getElementById('reveal-date');

    // Draw captured image to reveal canvas
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Trigger develop animation
      polaroid.classList.remove('developed');
      setTimeout(() => polaroid.classList.add('developed'), 100);
    };
    img.onerror = () => console.error('Failed to load captured image for reveal');
    img.src = this.capturedImage;

    // Date stamp
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit'
    });
    dateEl.textContent = `${dateStr} · ${timeStr}`;

    // Slight random rotation
    const rot = (Math.random() - 0.5) * 3;
    polaroid.style.transform = `rotate(${rot}deg)`;

    // Save to gallery (local + cloud)
    this.addToGallery(this.capturedImage);

    // Upload to Supabase (cloud gallery)
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
  downloadPhoto() {
    if (!this.capturedImage) return;
    const link = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `us_${this.mode}_${ts}.jpg`;
    link.href = this.capturedImage;
    link.click();
  },

  // ===== GALLERY =====
  addToGallery(dataURL) {
    this.gallery.unshift({ url: dataURL, time: Date.now() });
    this.saveGallery();
  },

  saveGallery() {
    try {
      // Only keep last 20 to avoid localStorage limits (~5MB)
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

    // Load both local + cloud photos (dedup by url)
    let photos = [...this.gallery];

    // Try loading from Supabase
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

    // Sort newest first
    photos.sort((a, b) => (b.time || b.created || 0) - (a.time || a.created || 0));

    grid.innerHTML = '';
    photos.forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative';

      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.onclick = () => {
        // Safe open — use DOM API, no innerHTML injection
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

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.innerHTML = '✕';
      delBtn.style.cssText = 'position:absolute;top:4px;right:4px;width:28px;height:28px;background:rgba(24,20,16,0.8);color:#F2EBE0;border:1px solid #F2EBE0;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;z-index:5';
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
    // Remove from local gallery
    const localIdx = this.gallery.findIndex(g => g.url === item.url);
    if (localIdx >= 0) {
      this.gallery.splice(localIdx, 1);
      this.saveGallery();
    }
    // Delete from Supabase cloud
    if (typeof storage !== 'undefined' && item.url) {
      await storage.deletePhoto(item.url);
    }
    // Remove from DOM
    if (element) element.remove();
    console.log('Photo deleted');
  },

  // ===== ROOM CODE =====
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
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
        // Fallback for browsers without clipboard API
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
    // Clean up any existing peer
    this.cleanupPeer();

    const peerId = `us-${this.roomCode}-${this.isHost ? 'host' : 'guest'}`;
    this.peer = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          // Free TURN relay (may be unreliable — consider a paid TURN for production)
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ],
      },
    });

    // Register ALL event handlers immediately (not inside 'open')
    // to avoid missing events due to race conditions.

    this.peer.on('open', (id) => {
      this.updateStatus('connecting', 'CONNECTING');

      if (this.isHost) {
        // Host waits for guest. Data connection + call handlers are below.
        this.updateStatus('connecting', 'WAITING');
      } else {
        // Guest connects to host's data channel
        const hostId = `us-${this.roomCode}-host`;
        const conn = this.peer.connect(hostId, { reliable: true });
        this.setupDataConnection(conn);

        // When data channel opens, call the host with our stream
        conn.on('open', () => {
          const call = this.peer.call(hostId, this.localStream);
          if (call) {
            this.setupCall(call);
          }
        });
      }
    });

    // HOST: receive data connection from guest
    this.peer.on('connection', (conn) => {
      this.setupDataConnection(conn);
    });

    // BOTH: handle incoming media call (answer with our stream)
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
        // Another tab/window already has this peer ID
        alert('This room is already open in another tab. Please close it and try again.');
        this.goHome();
      } else if (err.type === 'network' || err.type === 'server-error') {
        alert('Connection issue. Please check your internet and try again.');
      }
    });

    this.peer.on('disconnected', () => {
      // Attempt reconnection
      if (this.peer && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch(e) {}
      }
    });
  },

  setupDataConnection(conn) {
    this.dataConnection = conn;

    conn.on('open', () => {
      if (this.isHost) {
        // Host now calls the guest (one-directional call to avoid glare)
        const call = this.peer.call(conn.peer, this.localStream);
        if (call) this.setupCall(call);
      }
      this.updateStatus('connected', this.mode === 'together' ? 'PAIRED' : 'CONNECTED');
    });

    conn.on('data', (data) => {
      if (data && data.action === 'capture') {
        this.handleSyncedCapture(data.captureTime);
      }
    });

    conn.on('close', () => {
      this.dataConnection = null;
      this.updateStatus('', 'DISCONNECTED');
      // Don't auto-goHome — let user decide
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
  handleSyncedCapture(captureTime) {
    const delay = captureTime - Date.now();
    if (delay > 0) {
      setTimeout(() => this.capture(), delay);
    } else {
      this.capture();
    }
  },

  requestSyncedCapture() {
    if (this.dataConnection && this.dataConnection.open) {
      const captureTime = Date.now() + 3500; // 3.5s from now (3s countdown + buffer)
      this.dataConnection.send({ action: 'capture', captureTime });
      this.handleSyncedCapture(captureTime);
    } else {
      // Not connected or solo — just capture locally
      this.capture();
    }
  },

  // ===== STATUS =====
  updateStatus(state, text) {
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (dot) dot.className = 'status-dot ' + state;
    if (txt) txt.textContent = text;
  },

  // ===== SOUNDS (Web Audio API) =====
  audioCtx: null,

  getAudio() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.audioCtx = new AC();
    }
    // Resume if suspended (autoplay policy)
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
      // Two quick clicks for mechanical shutter feel
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
      osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  },
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => app.init());
