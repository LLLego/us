// ===== FRAMES-NEXT BRIDGE =====
// Loads the frames-next library (33 authored HTML frames) into the app.
// A frames-next frame is a FULL composite (mat + photos + chrome), so when one
// is active the export canvas is resized to the frame's native dims and the
// frame renders the entire image — photos + live date injected via __FRAME__.

const FramesNext = {
  manifest: null,
  overlayDiv: null,

  async init() {
    try {
      const res = await fetch('frames/manifest.json');
      this.manifest = await res.json();
    } catch (e) {
      console.warn('[frames-next] manifest not loaded:', e);
      this.manifest = { frames: [] };
    }
    this.overlayDiv = document.createElement('div');
    this.overlayDiv.style.cssText = 'position:absolute;left:-99999px;top:0;';
    document.body.appendChild(this.overlayDiv);
  },

  entries() {
    return this.manifest ? this.manifest.frames : [];
  },

  get(key) {
    return this.entries().find(f => f.key === key) || null;
  },

  // map app layout -> frames-next layout
  layoutKey(appLayout) {
    if (appLayout === 'strip-4') return 'strip';
    if (appLayout === 'grid-2x2') return 'grid';
    if (appLayout === 'single') return 'single';
    return null; // strip-3 etc: not in library
  },

  supports(appLayout) {
    return this.layoutKey(appLayout) !== null;
  },

  _fmtDate() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  },

  // Render a frame into a canvas. photos = array of dataURLs.
  async renderToCanvas(key, appLayout, canvas, photos) {
    const frame = this.get(key);
    const lk = this.layoutKey(appLayout);
    if (!frame || !lk) return false;
    const spec = frame.layouts[lk];

    // resize export canvas to native frame dims
    canvas.width = spec.w;
    canvas.height = spec.h;

    // fetch frame HTML and inject photos + date
    let html;
    try {
      const res = await fetch(spec.file);
      html = await res.text();
    } catch (e) {
      console.warn('[frames-next] frame file failed:', spec.file, e);
      return false;
    }
    const F = { date: this._fmtDate() };
    if (photos && photos.length) F.photos = photos;
    const payload = '<script>window.__FRAME__ = ' + JSON.stringify(F) + '<\/script>';
    html = html.replace('</head>', payload + '</head>');
    // srcdoc-style isolation inside hidden div
    this.overlayDiv.innerHTML = '<iframe style="border:0;width:' + spec.w + 'px;height:' + spec.h + 'px" ' +
      'srcdoc="' + html.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>';

    // wait for the iframe to signal readiness (fonts + images)
    const iframe = this.overlayDiv.firstChild;
    const t0 = performance.now();
    while (performance.now() - t0 < 9000) {
      const body = iframe.contentDocument && iframe.contentDocument.body;
      if (body && body.getAttribute('data-fr-ready') === '1' &&
          [...iframe.contentDocument.images].every(im => im.complete)) {
        break;
      }
      await new Promise(r => setTimeout(r, 120));
    }

    // render iframe content to canvas via html2canvas
    const doc = iframe.contentDocument;
    const target = doc.querySelector('.frame');
    const shot = await html2canvas(target, {
      backgroundColor: null,
      width: spec.w,
      height: spec.h,
      scale: 1,
      logging: false,
      useCORS: true,
      allowTaint: false,
    });
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(shot, 0, 0);
    this.overlayDiv.innerHTML = '';
    return true;
  },

  // thumbnail for the picker sheet (static PNG from build)
  thumbURL(key, appLayout) {
    const lk = this.layoutKey(appLayout);
    return lk ? `thumbs/${key}-${lk}.png` : null;
  },
};

// App-facing FRAMES registry extension:
// each frames-next design becomes a FRAMES entry whose draw() defers to the bridge.
FramesNext.init();
(function register() {
  if (typeof FRAMES === 'undefined') return;
  const maxWait = 4000;
  const t0 = performance.now();
  function doRegister() {
    for (const f of FramesNext.entries()) {
      FRAMES['nx-' + f.key] = {
        name: f.label,
        category: f.category,
        framesNext: true,
        draw: function (ctx, w, h) {
          // canvas-draw preview fallback: tinted mat + label (async real render handled by app hooks)
          ctx.fillStyle = '#F2EBE0';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#4A2F1F';
          ctx.font = `700 ${Math.max(10, Math.round(w * 0.05))}px 'Space Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(f.label, w / 2, h / 2);
        },
      };
    }
    // rebuild chips/thumbs if app already built them
    if (window.App && typeof App.buildFrameChips === 'function') {
      try { App.buildFrameChips(); } catch (e) {}
    }
  }
  function tryNow() {
    if (FramesNext.manifest) { doRegister(); return; }
    if (performance.now() - t0 > maxWait) return;
    setTimeout(tryNow, 250);
  }
  tryNow();
})();
