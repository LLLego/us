// ===== HTML FRAME OVERLAY SYSTEM =====
// Generates beautiful frames as HTML/CSS, renders via html2canvas to canvas.
// Based on reference designs from the original photobooth-frames project.

// Frame templates are HTML strings that get rendered into an overlay div,
// then captured as a transparent PNG and composited onto the photo canvas.

const HTML_FRAMES = {
  
  // ===== MINIMAL / CLEAN =====
  matte: {
    name: 'Matte', category: 'clean',
    palette: { bg: '#F7EFE0', ink: '#4A2F1F', accent: '#A86D4E', soft: '#C4906B', text: '#8B6650' },
    
    // Returns the frame as an HTML overlay string (transparent center)
    render: (w, h) => `
      <div style="position:relative;width:${w}px;height:${h}px;font-family:'Cormorant Garamond',serif;overflow:hidden">
        <!-- Paper background with grain texture -->
        <div style="position:absolute;inset:0;background:#F7EFE0;
          background-image:
            linear-gradient(180deg,rgba(255,255,255,0.5) 0%,transparent 30%,transparent 70%,rgba(180,130,90,0.08) 100%),
            url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.35 0 0 0 0 0.22 0 0 0 0.12 0'/></filter><rect width='100%' height='100%' filter='url(%23p)'/></svg>&quot;);
          box-shadow:inset 0 0 0 1px rgba(168,109,78,0.15),0 1px 0 rgba(255,255,255,0.6),0 30px 60px -20px rgba(80,50,30,0.25),0 80px 120px -40px rgba(80,50,30,0.2);
          padding:${Math.round(w*0.05)}px ${Math.round(w*0.04)}px ${Math.round(h*0.05)}px;
          display:flex;flex-direction:column"></div>

        <!-- Warm corner stains -->
        <div style="position:absolute;top:-100px;right:-100px;width:${Math.round(w*0.3)}px;height:${Math.round(w*0.3)}px;
          background:radial-gradient(circle,rgba(212,149,106,0.15) 0%,transparent 70%);pointer-events:none"></div>
        <div style="position:absolute;bottom:-120px;left:-80px;width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;
          background:radial-gradient(circle,rgba(168,109,78,0.12) 0%,transparent 70%);pointer-events:none"></div>

        <!-- Inner border lines -->
        <div style="position:absolute;inset:${Math.round(w*0.025)}px;border:1px solid rgba(168,109,78,0.25);pointer-events:none"></div>
        <div style="position:absolute;inset:${Math.round(w*0.03)}px;border:1px solid rgba(168,109,78,0.12);pointer-events:none"></div>

        <!-- Header -->
        <div style="position:absolute;top:${Math.round(h*0.035)}px;left:0;right:0;text-align:center;z-index:2">
          <div style="font-family:'Inter',sans-serif;font-size:${Math.max(8,Math.round(w*0.009))}px;letter-spacing:0.45em;text-transform:uppercase;color:#A86D4E;font-weight:500;display:inline-block">
            a small celebration
          </div>
        </div>

        <!-- Photo well border (transparent center area) -->
        <div style="position:absolute;
          top:${Math.round(h*0.09)}px;left:${Math.round(w*0.05)}px;right:${Math.round(w*0.05)}px;bottom:${Math.round(h*0.09)}px;
          border:1px solid rgba(168,109,78,0.2);
          box-shadow:inset 0 0 0 1px rgba(168,109,78,0.08);
          pointer-events:none;z-index:1"></div>
        <div style="position:absolute;
          top:${Math.round(h*0.09)+10}px;left:${Math.round(w*0.05)+10}px;right:${Math.round(w*0.05)+10}px;bottom:${Math.round(h*0.09)+10}px;
          border:1px solid rgba(247,239,224,0.25);
          pointer-events:none;z-index:1"></div>

        <!-- Tape top-left -->
        <div style="position:absolute;top:${Math.round(h*0.06)}px;left:-${Math.round(w*0.02)}px;
          width:${Math.round(w*0.09)}px;height:${Math.round(w*0.024)}px;
          background:rgba(212,149,106,0.25);
          background-image:linear-gradient(90deg,transparent,rgba(255,255,255,0.3) 50%,transparent);
          box-shadow:0 1px 3px rgba(74,47,31,0.15);
          transform:rotate(-32deg);z-index:6"></div>
        <!-- Tape top-right -->
        <div style="position:absolute;top:${Math.round(h*0.06)}px;right:-${Math.round(w*0.02)}px;
          width:${Math.round(w*0.09)}px;height:${Math.round(w*0.024)}px;
          background:rgba(212,149,106,0.25);
          background-image:linear-gradient(90deg,transparent,rgba(255,255,255,0.3) 50%,transparent);
          box-shadow:0 1px 3px rgba(74,47,31,0.15);
          transform:rotate(32deg);z-index:6"></div>

        <!-- Scattered stars -->
        <div style="position:absolute;top:${Math.round(h*0.07)}px;left:${Math.round(w*0.07)}px;color:#C4906B;font-size:${Math.max(8,Math.round(w*0.01))}px;opacity:0.5;transform:rotate(15deg);z-index:4;font-family:serif">✦</div>
        <div style="position:absolute;top:${Math.round(h*0.08)}px;right:${Math.round(w*0.09)}px;color:#C4906B;font-size:${Math.max(6,Math.round(w*0.007))}px;opacity:0.5;transform:rotate(-20deg);z-index:4;font-family:serif">✦</div>
        <div style="position:absolute;bottom:${Math.round(h*0.07)}px;left:${Math.round(w*0.08)}px;color:#C4906B;font-size:${Math.max(7,Math.round(w*0.008))}px;opacity:0.5;transform:rotate(25deg);z-index:4;font-family:serif">✦</div>
        <div style="position:absolute;bottom:${Math.round(h*0.075)}px;right:${Math.round(w*0.07)}px;color:#C4906B;font-size:${Math.max(7,Math.round(w*0.008))}px;opacity:0.5;transform:rotate(-10deg);z-index:4;font-family:serif">✦</div>

        <!-- Footer -->
        <div style="position:absolute;bottom:${Math.round(h*0.025)}px;left:0;right:0;text-align:center;z-index:2">
          <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:${Math.round(h*0.012)}px">
            <div style="flex:1;max-width:${Math.round(w*0.12)}px;height:1px;background:linear-gradient(90deg,transparent,#C4906B 30%,#C4906B 70%,transparent)"></div>
            <div style="color:#A86D4E;font-size:${Math.max(10,Math.round(w*0.014))}px;font-style:italic;font-family:serif">❦</div>
            <div style="flex:1;max-width:${Math.round(w*0.12)}px;height:1px;background:linear-gradient(90deg,transparent,#C4906B 30%,#C4906B 70%,transparent)"></div>
          </div>
          <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:${Math.max(12,Math.round(w*0.02))}px;color:#6B4A35;font-weight:400">
            the quiet kind of joy
          </div>
          <div style="font-family:'Inter',sans-serif;font-size:${Math.max(6,Math.round(w*0.007))}px;letter-spacing:0.4em;text-transform:uppercase;color:#8B6650;margin-top:6px">
            taken with love <span style="color:#C4906B;margin:0 8px">●</span> ours alone
          </div>
        </div>

        <!-- Date stamp -->
        <div style="position:absolute;top:${Math.round(h*0.045)}px;right:${Math.round(w*0.06)}px;
          border:1.5px solid rgba(247,239,224,0.7);padding:4px 10px;transform:rotate(4deg);
          font-family:'Courier New',monospace;color:rgba(247,239,224,0.9);font-size:${Math.max(7,Math.round(w*0.008))}px;
          letter-spacing:0.15em;background:rgba(74,47,31,0.15);backdrop-filter:blur(2px);z-index:7">
          ${new Date().toLocaleDateString('en-US',{year:'2-digit',month:'2-digit',day:'2-digit'}).replace(/\//g,' · ')}
        </div>

        <!-- Side text -->
        <div style="position:absolute;top:50%;left:${Math.round(w*0.012)}px;
          font-family:'Inter',sans-serif;font-size:${Math.max(6,Math.round(w*0.006))}px;
          letter-spacing:0.5em;text-transform:uppercase;color:rgba(139,102,80,0.6);
          writing-mode:vertical-rl;transform:translateY(-50%) rotate(180deg);z-index:3">
          — keepsake · no. 01 —
        </div>
      </div>
    `,
  },

  // ===== POLAROID =====
  polaroid: {
    name: 'Polaroid', category: 'clean',
    render: (w, h) => `
      <div style="position:relative;width:${w}px;height:${h}px;font-family:'Cormorant Garamond',serif;overflow:hidden">
        <!-- White gradient paper with texture -->
        <div style="position:absolute;inset:0;background:#FEFEF9;
          background-image:
            linear-gradient(180deg,#FEFEF9 0%,#FDFCF5 50%,#F8F6EE 100%),
            url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.35 0 0 0 0 0.22 0 0 0 0.08 0'/></filter><rect width='100%' height='100%' filter='url(%23p)'/></svg>&quot;);
          box-shadow:0 1px 1px rgba(24,20,16,0.08),0 4px 8px rgba(24,20,16,0.06),0 16px 32px rgba(24,20,16,0.04)"></div>

        <!-- Photo area = transparent (just borders around it) -->
        <!-- Top border -->
        <div style="position:absolute;top:0;left:0;right:0;height:${Math.round(h*0.05)}px;background:inherit;
          background-image:linear-gradient(180deg,#FEFEF9,#FDFCF5);
          box-shadow:inset 0 -1px 0 rgba(74,47,31,0.1)"></div>
        <!-- Side borders -->
        <div style="position:absolute;top:0;bottom:0;left:0;width:${Math.round(w*0.04)}px;background:inherit;
          background-image:linear-gradient(90deg,#FEFEF9,#FDFCF5)"></div>
        <div style="position:absolute;top:0;bottom:0;right:0;width:${Math.round(w*0.04)}px;background:inherit;
          background-image:linear-gradient(90deg,#FDFCF5,#FEFEF9)"></div>
        <!-- Bottom border (thick — for writing) -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:${Math.round(h*0.13)}px;
          background:linear-gradient(180deg,#FDFCF5,#F8F6EE);
          box-shadow:inset 0 1px 0 rgba(74,47,31,0.1)"></div>

        <!-- Inner shadow on photo area -->
        <div style="position:absolute;top:${Math.round(h*0.05)}px;left:${Math.round(w*0.04)}px;
          right:${Math.round(w*0.04)}px;bottom:${Math.round(h*0.13)}px;
          box-shadow:inset 0 2px 8px rgba(74,47,31,0.12),inset 0 0 0 1px rgba(0,0,0,0.05);
          pointer-events:none;z-index:1"></div>

        <!-- Date — handwritten, left-aligned -->
        <div style="position:absolute;bottom:${Math.round(h*0.055)}px;left:${Math.round(w*0.06)}px;
          font-family:'Caveat',cursive;font-size:${Math.max(14,Math.round(w*0.025))}px;color:#3A3530;font-weight:700;z-index:2">
          ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric'})}
        </div>
        <!-- Year — mono, faded right -->
        <div style="position:absolute;bottom:${Math.round(h*0.035)}px;right:${Math.round(w*0.06)}px;
          font-family:'Space Mono',monospace;font-size:${Math.max(9,Math.round(w*0.012))}px;
          color:rgba(58,53,48,0.35);z-index:2">
          ${new Date().getFullYear()}
        </div>
      </div>
    `,
  },

  // ===== FILM STRIP =====
  film: {
    name: 'Film', category: 'clean',
    render: (w, h) => `
      <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">
        <!-- Top film strip -->
        <div style="position:absolute;top:0;left:0;right:0;height:${Math.round(h*0.05)}px;
          background:linear-gradient(180deg,#1a1a1a,#0a0a0a);
          display:flex;align-items:center;justify-content:space-around;padding:0 ${Math.round(w*0.01)}px">
          ${Array.from({length: Math.floor(w/30)}, (_, i) => 
            `<div style="width:${Math.round(w*0.028)}px;height:${Math.round(h*0.03)}px;background:#F2EBE0;border-radius:2px"></div>`
          ).join('')}
        </div>
        <!-- Bottom film strip -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:${Math.round(h*0.05)}px;
          background:linear-gradient(0deg,#1a1a1a,#0a0a0a);
          display:flex;align-items:center;justify-content:space-around;padding:0 ${Math.round(w*0.01)}px">
          ${Array.from({length: Math.floor(w/30)}, (_, i) => 
            `<div style="width:${Math.round(w*0.028)}px;height:${Math.round(h*0.03)}px;background:#F2EBE0;border-radius:2px"></div>`
          ).join('')}
        </div>
        <!-- Brand stamp -->
        <div style="position:absolute;top:${Math.round(h*0.012)}px;left:50%;transform:translateX(-50%);
          font-family:'Space Mono',monospace;font-size:${Math.max(7,Math.round(w*0.008))}px;
          color:#F2EBE0;opacity:0.4;letter-spacing:0.3em;text-transform:uppercase;z-index:2">us.</div>
      </div>
    `,
  },

  // ===== PUCCA =====
  pucca: {
    name: 'Pucca', category: 'themed',
    render: (w, h) => `
      <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">
        <!-- Red gradient border -->
        ${['top','bottom','left','right'].map(side => {
          const isVert = side === 'left' || side === 'right';
          const bw = Math.round(w*0.045);
          const bh = Math.round(h*0.045);
          const pos = side === 'top' ? `top:0;left:0;right:0;height:${bh}px` :
                      side === 'bottom' ? `bottom:0;left:0;right:0;height:${bh}px` :
                      side === 'left' ? `top:0;bottom:0;left:0;width:${bw}px` :
                      `top:0;bottom:0;right:0;width:${bw}px`;
          return `<div style="position:absolute;${pos};background:linear-gradient(${isVert?'90deg':'180deg'},#E85A5F,#D64045);z-index:1"></div>`;
        }).join('')}

        <!-- Hearts in corners (die-cut style) -->
        ${[
          [Math.round(w*0.07), Math.round(h*0.07)],
          [Math.round(w*0.93), Math.round(h*0.07)],
          [Math.round(w*0.07), Math.round(h*0.93)],
          [Math.round(w*0.93), Math.round(h*0.93)],
        ].map(([x,y]) => `
          <div style="position:absolute;top:${y}px;left:${x}px;transform:translate(-50%,-50%);
            width:${Math.round(w*0.035)}px;height:${Math.round(w*0.035)}px;z-index:5;
            filter:drop-shadow(0 2px 4px rgba(24,20,16,0.15))">
            <svg viewBox="0 0 100 100" style="width:100%;height:100%">
              <path d="M50 88 C50 88 12 60 12 36 C12 22 22 12 34 12 C42 12 48 18 50 24 C52 18 58 12 66 12 C78 12 88 22 88 36 C88 60 50 88 50 88Z"
                fill="#D64045" stroke="#FAF1E0" stroke-width="6" stroke-linejoin="round"/>
              <circle cx="38" cy="38" r="3" fill="#1A1A2E"/>
              <circle cx="62" cy="38" r="3" fill="#1A1A2E"/>
              <path d="M35 50 Q50 60 65 50" stroke="#1A1A2E" stroke-width="2.5" fill="none"/>
            </svg>
          </div>
        `).join('')}

        <!-- Center heart at top -->
        <div style="position:absolute;top:${Math.round(h*0.045)}px;left:50%;transform:translateX(-50%);
          width:${Math.round(w*0.03)}px;height:${Math.round(w*0.03)}px;z-index:5">
          <svg viewBox="0 0 100 100" style="width:100%;height:100%">
            <path d="M50 88 C50 88 12 60 12 36 C12 22 22 12 34 12 C42 12 48 18 50 24 C52 18 58 12 66 12 C78 12 88 22 88 36 C88 60 50 88 50 88Z"
              fill="#D64045" stroke="#FAF1E0" stroke-width="5" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Love text at bottom -->
        <div style="position:absolute;bottom:${Math.round(h*0.015)}px;left:50%;transform:translateX(-50%);
          font-family:'Caveat',cursive;font-size:${Math.max(12,Math.round(w*0.02))}px;color:#FAF1E0;
          font-weight:700;z-index:3;white-space:nowrap">♥ love ♥</div>
      </div>
    `,
  },

  // ===== HELLO KITTY =====
  kitty: {
    name: 'Kitty', category: 'themed',
    render: (w, h) => `
      <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">
        <!-- White border with soft shadow -->
        ${['top','bottom','left','right'].map(side => {
          const bw = Math.round(w*0.045);
          const bh = Math.round(h*0.045);
          const pos = side === 'top' ? `top:0;left:0;right:0;height:${bh}px` :
                      side === 'bottom' ? `bottom:0;left:0;right:0;height:${bh}px` :
                      side === 'left' ? `top:0;bottom:0;left:0;width:${bw}px` :
                      `top:0;bottom:0;right:0;width:${bw}px`;
          return `<div style="position:absolute;${pos};background:#FFFBF5;
            box-shadow:0 0 8px rgba(24,20,16,0.08);z-index:1"></div>`;
        }).join('')}

        <!-- Red bows in corners (die-cut) -->
        ${[
          [Math.round(w*0.06), Math.round(h*0.06)],
          [Math.round(w*0.94), Math.round(h*0.06)],
          [Math.round(w*0.06), Math.round(h*0.94)],
          [Math.round(w*0.94), Math.round(h*0.94)],
        ].map(([x,y]) => `
          <div style="position:absolute;top:${y}px;left:${x}px;transform:translate(-50%,-50%);
            width:${Math.round(w*0.04)}px;height:${Math.round(w*0.04)}px;z-index:5;
            filter:drop-shadow(0 2px 4px rgba(24,20,16,0.15))">
            <svg viewBox="0 0 100 100" style="width:100%;height:100%">
              <ellipse cx="25" cy="50" rx="20" ry="16" fill="#D64045" stroke="#FFFBF5" stroke-width="4" stroke-linejoin="round" transform="rotate(-15 25 50)"/>
              <ellipse cx="75" cy="50" rx="20" ry="16" fill="#D64045" stroke="#FFFBF5" stroke-width="4" stroke-linejoin="round" transform="rotate(15 75 50)"/>
              <ellipse cx="50" cy="50" rx="12" ry="14" fill="#D64045" stroke="#FFFBF5" stroke-width="4" stroke-linejoin="round"/>
              <ellipse cx="25" cy="45" rx="8" ry="5" fill="#E85A5F" transform="rotate(-15 25 45)"/>
              <ellipse cx="75" cy="45" rx="8" ry="5" fill="#E85A5F" transform="rotate(15 75 45)"/>
            </svg>
          </div>
        `).join('')}

        <!-- Sparkles between bows -->
        ${[
          [Math.round(w*0.5), Math.round(h*0.04)],
          [Math.round(w*0.04), Math.round(h*0.5)],
          [Math.round(w*0.96), Math.round(h*0.5)],
          [Math.round(w*0.5), Math.round(h*0.96)],
        ].map(([x,y]) => `
          <div style="position:absolute;top:${y}px;left:${x}px;transform:translate(-50%,-50%);
            width:${Math.round(w*0.018)}px;height:${Math.round(w*0.018)}px;z-index:4;
            filter:drop-shadow(0 1px 3px rgba(232,145,160,0.4))">
            <svg viewBox="0 0 100 100" style="width:100%;height:100%">
              <path d="M50 5 C55 35 65 45 95 50 C65 55 55 65 50 95 C45 65 35 55 5 50 C35 45 45 35 50 5Z" fill="#FFD700" stroke="#FFFBF5" stroke-width="4" stroke-linejoin="round"/>
            </svg>
          </div>
        `).join('')}

        <!-- Date top-right -->
        <div style="position:absolute;top:${Math.round(h*0.015)}px;right:${Math.round(w*0.06)}px;
          font-family:'Fraunces',serif;font-size:${Math.max(8,Math.round(w*0.011))}px;
          color:rgba(58,53,48,0.4);font-style:italic;z-index:3">
          ${new Date().toLocaleDateString('en-US',{year:'2-digit',month:'2-digit',day:'2-digit'}).replace(/\//g,'.')}
        </div>
      </div>
    `,
  },

  // ===== HUNNY (Winnie the Pooh) =====
  hunny: {
    name: 'Hunny', category: 'themed',
    render: (w, h) => `
      <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">
        <!-- Golden gradient border -->
        ${['top','bottom','left','right'].map(side => {
          const bw = Math.round(w*0.05);
          const bh = Math.round(h*0.05);
          const pos = side === 'top' ? `top:0;left:0;right:0;height:${bh}px` :
                      side === 'bottom' ? `bottom:0;left:0;right:0;height:${bh}px` :
                      side === 'left' ? `top:0;bottom:0;left:0;width:${bw}px` :
                      `top:0;bottom:0;right:0;width:${bw}px`;
          const grad = side === 'top' ? '180deg,#E8B838,#D4A017' :
                       side === 'bottom' ? '0deg,#E8B838,#D4A017' :
                       side === 'left' ? '90deg,#E8B838,#D4A017' : '270deg,#E8B838,#D4A017';
          return `<div style="position:absolute;${pos};background:linear-gradient(${grad});z-index:1"></div>`;
        }).join('')}

        <!-- Inner line -->
        <div style="position:absolute;inset:${Math.round(w*0.05)+3}px;border:1px solid #8B5A00;opacity:0.3;pointer-events:none;z-index:2"></div>

        <!-- Honey pots in bottom corners -->
        ${[
          [Math.round(w*0.08), Math.round(h*0.92)],
          [Math.round(w*0.92), Math.round(h*0.92)],
        ].map(([x,y]) => `
          <div style="position:absolute;top:${y}px;left:${x}px;transform:translate(-50%,-50%);
            width:${Math.round(w*0.05)}px;height:${Math.round(w*0.05)}px;z-index:5;
            filter:drop-shadow(0 2px 4px rgba(74,47,31,0.2))">
            <svg viewBox="0 0 100 100" style="width:100%;height:100%">
              <path d="M25 30 L75 30 L80 40 L82 75 C82 82 76 88 50 88 C24 88 18 82 18 75 L20 40 Z" 
                fill="#D4A017" stroke="#8B5A00" stroke-width="2"/>
              <ellipse cx="50" cy="30" rx="25" ry="7" fill="#E8B838" stroke="#8B5A00" stroke-width="2"/>
              <text x="50" y="65" font-family="cursive" font-size="14" fill="#8B5A00" text-anchor="middle" font-style="italic">hunny</text>
            </svg>
          </div>
        `).join('')}

        <!-- Bees in top corners -->
        ${[
          [Math.round(w*0.1), Math.round(h*0.04)],
          [Math.round(w*0.9), Math.round(h*0.04)],
        ].map(([x,y]) => `
          <div style="position:absolute;top:${y}px;left:${x}px;transform:translate(-50%,-50%);
            width:${Math.round(w*0.025)}px;height:${Math.round(w*0.025)}px;z-index:5;
            filter:drop-shadow(0 1px 3px rgba(74,47,31,0.15))">
            <svg viewBox="0 0 100 100" style="width:100%;height:100%">
              <ellipse cx="50" cy="55" rx="25" ry="18" fill="#FFD700" stroke="#FFFBF5" stroke-width="3" stroke-linejoin="round"/>
              <rect x="42" y="38" width="5" height="34" fill="#181410" rx="2"/>
              <rect x="53" y="38" width="5" height="34" fill="#181410" rx="2"/>
              <ellipse cx="35" cy="38" rx="12" ry="7" fill="rgba(255,255,255,0.8)" stroke="#FFFBF5" stroke-width="2"/>
              <ellipse cx="65" cy="38" rx="12" ry="7" fill="rgba(255,255,255,0.8)" stroke="#FFFBF5" stroke-width="2"/>
              <circle cx="45" cy="48" r="2" fill="#181410"/>
            </svg>
          </div>
        `).join('')}

        <!-- Hunny text -->
        <div style="position:absolute;bottom:${Math.round(h*0.018)}px;left:50%;transform:translateX(-50%);
          font-family:'Caveat',cursive;font-size:${Math.max(12,Math.round(w*0.02))}px;color:#8B5A00;
          font-weight:700;font-style:italic;z-index:3">hunny</div>
      </div>
    `,
  },
};

// ===== RENDER ENGINE =====
// Renders an HTML frame to a canvas overlay using a hidden div + html2canvas

const frameRenderer = {
  overlayDiv: null,
  
  init() {
    // Create hidden rendering div
    this.overlayDiv = document.createElement('div');
    this.overlayDiv.style.cssText = 'position:absolute;left:-9999px;top:0;z-index:-1';
    document.body.appendChild(this.overlayDiv);
  },
  
  async renderToCanvas(frameKey, canvas) {
    const frame = HTML_FRAMES[frameKey];
    if (!frame) return;
    
    const w = canvas.width;
    const h = canvas.height;
    
    // Set the HTML
    this.overlayDiv.innerHTML = frame.render(w, h);
    this.overlayDiv.style.width = w + 'px';
    this.overlayDiv.style.height = h + 'px';
    
    // Wait for render
    await new Promise(r => setTimeout(r, 50));
    
    // Use html2canvas if available, otherwise manual composite
    if (typeof html2canvas !== 'undefined') {
      const frameCanvas = await html2canvas(this.overlayDiv.firstChild, {
        backgroundColor: null, // transparent
        width: w,
        height: h,
        scale: 1,
        logging: false,
      });
      const ctx = canvas.getContext('2d');
      ctx.drawImage(frameCanvas, 0, 0);
    }
  },
  
  // For preview thumbnails
  async renderThumbnail(frameKey, size = 108) {
    const frame = HTML_FRAMES[frameKey];
    if (!frame) return null;
    
    const h = Math.round(size * 1.25); // 4:5 ratio
    this.overlayDiv.innerHTML = frame.render(size, h);
    this.overlayDiv.style.width = size + 'px';
    this.overlayDiv.style.height = h + 'px';
    
    await new Promise(r => setTimeout(r, 50));
    
    if (typeof html2canvas !== 'undefined') {
      return await html2canvas(this.overlayDiv.firstChild, {
        backgroundColor: null,
        width: size,
        height: h,
        scale: 1,
        logging: false,
      });
    }
    return null;
  },
};
