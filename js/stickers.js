// ===== STICKER LIBRARY =====
// SVG-based stickers drawn as images on canvas. 
// Each is a clean SVG path embedded as base64 — no external files needed.

const STICKERS = {
  // ===== HEARTS =====
  heart_red: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 88 C50 88 12 60 12 36 C12 22 22 12 34 12 C42 12 48 18 50 24 C52 18 58 12 66 12 C78 12 88 22 88 36 C88 60 50 88 50 88Z' fill='%23D64045'/%3E%3Cpath d='M50 88 C50 88 12 60 12 36 C12 22 22 12 34 12 C42 12 48 18 50 24' fill='none' stroke='%23B73136' stroke-width='2'/%3E%3C/svg%3E`,
  
  heart_pink: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 88 C50 88 12 60 12 36 C12 22 22 12 34 12 C42 12 48 18 50 24 C52 18 58 12 66 12 C78 12 88 22 88 36 C88 60 50 88 50 88Z' fill='%23FF69B4'/%3E%3C/svg%3E`,
  
  heart_outline: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 88 C50 88 12 60 12 36 C12 22 22 12 34 12 C42 12 48 18 50 24 C52 18 58 12 66 12 C78 12 88 22 88 36 C88 60 50 88 50 88Z' fill='none' stroke='%23181410' stroke-width='3'/%3E%3C/svg%3E`,

  // ===== STARS =====
  star_yellow: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5 L61 38 L96 38 L67 58 L78 91 L50 71 L22 91 L33 58 L4 38 L39 38 Z' fill='%23FFD700' stroke='%23D4A017' stroke-width='2'/%3E%3C/svg%3E`,
  
  star_pink: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5 L61 38 L96 38 L67 58 L78 91 L50 71 L22 91 L33 58 L4 38 L39 38 Z' fill='%23FF69B4'/%3E%3C/svg%3E`,
  
  star_white: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5 L61 38 L96 38 L67 58 L78 91 L50 71 L22 91 L33 58 L4 38 L39 38 Z' fill='%23FDFBF7'/%3E%3C/svg%3E`,

  // SPARKLE (4-point)
  sparkle: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5 C55 35 65 45 95 50 C65 55 55 65 50 95 C45 65 35 55 5 50 C35 45 45 35 50 5Z' fill='%23FFD700'/%3E%3C/svg%3E`,

  // ===== WINNIE THE POOH INSPIRED =====
  // Honey pot
  honey_pot: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M25 30 L75 30 L80 40 L82 75 C82 82 76 88 50 88 C24 88 18 82 18 75 L20 40 Z' fill='%23D4A017' stroke='%238B5A00' stroke-width='2'/%3E%3Cellipse cx='50' cy='30' rx='25' ry='7' fill='%23E8B838' stroke='%238B5A00' stroke-width='2'/%3E%3Cpath d='M35 35 Q50 40 65 35' fill='%23C0881A'/%3E%3Ctext x='50' y='65' font-family='cursive' font-size='14' fill='%238B5A00' text-anchor='middle' font-style='italic'%3Ehunny%3C/text%3E%3C/svg%3E`,
  
  // Bee
  bee: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='55' rx='25' ry='18' fill='%23FFD700'/%3E%3Crect x='42' y='38' width='5' height='34' fill='%23181410' rx='2'/%3E%3Crect x='53' y='38' width='5' height='34' fill='%23181410' rx='2'/%3E%3Cellipse cx='35' cy='38' rx='12' ry='7' fill='rgba(255,255,255,0.8)'/%3E%3Cellipse cx='65' cy='38' rx='12' ry='7' fill='rgba(255,255,255,0.8)'/%3E%3Ccircle cx='45' cy='48' r='2' fill='%23181410'/%3E%3C/svg%3E`,
  
  // Balloon
  balloon: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='35' rx='28' ry='32' fill='%23D64045'/%3E%3Cpath d='M46 65 L48 72 L52 72 L54 65 Z' fill='%23B73136'/%3E%3Cpath d='M50 72 Q45 80 50 88 Q55 96 50 100' fill='none' stroke='%23181410' stroke-width='1.5'/%3E%3Cellipse cx='42' cy='25' rx='6' ry='4' fill='rgba(255,255,255,0.4)'/%3E%3C/svg%3E`,
  
  // Leaf
  leaf: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 10 C80 25 85 60 50 90 C15 60 20 25 50 10Z' fill='%233A6B5C'/%3E%3Cpath d='M50 15 L50 85' stroke='%232A4B3C' stroke-width='1.5' fill='none'/%3E%3Cpath d='M50 35 L65 45 M50 45 L35 55 M50 55 L65 65 M50 65 L35 70' stroke='%232A4B3C' stroke-width='1' fill='none'/%3E%3C/svg%3E`,

  // ===== HELLO KITTY INSPIRED =====
  // Bow (Kitty style)
  kitty_bow: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='25' cy='50' rx='20' ry='16' fill='%23D64045' transform='rotate(-15 25 50)'/%3E%3Cellipse cx='75' cy='50' rx='20' ry='16' fill='%23D64045' transform='rotate(15 75 50)'/%3E%3Cellipse cx='50' cy='50' rx='12' ry='14' fill='%23D64045'/%3E%3Cellipse cx='25' cy='45' rx='8' ry='5' fill='%23E85A5F' transform='rotate(-15 25 45)'/%3E%3Cellipse cx='75' cy='45' rx='8' ry='5' fill='%23E85A5F' transform='rotate(15 75 45)'/%3E%3C/svg%3E`,
  
  // Kitty face (simplified — white cat with bow)
  kitty_face: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='55' rx='35' ry='30' fill='white' stroke='%23181410' stroke-width='1.5'/%3E%3Cpath d='M25 30 L18 15 L30 28Z' fill='white' stroke='%23181410' stroke-width='1.5'/%3E%3Cpath d='M75 30 L82 15 L70 28Z' fill='white' stroke='%23181410' stroke-width='1.5'/%3E%3Cellipse cx='25' cy='35' rx='8' ry='6' fill='%23D64045' transform='rotate(-20 25 35)'/%3E%3Cellipse cx='75' cy='35' rx='8' ry='6' fill='%23D64045' transform='rotate(20 75 35)'/%3E%3Cellipse cx='40' cy='55' rx='3' ry='5' fill='%23181410'/%3E%3Cellipse cx='60' cy='55' rx='3' ry='5' fill='%23181410'/%3E%3Cellipse cx='50' cy='63' rx='3' ry='2' fill='%23FFD700'/%3E%3Cpath d='M50 65 Q40 73 35 68 M50 65 Q60 73 65 68' stroke='%23181410' stroke-width='1.5' fill='none'/%3E%3Cpath d='M35 72 L30 75 M40 73 L37 78 M50 74 L50 79 M60 73 L63 78 M65 72 L70 75' stroke='%23181410' stroke-width='1'/%3E%3C/svg%3E`,

  // ===== PUCCA INSPIRED =====
  // Pucca-style heart with face (simplified)
  pucca_heart: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 88 C50 88 12 60 12 36 C12 22 22 12 34 12 C42 12 48 18 50 24 C52 18 58 12 66 12 C78 12 88 22 88 36 C88 60 50 88 50 88Z' fill='%23D64045'/%3E%3Ccircle cx='38' cy='38' r='4' fill='%23181410'/%3E%3Ccircle cx='62' cy='38' r='4' fill='%23181410'/%3E%3Cpath d='M35 50 Q50 62 65 50' stroke='%23181410' stroke-width='2.5' fill='none'/%3E%3C/svg%3E`,
  
  // Ninja star
  ninja_star: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5 L58 35 L88 30 L68 52 L92 68 L62 65 L55 95 L42 70 L12 80 L28 55 L5 40 L35 42Z' fill='%23181410'/%3E%3Ccircle cx='50' cy='52' r='8' fill='%23D64045'/%3E%3Ccircle cx='50' cy='52' r='4' fill='%23FDFBF7'/%3E%3C/svg%3E`,

  // ===== DECORATIVE =====
  // Flower
  flower: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='25' rx='12' ry='18' fill='%23FFB6C1'/%3E%3Cellipse cx='75' cy='50' rx='18' ry='12' fill='%23FFB6C1'/%3E%3Cellipse cx='50' cy='75' rx='12' ry='18' fill='%23FFB6C1'/%3E%3Cellipse cx='25' cy='50' rx='18' ry='12' fill='%23FFB6C1'/%3E%3Ccircle cx='50' cy='50' r='12' fill='%23FFD700'/%3E%3C/svg%3E`,
  
  // Sun
  sun: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='22' fill='%23FFD700'/%3E%3Cg stroke='%23FFD700' stroke-width='4' stroke-linecap='round'%3E%3Cline x1='50' y1='5' x2='50' y2='20'/%3E%3Cline x1='50' y1='80' x2='50' y2='95'/%3E%3Cline x1='5' y1='50' x2='20' y2='50'/%3E%3Cline x1='80' y1='50' x2='95' y2='50'/%3E%3Cline x1='18' y1='18' x2='28' y2='28'/%3E%3Cline x1='72' y1='72' x2='82' y2='82'/%3E%3Cline x1='18' y1='82' x2='28' y2='72'/%3E%3Cline x1='72' y1='28' x2='82' y2='18'/%3E%3C/g%3E%3C/svg%3E`,
  
  // Cloud
  cloud: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='30' cy='55' rx='20' ry='15' fill='%23FDFBF7'/%3E%3Cellipse cx='55' cy='45' rx='25' ry='20' fill='%23FDFBF7'/%3E%3Cellipse cx='75' cy='55' rx='18' ry='14' fill='%23FDFBF7'/%3E%3Cellipse cx='50' cy='62' rx='30' ry='12' fill='%23FDFBF7'/%3E%3C/svg%3E`,
  
  // Rainbow arc
  rainbow: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M10 80 A40 40 0 0 1 90 80' fill='none' stroke='%23D64045' stroke-width='6'/%3E%3Cpath d='M16 80 A34 34 0 0 1 84 80' fill='none' stroke='%23FF8C42' stroke-width='6'/%3E%3Cpath d='M22 80 A28 28 0 0 1 78 80' fill='none' stroke='%23FFD700' stroke-width='6'/%3E%3Cpath d='M28 80 A22 22 0 0 1 72 80' fill='none' stroke='%233A6B5C' stroke-width='6'/%3E%3Cpath d='M34 80 A16 16 0 0 1 66 80' fill='none' stroke='%236A5ACD' stroke-width='6'/%3E%3C/svg%3E`,

  // Butterfly
  butterfly: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='30' cy='40' rx='18' ry='22' fill='%23FF69B4' transform='rotate(-20 30 40)'/%3E%3Cellipse cx='70' cy='40' rx='18' ry='22' fill='%23FF69B4' transform='rotate(20 70 40)'/%3E%3Cellipse cx='35' cy='68' rx='14' ry='15' fill='%23FFB6C1' transform='rotate(-15 35 68)'/%3E%3Cellipse cx='65' cy='68' rx='14' ry='15' fill='%23FFB6C1' transform='rotate(15 65 68)'/%3E%3Crect x='48' y='25' width='4' height='55' rx='2' fill='%23181410'/%3E%3C/svg%3E`,

  // Confetti dot
  dot: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%23D64045'/%3E%3C/svg%3E`,
};

// Cache for loaded images
const stickerCache = {};

function getSticker(name) {
  return new Promise((resolve) => {
    if (stickerCache[name]) {
      resolve(stickerCache[name]);
      return;
    }
    const url = STICKERS[name];
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      stickerCache[name] = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Draw a sticker at position with size
async function drawSticker(ctx, name, x, y, size) {
  const img = await getSticker(name);
  if (img) {
    ctx.drawImage(img, x - size/2, y - size/2, size, size);
  }
}

// Synchronous draw (if sticker is cached)
function drawStickerSync(ctx, name, x, y, size) {
  const img = stickerCache[name];
  if (img) {
    ctx.drawImage(img, x - size/2, y - size/2, size, size);
  }
}

// Preload all stickers
async function preloadStickers() {
  const names = Object.keys(STICKERS);
  await Promise.all(names.map(n => getSticker(n)));
  console.log(`Loaded ${names.length} stickers`);
}
