// ===== us — Dual-Camera Photobooth =====
// "two places, one frame."

const app = {
  // State
  mode: null,        // 'solo' | 'together'
  localStream: null,
  remoteStream: null,
  peer: null,
  peerConnection: null,
  roomCode: null,
  isHost: false,
  facingMode: 'user',
  
  // Current settings
  currentFilter: 'none',
  currentFrame: 'none',
  
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
    
    // Check URL for room code
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      this.roomCode = code.toUpperCase();
      this.startTogether(true);
    }
  },
  
  // ===== SCREEN MANAGEMENT =====
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },
  
  goHome() {
    this.stopCamera();
    if (this.peer) { try { this.peer.destroy(); } catch(e){} this.peer = null; }
    this.showScreen('landing');
    // Clear URL
    window.history.replaceState({}, '', window.location.pathname);
  },
  
  // ===== MODE SELECTION =====
  startSolo() {
    this.mode = 'solo';
    this.hideRemote();
    this.startCamera().then(() => {
      this.showScreen('stage');
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
      document.getElementById('room-code-input').focus();
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
      });
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
      this.goHome();
    }
  },
  
  stopCamera() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
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
          if (newTrack) sender.replaceTrack(newTrack);
        }
      }
    }
  },
  
  hideRemote() {
    document.getElementById('remote-half').style.display = 'none';
    document.getElementById('video-divider').style.display = 'none';
  },
  
  showRemote() {
    document.getElementById('remote-half').style.display = 'block';
    document.getElementById('video-divider').style.display = 'block';
  },
  
  // ===== FILTERS UI =====
  buildFilterChips() {
    const row = document.getElementById('filter-row');
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
    if (f) {
      video.style.filter = f.css;
      // Also apply to remote video
      const remote = document.getElementById('remote-video');
      if (remote) remote.style.filter = f.css;
    }
  },
  
  // ===== FRAMES UI =====
  buildFrameChips() {
    const row = document.getElementById('frame-row');
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
    document.querySelectorAll('.frame-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.frame === key);
    });
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
    document.getElementById('shutter-btn').disabled = true;
    
    // Countdown
    await this.countdown(3);
    
    // Composite to canvas
    this.composite();
    
    // Show reveal
    this.showReveal();
    document.getElementById('shutter-btn').disabled = false;
  },
  
  // ===== COMPOSITE (canvas) =====
  composite() {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const hasRemote = this.mode === 'together' && remoteVideo.srcObject;
    
    // Canvas dimensions (portrait for photobooth feel)
    const W = 1080;
    const H = hasRemote ? 1350 : 1350;
    
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
      
      // Local (left) — un-mirror for export
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
    const sw = source.videoWidth || source.width || 1280;
    const sh = source.videoHeight || source.height || 720;
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
    
    // Save to gallery
    this.addToGallery(this.capturedImage);
  },
  
  retake() {
    this.showScreen('stage');
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
      // Only keep last 20 to avoid localStorage limits
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
  
  openGallery() {
    this.showScreen('gallery-screen');
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';
    
    if (this.gallery.length === 0) {
      grid.innerHTML = '<p class="gallery-empty">No memories yet.<br>Take one together.</p>';
      return;
    }
    
    this.gallery.forEach(item => {
      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.onclick = () => {
        // Open full size
        const w = window.open('', '_blank');
        w.document.write(`<img src="${item.url}" style="width:100%">`);
      };
      const img = document.createElement('img');
      img.src = item.url;
      div.appendChild(img);
      grid.appendChild(div);
    });
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
    } else {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied! Send it to your person.');
      });
    }
  },
  
  joinRoom() {
    const code = document.getElementById('room-code-input').value.toUpperCase().trim();
    if (code.length < 5) return;
    this.roomCode = code;
    this.isHost = false;
    
    this.startCamera().then(() => {
      this.showScreen('stage');
      this.initPeerJS();
    });
  },
  
  // ===== WEBRTC (PeerJS) =====
  initPeerJS() {
    const peerId = `us-${this.roomCode}-${this.isHost ? 'host' : 'guest'}`;
    this.peer = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          // Free TURN relay
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ],
      },
    });
    
    this.peer.on('open', (id) => {
      this.updateStatus('connecting', 'CONNECTING');
      
      if (this.isHost) {
        // Host waits for guest to connect
        this.peer.on('connection', (conn) => {
          this.dataConnection = conn;
          conn.on('open', () => {
            this.connectToPeer(conn.peer);
          });
        });
        this.peer.on('call', (call) => {
          call.answer(this.localStream);
          call.on('stream', (remoteStream) => {
            this.onRemoteStream(remoteStream);
          });
        });
      } else {
        // Guest connects to host
        const hostId = `us-${this.roomCode}-host`;
        const conn = this.peer.connect(hostId);
        this.dataConnection = conn;
        conn.on('open', () => {
          // Call the host with our stream
          const call = this.peer.call(hostId, this.localStream);
          call.on('stream', (remoteStream) => {
            this.onRemoteStream(remoteStream);
          });
        });
      }
    });
    
    // Handle incoming capture requests via data connection
    if (this.dataConnection) {
      this.dataConnection.on('data', (data) => {
        if (data && data.action === 'capture') {
          this.handleSyncedCapture(data.captureTime);
        }
      });
    }
    
    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      this.updateStatus('error', 'CONNECTION ERROR');
      if (err.type === 'peer-unavailable') {
        alert('Room not found. Check the code and try again.');
        this.goHome();
      }
    });
  },
  
  connectToPeer(peerId) {
    // Host calls the guest
    const call = this.peer.call(peerId, this.localStream);
    call.on('stream', (remoteStream) => {
      this.onRemoteStream(remoteStream);
    });
  },
  
  onRemoteStream(stream) {
    this.remoteStream = stream;
    const remoteVideo = document.getElementById('remote-video');
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
      const captureTime = Date.now() + 3500; // 3.5s from now
      this.dataConnection.send({ action: 'capture', captureTime });
      this.handleSyncedCapture(captureTime);
    } else {
      this.capture();
    }
  },
  
  // ===== STATUS =====
  updateStatus(state, text) {
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    dot.className = 'status-dot ' + state;
    txt.textContent = text;
  },
  
  // ===== SOUNDS (Web Audio API) =====
  audioCtx: null,
  
  getAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioCtx;
  },
  
  playTickSound() {
    try {
      const ctx = this.getAudio();
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
