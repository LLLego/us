// ===== FRAMES-NEXT BRIDGE v2 =====
// iOS-proof: pre-rendered transparent templates + pure canvas compositing.
// No hidden iframes, no html2canvas, no runtime Google Fonts on the device.

const FramesNext = {
  tpl: null,          // templates.json
  _pngs: new Map(),   // Image cache

  async init() {
    try {
      const res = await fetch('templates/templates.json');
      this.tpl = await res.json();
    } catch (e) {
      console.warn('[frames-next] templates not loaded:', e);
      this.tpl = { templates: [] };
    }
    // overlay host for the live stage preview
    this.overlayHost = document.createElement('div');
    this.overlayHost.style.cssText = 'position:absolute;left:-99999px;top:0;';
    document.body.appendChild(this.overlayHost);
  },

  entries() { return this.tpl ? this.tpl.templates : []; },

  get(key) { return this.entries().find(t => t.key === key) || null; },

  layoutKey(appLayout) {
    if (appLayout === 'strip-4') return 'strip';
    if (appLayout === 'grid-2x2') return 'grid';
    if (appLayout === 'single') return 'single';
    if (appLayout === 'duo-strip' || appLayout === 'duo-grid') return appLayout;
    return null;
  },

  supports(appLayout) { return this.layoutKey(appLayout) !== null; },

  _fmtDate() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  },

  _png(url) {
    if (this._pngs.has(url)) return this._pngs.get(url);
    const p = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('img fail ' + url));
      i.src = url;
    });
    this._pngs.set(url, p);
    p.catch(() => this._pngs.delete(url));
    return p;
  },

  // composite onto a canvas: template + photos (cover, rounded-clip) + live date
  async renderToCanvas(key, appLayout, canvas, photos) {
    const t = this.get(key);
    const lk = this.layoutKey(appLayout);
    if (!t || !lk) return false;
    const spec = t.layouts[lk];

    canvas.width = spec.w;
    canvas.height = spec.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, spec.w, spec.h);

    // 1. photos first (under the mat)
    const imgPs = (photos && photos.length ? photos : []).slice(0, spec.slots.length)
      .map(u => this._png(u));
    const imgs = await Promise.all(imgPs.map(p => p.catch(() => null)));

    spec.slots.forEach((s, i) => {
      const im = imgs[i] || imgs[imgs.length - 1];
      if (!im) return;
      ctx.save();
      this._roundClip(ctx, s);
      // cover-fit
      const sc = Math.max(s.w / im.width, s.h / im.height);
      const dw = im.width * sc, dh = im.height * sc;
      ctx.drawImage(im, s.x + (s.w - dw) / 2, s.y + (s.h - dh) / 2, dw, dh);
      ctx.restore();
    });

    // 2. template on top
    const tpl = await this._png(spec.png);
    ctx.drawImage(tpl, 0, 0);

    // 3. live date
    this._drawDates(ctx, spec);
    return true;
  },

  _roundClip(ctx, s) {
    const r = Math.min(s.r || 0, s.w / 2, s.h / 2);
    ctx.beginPath();
    ctx.moveTo(s.x + r, s.y);
    ctx.arcTo(s.x + s.w, s.y, s.x + s.w, s.y + s.h, r);
    ctx.arcTo(s.x + s.w, s.y + s.h, s.x, s.y + s.h, r);
    ctx.arcTo(s.x, s.y + s.h, s.x, s.y, r);
    ctx.arcTo(s.x, s.y, s.x + s.w, s.y, r);
    ctx.closePath();
    ctx.clip();
  },

  _drawDates(ctx, spec) {
    const text = this._fmtDate();
    for (const d of (spec.dates || [])) {
      ctx.save();
      if (d.bg) {
        // pill style: bg rounded rect + white text
        ctx.fillStyle = d.bg;
        this._rr(ctx, d.x, d.y, d.w, d.h, Math.min(d.radius || 999, d.h / 2));
        ctx.fill();
      }
      ctx.fillStyle = d.color || '#fff';
      ctx.font = `${d.pill ? '700 ' : ''}${d.fontSize}px "Space Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = d.bg ? 'center' : 'left';
      const tx = d.bg ? d.x + d.w / 2 : d.x;
      const ty = d.y + d.h / 2 + 0.5;
      if (d.letterSpacing) {
        ctx.letterSpacing = d.letterSpacing + 'px'; // supported in modern engines; harmless if not
      }
      ctx.fillText(text, tx, ty);
      ctx.restore();
    }
  },

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  // ===== LIVE STAGE PREVIEW =====
  // Draws the frame design OVER the live camera (in the overlay canvas), with the
  // camera feed visible through the empty photo slots.
  async previewInto(canvas, key, appLayout, ghost) {
    const url = this.thumbURL(key, appLayout);
    if (!url) return false;
    try {
      const img = await this._png(url);
      const ctx = canvas.getContext('2d');
      const s = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.save();
      ctx.globalAlpha = ghost ? 0.45 : 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.restore();
      return true;
    } catch (e) { return false; }
  },

  // scaled live preview: template + live video in slots + live date
  async drawLivePreview(ctx, w, h, key, appLayout, videoEl, dateStr, frozenPhotos, liveIndex) {
    const t = this.get(key);
    const lk = this.layoutKey(appLayout);
    if (!t || !lk) return;
    const spec = t.layouts[lk];
    const tpl = await this._png(spec.png);
    // cover-fit: the frame mat must fill the viewfinder edge-to-edge (slots may crop slightly, like a real booth)
    const s = Math.max(w / spec.w, h / spec.h);
    const ox = (w - spec.w * s) / 2, oy = (h - spec.h * s) / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);

    // pre-decode frozen photos so each frame draws without flicker
    const frozen = [];
    if (Array.isArray(frozenPhotos)) {
      for (const p of frozenPhotos) {
        try { frozen.push(await this._png(p)); } catch (e) { frozen.push(null); }
      }
    }

    // slots: taken slots FREEZE (photo + check), current is LIVE video, rest dim
    const vidOk = videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0;
    spec.slots.forEach((sl, i) => {
      const isTaken = i < frozen.length;
      const isLive = !isTaken && i === liveIndex;
      ctx.save();
      const r = Math.min(sl.r || 0, sl.w / 2, sl.h / 2);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(sl.x, sl.y, sl.w, sl.h, r) : ctx.rect(sl.x, sl.y, sl.w, sl.h);
      ctx.clip();
      if (isTaken) {
        const img = frozen[i];
        if (img) {
          const sc = Math.max(sl.w / img.width, sl.h / img.height);
          const dw = img.width * sc, dh = img.height * sc;
          ctx.drawImage(img, sl.x + (sl.w - dw) / 2, sl.y + (sl.h - dh) / 2, dw, dh);
        }
        // check badge
        const cb = Math.min(sl.w, sl.h) * 0.16;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sl.x + sl.w - cb * 0.9, sl.y + cb * 0.9, cb / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#181410';
        ctx.fill();
        ctx.strokeStyle = '#FDFBF7';
        ctx.lineWidth = Math.max(2, cb * 0.09);
        ctx.stroke();
        ctx.strokeStyle = '#FDFBF7';
        ctx.lineWidth = Math.max(2, cb * 0.11);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const cx = sl.x + sl.w - cb * 0.9, cy = sl.y + cb * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx - cb * 0.18, cy);
        ctx.lineTo(cx - cb * 0.04, cy + cb * 0.15);
        ctx.lineTo(cx + cb * 0.22, cy - cb * 0.14);
        ctx.stroke();
        ctx.restore();
      } else if (isLive || liveIndex === -1) {
        // live video in this slot
        ctx.fillStyle = 'rgba(24,20,16,0.25)';
        ctx.fillRect(sl.x, sl.y, sl.w, sl.h);
        if (vidOk) {
          const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
          ctx.translate(sl.x + sl.w, 0);
          ctx.scale(-1, 1);
          const sc = Math.max(sl.w / vw, sl.h / vh);
          const dw = vw * sc, dh = vh * sc;
          ctx.drawImage(videoEl, (sl.w - dw) / 2, sl.y + (sl.h - dh) / 2, dw, dh);
        }
        if (isLive) {
          // red LIVE border
          ctx.strokeStyle = '#D64045';
          ctx.lineWidth = Math.max(3, sl.w * 0.014);
          ctx.strokeRect(sl.x + ctx.lineWidth / 2, sl.y + ctx.lineWidth / 2, sl.w - ctx.lineWidth, sl.h - ctx.lineWidth);
        }
      } else {
        // dimmed upcoming slot
        ctx.fillStyle = 'rgba(24,20,16,0.55)';
        ctx.fillRect(sl.x, sl.y, sl.w, sl.h);
      }
      ctx.restore();
    });

    // template on top
    ctx.drawImage(tpl, 0, 0);

    // live date
    for (const d of (spec.dates || [])) {
      ctx.save();
      if (d.bg) {
        ctx.fillStyle = d.bg;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(d.x, d.y, d.w, d.h, Math.min(d.radius || 999, d.h / 2)) : ctx.rect(d.x, d.y, d.w, d.h);
        ctx.fill();
      }
      ctx.fillStyle = d.color || '#fff';
      ctx.font = `${d.pill ? '700 ' : ''}${d.fontSize}px "Space Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = d.bg ? 'center' : 'left';
      ctx.fillText(dateStr, d.bg ? d.x + d.w / 2 : d.x, d.y + d.h / 2 + 0.5);
      ctx.restore();
    }
    ctx.restore();
  },

  thumbURL(key, appLayout) {
    const lk = this.layoutKey(appLayout);
    const id = key.replace(/^nx-/, '');
    return lk ? `thumbs/${id}-${lk}.png` : null;
  },
};

// App-facing FRAMES registry extension
FramesNext.init();
(function register() {
  if (typeof FRAMES === 'undefined') return;
  const maxWait = 4000;
  const t0 = performance.now();
  function doRegister() {
    for (const t of FramesNext.entries()) {
      FRAMES['nx-' + t.key] = {
        name: t.label,
        category: t.category,
        framesNext: true,
        draw: function (ctx, w, h) {
          const layout = (typeof app !== 'undefined' && app.currentLayout) ? app.currentLayout : 'strip-4';
          const ghost = (typeof app !== 'undefined' && app.frameSheetOpen) ? 0.45 : 1;
          FramesNext.previewInto(ctx.canvas, t.key, layout, ghost).catch(() => {});
        },
      };
    }
    if (typeof app !== 'undefined' && typeof app.buildFrameChips === 'function') {
      try { app.buildFrameChips(); } catch (e) {}
    }
  }
  function tryNow() {
    if (FramesNext.tpl) { doRegister(); return; }
    if (performance.now() - t0 > maxWait) return;
    setTimeout(tryNow, 250);
  }
  tryNow();
})();
