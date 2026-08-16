// ===== FILTERS =====
// CSS filter strings for preview (applied to <video>) and export (applied to ctx.filter)
// WYSIWYG — what you see is what you get

const FILTERS = {
  none: {
    name: 'Original',
    css: 'none',
    canvas: 'none',
  },
  bw: {
    name: 'B&W',
    css: 'grayscale(1) contrast(1.2)',
    canvas: 'grayscale(1) contrast(1.2)',
  },
  vintage: {
    name: 'Vintage',
    css: 'sepia(0.65) contrast(1.1) brightness(0.95) saturate(0.85)',
    canvas: 'sepia(0.65) contrast(1.1) brightness(0.95) saturate(0.85)',
  },
  warm: {
    name: 'Manila',
    css: 'sepia(0.4) saturate(1.5) contrast(1.2) hue-rotate(-10deg)',
    canvas: 'sepia(0.4) saturate(1.5) contrast(1.2) hue-rotate(-10deg)',
  },
  cool: {
    name: 'Cool',
    css: 'saturate(0.85) hue-rotate(190deg) contrast(1.1) brightness(1.05)',
    canvas: 'saturate(0.85) hue-rotate(190deg) contrast(1.1) brightness(1.05)',
  },
  sunset: {
    name: 'Sunset',
    css: 'hue-rotate(-20deg) saturate(1.5) brightness(1.1)',
    canvas: 'hue-rotate(-20deg) saturate(1.5) brightness(1.1)',
  },
  y2k: {
    name: 'Y2K',
    css: 'saturate(1.8) contrast(0.9) brightness(1.1)',
    canvas: 'saturate(1.8) contrast(0.9) brightness(1.1)',
  },
};
