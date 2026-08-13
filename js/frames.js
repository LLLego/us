// ===== FRAMES =====
// Each frame is a function that receives ctx + canvas dimensions and draws itself.
// Runs AFTER the photo is composited. Draws on top.

// ===== LAYOUTS =====
// Photo layout options: single, 1x4 strip, 2x2 grid, etc.
// Each defines how captures are arranged on the final canvas.

const LAYOUTS = {
  single: {
    name: 'Single',
    shots: 1,
    description: 'One photo',
  },
  'strip-4': {
    name: 'Strip 1×4',
    shots: 4,
    description: 'Classic vertical strip',
  },
  'grid-2x2': {
    name: 'Grid 2×2',
    shots: 4,
    description: 'Four photos in a square',
  },
  'strip-3': {
    name: 'Strip 1×3',
    shots: 3,
    description: 'Three photos vertical',
  },
};

const FRAMES = {
  none: {
    name: 'No Frame',
    draw: () => {},
  },
  polaroid: {
    name: 'Polaroid',
    draw: (ctx, w, h) => {
      // White border: thick bottom, medium sides/top
      const bt = Math.round(h * 0.08); // bottom
      const st = Math.round(w * 0.04); // sides + top
      ctx.fillStyle = '#FDFBF7';
      // Top
      ctx.fillRect(0, 0, w, st);
      // Bottom
      ctx.fillRect(0, h - bt, w, bt);
      // Left
      ctx.fillRect(0, 0, st, h);
      // Right
      ctx.fillRect(w - st, 0, st, h);
      // Date stamp area
      ctx.fillStyle = '#181410';
      ctx.font = `400 ${Math.round(bt * 0.3)}px 'Space Mono', monospace`;
      ctx.textAlign = 'center';
      const dateStr = new Date().toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric' 
      }).toUpperCase();
      ctx.fillText(dateStr, w / 2, h - bt / 2.5);
    },
  },
  hairline: {
    name: 'Indie',
    draw: (ctx, w, h) => {
      ctx.strokeStyle = '#181410';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      // Date in bottom right
      ctx.fillStyle = '#181410';
      ctx.font = `400 14px 'Space Mono', monospace`;
      ctx.textAlign = 'right';
      const dateStr = new Date().toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric' 
      }).toUpperCase();
      ctx.fillText(`US · ${dateStr}`, w - 16, h - 16);
    },
  },
  kodak: {
    name: 'Kodak Red',
    draw: (ctx, w, h) => {
      // Red border
      const bw = Math.round(w * 0.03);
      ctx.fillStyle = '#D64045';
      ctx.fillRect(0, 0, w, bw); // top
      ctx.fillRect(0, h - bw, w, bw); // bottom
      ctx.fillRect(0, 0, bw, h); // left
      ctx.fillRect(w - bw, 0, bw, h); // right
      // Inner thin black line
      ctx.strokeStyle = '#181410';
      ctx.lineWidth = 1;
      ctx.strokeRect(bw + 2, bw + 2, w - 2 * bw - 4, h - 2 * bw - 4);
    },
  },
  filmstrip: {
    name: 'Film Strip',
    draw: (ctx, w, h) => {
      const holeSize = Math.round(w * 0.04);
      const holeSpacing = holeSize * 1.8;
      const stripH = Math.round(h * 0.05);
      // Top strip
      ctx.fillStyle = '#181410';
      ctx.fillRect(0, 0, w, stripH);
      ctx.fillRect(0, h - stripH, w, stripH);
      // Holes (transparent = cream)
      ctx.fillStyle = '#F2EBE0';
      for (let x = holeSpacing / 2; x < w; x += holeSpacing) {
        ctx.fillRect(x - holeSize / 2, stripH * 0.25, holeSize, stripH * 0.5);
        ctx.fillRect(x - holeSize / 2, h - stripH * 0.75, holeSize, stripH * 0.5);
      }
    },
  },
  rounded: {
    name: 'Soft',
    draw: (ctx, w, h) => {
      const r = Math.round(w * 0.03);
      const bw = 4;
      // Rounded rect border
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
};
