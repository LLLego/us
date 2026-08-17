// ===== FRAMES =====
// Each frame = a function(ctx, w, h) that draws itself on the canvas.
// Runs AFTER the photo is composited. ctx.filter is reset to 'none' before calling.

// ===== LAYOUTS =====
const LAYOUTS = {
  single: { name: 'Single', shots: 1, description: 'One photo' },
  'strip-4': { name: 'Strip 1×4', shots: 4, description: 'Classic vertical strip' },
  'grid-2x2': { name: 'Grid 2×2', shots: 4, description: 'Four photos in a square' },
  'duo-strip': { name: 'Duo Strip', shots: 4, description: 'Wide two-face strip', duoOnly: true },
  'duo-grid': { name: 'Duo Wide', shots: 2, description: 'Two wide two-face rows', duoOnly: true },
};

// ===== HELPER FUNCTIONS =====
function frameFillBg(ctx, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function frameBorder(ctx, w, h, width, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, width);
  ctx.fillRect(0, h - width, w, width);
  ctx.fillRect(0, 0, width, h);
  ctx.fillRect(w - width, 0, width, h);
}

function frameDateStamp(ctx, w, h, text, font, size, color, align, x, y) {
  ctx.fillStyle = color;
  ctx.font = `${font} ${size}px '${font}', sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function drawCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const x = cx + Math.cos(angle) * size;
    const y = cy + Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.bezierCurveTo(cx, cy, cx - size, cy, cx - size, cy - size * 0.3);
  ctx.bezierCurveTo(cx - size, cy - size * 0.8, cx, cy - size * 0.8, cx, cy - size * 0.4);
  ctx.bezierCurveTo(cx, cy - size * 0.8, cx + size, cy - size * 0.8, cx + size, cy - size * 0.3);
  ctx.bezierCurveTo(cx + size, cy, cx, cy, cx, cy + size * 0.3);
  ctx.fill();
}

function drawLeaf(ctx, cx, cy, size, angle, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHoneyDrop(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(cx - size * 0.3, cy - size * 0.3, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBee(ctx, cx, cy, size) {
  // Body
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.ellipse(cx, cy, size, size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stripes
  ctx.fillStyle = '#181410';
  ctx.fillRect(cx - size * 0.3, cy - size * 0.5, size * 0.15, size);
  ctx.fillRect(cx + size * 0.1, cy - size * 0.5, size * 0.15, size);
  // Wings
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.3, cy - size * 0.8, size * 0.4, size * 0.25, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.3, cy - size * 0.8, size * 0.4, size * 0.25, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawMouseBow(ctx, cx, cy, size, color) {
  // Hello Kitty style bow
  ctx.fillStyle = color;
  // Left loop
  ctx.beginPath();
  ctx.ellipse(cx - size, cy, size * 0.7, size * 0.6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Right loop
  ctx.beginPath();
  ctx.ellipse(cx + size, cy, size * 0.7, size * 0.6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Center knot
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.4, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHunnyPot(ctx, cx, cy, size, color) {
  // Pot body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.3, size * 0.8, size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pot rim
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.3, size * 0.7, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== ALL FRAMES =====
const FRAMES = {
  none: { name: 'None', category: 'clean', draw: () => {} },

  // ===== CLEAN / MINIMAL =====
  polaroid: {
    name: 'Polaroid', category: 'clean',
    draw: (ctx, w, h) => {
      // Paper gradient — warm white top, settles to off-white bottom
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#FEFEF9');
      grad.addColorStop(0.6, '#FDFCF5');
      grad.addColorStop(1, '#F8F6EE');
      
      // Borders — thin top/sides, thick bottom (classic instant film)
      const st = Math.round(w * 0.04);   // sides/top
      const bt = Math.round(h * 0.12);   // bottom
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, st);           // top
      ctx.fillRect(0, 0, st, h);           // left
      ctx.fillRect(w - st, 0, st, h);      // right
      ctx.fillRect(0, h - bt, w, bt);      // bottom
      
      // Inner shadow — photo sits under paper lip
      ctx.save();
      ctx.beginPath();
      ctx.rect(st, st, w - st * 2, h - st - bt);
      ctx.clip();
      ctx.shadowColor = 'rgba(20,15,10,0.18)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(st, st, w - st * 2, h - st - bt);
      ctx.restore();
      
      // Date stamp — handwritten, left-aligned with margin
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { 
        month: 'long', day: 'numeric' 
      });
      const yearStr = now.getFullYear().toString();
      
      ctx.fillStyle = '#3A3530';
      ctx.font = `700 ${Math.round(bt * 0.22)}px 'Caveat', cursive`;
      ctx.textAlign = 'left';
      ctx.fillText(dateStr, st * 1.8, h - bt * 0.55);
      
      // Year in mono, right side
      ctx.fillStyle = 'rgba(58,53,48,0.4)';
      ctx.font = `400 ${Math.round(bt * 0.12)}px 'Space Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(yearStr, w - st * 1.8, h - bt * 0.35);
    },
  },
  hairline: {
    name: 'Indie', category: 'clean',
    draw: (ctx, w, h) => {
      ctx.strokeStyle = '#181410';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#181410';
      ctx.font = `400 14px 'Space Mono', monospace`;
      ctx.textAlign = 'right';
      const d = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      ctx.fillText(`US · ${d}`, w - 16, h - 16);
    },
  },
  cleanWhite: {
    name: 'Clean', category: 'clean',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.025);
      frameBorder(ctx, w, h, bw, '#FFFFFF');
    },
  },
  shadowBox: {
    name: 'Shadow', category: 'clean',
    draw: (ctx, w, h) => {
      ctx.shadowColor = 'rgba(24,20,16,0.4)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 8;
      ctx.strokeStyle = 'rgba(24,20,16,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    },
  },
  kodak: {
    name: 'Kodak', category: 'clean',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.03);
      frameBorder(ctx, w, h, bw, '#D64045');
      ctx.strokeStyle = '#181410';
      ctx.lineWidth = 1;
      ctx.strokeRect(bw + 2, bw + 2, w - 2 * bw - 4, h - 2 * bw - 4);
    },
  },
  rounded: {
    name: 'Soft', category: 'clean',
    draw: (ctx, w, h) => {
      const r = Math.round(w * 0.03), bw = 4;
      ctx.strokeStyle = '#181410';
      ctx.lineWidth = bw;
      ctx.beginPath();
      ctx.moveTo(bw + r, bw);
      ctx.lineTo(w - bw - r, bw);
      ctx.quadraticCurveTo(w - bw, bw, w - bw, bw + r);
      ctx.lineTo(w - bw, h - bw - r);
      ctx.quadraticCurveTo(w - bw, h - bw, w - bw - r, h - bw);
      ctx.lineTo(bw + r, h - bw);
      ctx.quadraticCurveTo(bw, h - bw, bw, h - bw - r);
      ctx.lineTo(bw, bw + r);
      ctx.quadraticCurveTo(bw, bw, bw + r, bw);
      ctx.stroke();
    },
  },
  filmstrip: {
    name: 'Film', category: 'clean',
    draw: (ctx, w, h) => {
      const holeSize = Math.round(w * 0.04);
      const holeSpacing = holeSize * 1.8;
      const stripH = Math.round(h * 0.05);
      ctx.fillStyle = '#181410';
      ctx.fillRect(0, 0, w, stripH);
      ctx.fillRect(0, h - stripH, w, stripH);
      ctx.fillStyle = '#F2EBE0';
      for (let x = holeSpacing / 2; x < w; x += holeSpacing) {
        ctx.fillRect(x - holeSize / 2, stripH * 0.25, holeSize, stripH * 0.5);
        ctx.fillRect(x - holeSize / 2, h - stripH * 0.75, holeSize, stripH * 0.5);
      }
    },
  },

  // ===== CUSTOM / FUN =====
  stamp: {
    name: 'Stamp', category: 'fun',
    draw: (ctx, w, h) => {
      // Perforated edges like a postage stamp
      const perf = Math.round(w * 0.015);
      const dot = perf * 0.6;
      ctx.fillStyle = '#181410';
      // Top edge dots
      for (let x = perf; x < w; x += perf * 2) {
        drawCircle(ctx, x, perf / 2, dot / 2, '#F2EBE0');
        drawCircle(ctx, x, h - perf / 2, dot / 2, '#F2EBE0');
      }
      for (let y = perf; y < h; y += perf * 2) {
        drawCircle(ctx, perf / 2, y, dot / 2, '#F2EBE0');
        drawCircle(ctx, w - perf / 2, y, dot / 2, '#F2EBE0');
      }
      // Inner border
      ctx.strokeStyle = '#181410';
      ctx.lineWidth = 2;
      ctx.strokeRect(perf * 1.5, perf * 1.5, w - perf * 3, h - perf * 3);
    },
  },
  hearts: {
    name: 'Hearts', category: 'fun',
    draw: (ctx, w, h) => {
      const size = Math.round(w * 0.025);
      const positions = [
        [w * 0.05, h * 0.05], [w * 0.95, h * 0.05],
        [w * 0.05, h * 0.95], [w * 0.95, h * 0.95],
        [w * 0.5, h * 0.04], [w * 0.5, h * 0.96],
      ];
      positions.forEach(([x, y]) => drawHeart(ctx, x, y, size, '#D64045'));
    },
  },
  confetti: {
    name: 'Confetti', category: 'fun',
    draw: (ctx, w, h) => {
      const colors = ['#D64045', '#F2C998', '#3A6B5C', '#FFD700', '#181410'];
      const size = Math.round(w * 0.008);
      // Scatter dots around edges
      for (let i = 0; i < 60; i++) {
        const edge = i % 4;
        let x, y;
        if (edge === 0) { x = Math.random() * w; y = Math.random() * (h * 0.06); }
        else if (edge === 1) { x = Math.random() * (w * 0.06) + w * 0.94; y = Math.random() * h; }
        else if (edge === 2) { x = Math.random() * w; y = Math.random() * (h * 0.06) + h * 0.94; }
        else { x = Math.random() * (w * 0.06); y = Math.random() * h; }
        drawCircle(ctx, x, y, size + Math.random() * size, colors[i % colors.length]);
      }
    },
  },
  dateStamp: {
    name: 'Date', category: 'fun',
    draw: (ctx, w, h) => {
      const bt = Math.round(h * 0.12);
      ctx.fillStyle = '#181410';
      ctx.fillRect(0, h - bt, w, bt);
      ctx.fillStyle = '#F2EBE0';
      ctx.font = `700 ${Math.round(bt * 0.25)}px 'Space Mono', monospace`;
      ctx.textAlign = 'center';
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      const numStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
      ctx.fillText(dateStr, w / 2, h - bt * 0.65);
      ctx.font = `400 ${Math.round(bt * 0.18)}px 'Space Mono', monospace`;
      ctx.fillText(numStr, w / 2, h - bt * 0.3);
    },
  },
  doubleLine: {
    name: 'Double', category: 'fun',
    draw: (ctx, w, h) => {
      const gap = 6;
      ctx.strokeStyle = '#181410';
      ctx.lineWidth = 2;
      ctx.strokeRect(gap, gap, w - gap * 2, h - gap * 2);
      ctx.strokeStyle = '#D64045';
      ctx.lineWidth = 2;
      ctx.strokeRect(gap * 3, gap * 3, w - gap * 6, h - gap * 6);
    },
  },

  // ===== WINNIE THE POOH (using SVG stickers) =====
  honey: {
    name: 'Hunny', category: 'themed',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.05);
      // Warm golden gradient border
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#E8B838');
      grad.addColorStop(0.5, '#D4A017');
      grad.addColorStop(1, '#C0881A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, bw);
      ctx.fillRect(0, h - bw, w, bw);
      ctx.fillRect(0, 0, bw, h);
      ctx.fillRect(w - bw, 0, bw, h);
      // Inner line
      ctx.strokeStyle = '#8B5A00';
      ctx.lineWidth = 1;
      ctx.strokeRect(bw + 2, bw + 2, w - 2*bw - 4, h - 2*bw - 4);
      // Hunny text
      ctx.fillStyle = '#8B5A00';
      ctx.font = `italic 700 ${Math.round(bw * 0.5)}px 'Caveat', cursive`;
      ctx.textAlign = 'center';
      ctx.fillText('hunny', w / 2, h - bw * 0.35);
      // Stickers
      const beeSize = Math.round(w * 0.04);
      drawStickerSync(ctx, 'bee', bw * 2, bw * 0.7, beeSize);
      drawStickerSync(ctx, 'bee', w - bw * 2, bw * 0.7, beeSize);
      drawStickerSync(ctx, 'honey_pot', bw * 2, h - bw * 2.5, beeSize * 1.5);
      drawStickerSync(ctx, 'honey_pot', w - bw * 2, h - bw * 2.5, beeSize * 1.5);
    },
  },
  hundredAcre: {
    name: 'Forest', category: 'themed',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.04);
      // Green gradient border
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#5A8B7C');
      grad.addColorStop(1, '#2A4B3C');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, bw);
      ctx.fillRect(0, h - bw, w, bw);
      ctx.fillRect(0, 0, bw, h);
      ctx.fillRect(w - bw, 0, bw, h);
      // Leaves scattered
      const ls = Math.round(w * 0.03);
      const positions = [
        [bw*0.6, h*0.12], [bw*0.6, h*0.35], [bw*0.6, h*0.62], [bw*0.6, h*0.88],
        [w-bw*0.6, h*0.08], [w-bw*0.6, h*0.3], [w-bw*0.6, h*0.55], [w-bw*0.6, h*0.82],
        [w*0.15, bw*0.6], [w*0.45, bw*0.6], [w*0.7, bw*0.6],
        [w*0.2, h-bw*0.6], [w*0.55, h-bw*0.6], [w*0.8, h-bw*0.6],
      ];
      positions.forEach(([x, y], i) => {
        drawStickerSync(ctx, 'leaf', x, y, ls);
      });
      // Red balloon accent
      drawStickerSync(ctx, 'balloon', w * 0.5, bw + ls * 1.5, ls * 1.2);
    },
  },
  balloonFloat: {
    name: 'Balloons', category: 'themed',
    draw: (ctx, w, h) => {
      const bs = Math.round(w * 0.05);
      // Balloons in corners with strings
      const balloons = [
        {x: bs*1.2, y: bs*1.2, c: 'balloon'},
        {x: w-bs*1.2, y: bs*1.2, c: 'balloon'},
        {x: bs*1.2, y: h-bs*1.2, c: 'balloon'},
        {x: w-bs*1.2, y: h-bs*1.2, c: 'balloon'},
      ];
      balloons.forEach(b => {
        drawStickerSync(ctx, b.c, b.x, b.y, bs);
        // String
        ctx.strokeStyle = 'rgba(24,20,16,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + bs/2);
        ctx.lineTo(b.x + (Math.random()-0.5)*20, b.y + bs*1.5);
        ctx.stroke();
      });
      // Extra floating balloons
      drawStickerSync(ctx, 'balloon', w*0.3, bs*0.7, bs*0.7);
      drawStickerSync(ctx, 'balloon', w*0.7, h-bs*0.7, bs*0.7);
    },
  },

  // ===== PUCCA & GARU =====
  pucca: {
    name: 'Pucca', category: 'themed',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.045);
      // Red gradient border
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#E85A5F');
      grad.addColorStop(1, '#D64045');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, bw);
      ctx.fillRect(0, h - bw, w, bw);
      ctx.fillRect(0, 0, bw, h);
      ctx.fillRect(w - bw, 0, bw, h);
      // Pucca hearts in corners
      const hs = Math.round(w * 0.035);
      drawStickerSync(ctx, 'pucca_heart', bw + hs, bw + hs, hs);
      drawStickerSync(ctx, 'pucca_heart', w - bw - hs, bw + hs, hs);
      drawStickerSync(ctx, 'pucca_heart', bw + hs, h - bw - hs, hs);
      drawStickerSync(ctx, 'pucca_heart', w - bw - hs, h - bw - hs, hs);
      drawStickerSync(ctx, 'pucca_heart', w/2, bw + hs*0.8, hs*0.8);
      drawStickerSync(ctx, 'pucca_heart', w/2, h - bw - hs*0.8, hs*0.8);
      // Text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `italic 700 ${Math.round(bw * 0.45)}px 'Caveat', cursive`;
      ctx.textAlign = 'center';
      ctx.fillText('love ♥', w / 2, h - bw * 0.35);
    },
  },
  ninja: {
    name: 'Ninja', category: 'themed',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.05);
      // Black gradient border
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#2A2520');
      grad.addColorStop(1, '#181410');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, bw);
      ctx.fillRect(0, h - bw, w, bw);
      ctx.fillRect(0, 0, bw, h);
      ctx.fillRect(w - bw, 0, bw, h);
      // Ninja stars
      const ss = Math.round(w * 0.025);
      drawStickerSync(ctx, 'ninja_star', bw*1.5, bw*1.5, ss*1.5);
      drawStickerSync(ctx, 'ninja_star', w-bw*1.5, h-bw*1.5, ss*1.5);
      drawStickerSync(ctx, 'ninja_star', w-bw*1.5, bw*1.5, ss*1.5);
      drawStickerSync(ctx, 'ninja_star', bw*1.5, h-bw*1.5, ss*1.5);
      // Red accent line
      ctx.strokeStyle = '#D64045';
      ctx.lineWidth = 2;
      ctx.strokeRect(bw + 3, bw + 3, w - bw*2 - 6, h - bw*2 - 6);
    },
  },
  noodle: {
    name: 'Noodle', category: 'themed',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.04);
      // Pink gradient border
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#FFB6C1');
      grad.addColorStop(1, '#FF69B4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, bw);
      ctx.fillRect(0, h - bw, w, bw);
      ctx.fillRect(0, 0, bw, h);
      ctx.fillRect(w - bw, 0, bw, h);
      // White inner border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(bw + 2, bw + 2, w - bw*2 - 4, h - bw*2 - 4);
      // Hearts
      const hs = Math.round(w * 0.025);
      drawStickerSync(ctx, 'heart_pink', w*0.1, h*0.1, hs);
      drawStickerSync(ctx, 'heart_pink', w*0.9, h*0.1, hs);
      drawStickerSync(ctx, 'heart_pink', w*0.1, h*0.9, hs);
      drawStickerSync(ctx, 'heart_pink', w*0.9, h*0.9, hs);
    },
  },

  // ===== HELLO KITTY =====
  kitty: {
    name: 'Kitty', category: 'themed',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.045);
      // White border with subtle shadow
      ctx.shadowColor = 'rgba(24,20,16,0.15)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, bw);
      ctx.fillRect(0, h - bw, w, bw);
      ctx.fillRect(0, 0, bw, h);
      ctx.fillRect(w - bw, 0, bw, h);
      ctx.shadowBlur = 0;
      // Red bows in corners
      const bs = Math.round(w * 0.035);
      drawStickerSync(ctx, 'kitty_bow', bw + bs, bw + bs, bs);
      drawStickerSync(ctx, 'kitty_bow', w - bw - bs, bw + bs, bs);
      drawStickerSync(ctx, 'kitty_bow', bw + bs, h - bw - bs, bs);
      drawStickerSync(ctx, 'kitty_bow', w - bw - bs, h - bw - bs, bs);
      // Kitty face at top center
      drawStickerSync(ctx, 'kitty_face', w/2, bw + bs*0.8, bs*1.2);
    },
  },
  kittyPink: {
    name: 'Pink', category: 'themed',
    draw: (ctx, w, h) => {
      const bw = Math.round(w * 0.045);
      // Pink gradient border
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#FFB6C1');
      grad.addColorStop(1, '#FF91A4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, bw);
      ctx.fillRect(0, h - bw, w, bw);
      ctx.fillRect(0, 0, bw, h);
      ctx.fillRect(w - bw, 0, bw, h);
      // White inner line
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(bw + 2, bw + 2, w - bw*2 - 4, h - bw*2 - 4);
      // Bows
      const bs = Math.round(w * 0.03);
      drawStickerSync(ctx, 'kitty_bow', bw + bs*1.5, bw + bs*1.5, bs);
      drawStickerSync(ctx, 'kitty_bow', w - bw - bs*1.5, h - bw - bs*1.5, bs);
      // Sparkles
      drawStickerSync(ctx, 'sparkle', w*0.3, bw + bs, bs*0.8);
      drawStickerSync(ctx, 'sparkle', w*0.7, h - bw - bs, bs*0.8);
    },
  },
  sparkle: {
    name: 'Sparkle', category: 'themed',
    draw: (ctx, w, h) => {
      const ss = Math.round(w * 0.02);
      const spacing = Math.round(w * 0.045);
      const colors = ['sparkle', 'star_yellow', 'star_pink', 'sparkle', 'star_white'];
      // Top edge
      for (let x = spacing; x < w; x += spacing * 1.5) {
        drawStickerSync(ctx, colors[Math.floor(Math.random()*colors.length)], x, spacing, ss);
      }
      // Bottom edge
      for (let x = spacing * 0.7; x < w; x += spacing * 1.5) {
        drawStickerSync(ctx, colors[Math.floor(Math.random()*colors.length)], x, h - spacing, ss);
      }
      // Left edge
      for (let y = spacing * 1.5; y < h - spacing; y += spacing * 1.5) {
        drawStickerSync(ctx, colors[Math.floor(Math.random()*colors.length)], spacing, y, ss);
      }
      // Right edge
      for (let y = spacing * 2; y < h - spacing; y += spacing * 1.5) {
        drawStickerSync(ctx, colors[Math.floor(Math.random()*colors.length)], w - spacing, y, ss);
      }
    },
  },
};

