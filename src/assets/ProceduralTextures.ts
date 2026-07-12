import * as THREE from 'three';

/**
 * Canvas-generated textures for the cozy diorama art direction. Everything is
 * procedural — no external assets. Each generator returns a ready THREE
 * texture (SRGB color space, anisotropy left to caller).
 */

const PALETTE = {
  cream: '#f3ead8',
  creamShadow: '#e7dbc4',
  dustyRose: '#c98a8a',
  dustyRoseDeep: '#a96868',
  sage: '#8ba888',
  sageDeep: '#6c8a6b',
  honey: '#d9a45b',
  honeyDeep: '#b9823c',
  teal: '#6fa3a0',
  tealDeep: '#4f807d',
  walnut: '#5a4634',
  woodWarm: '#a97e52',
  duskBlue: '#5c6b8c',
  duskBlueDeep: '#3d4a68',
} as const;

export { PALETTE };

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

/** Deterministic pseudo-random so screenshots stay stable between runs. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generic warm wood grain, tintable via material.color. */
export function createWoodTexture(base = '#b98d5f', dark = '#8a6238', seed = 7): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = mulberry(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  // Long grain streaks.
  for (let i = 0; i < 160; i += 1) {
    const y = rand() * 512;
    const alpha = 0.05 + rand() * 0.12;
    const width = 1 + rand() * 2.4;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    let x = -20;
    let yy = y;
    ctx.moveTo(x, yy);
    while (x < 532) {
      x += 24 + rand() * 30;
      yy += (rand() - 0.5) * 7;
      ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // Occasional knots.
  for (let i = 0; i < 5; i += 1) {
    const x = rand() * 512;
    const y = rand() * 512;
    for (let ring = 5; ring >= 1; ring -= 1) {
      ctx.globalAlpha = 0.05 + 0.03 * ring;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y, ring * 4.5, ring * 2.6, rand() * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, true);
}

/** Plank floor with visible board seams; repeats. */
export function createFloorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = mulberry(21);
  const plankH = 512 / 6;
  for (let p = 0; p < 6; p += 1) {
    const tone = 0.88 + rand() * 0.22;
    ctx.fillStyle = shade('#9c7148', tone);
    ctx.fillRect(0, p * plankH, 512, plankH);
    // Grain.
    for (let i = 0; i < 26; i += 1) {
      ctx.globalAlpha = 0.06 + rand() * 0.08;
      ctx.strokeStyle = '#6d4b2c';
      ctx.lineWidth = 1 + rand() * 1.6;
      const y = p * plankH + rand() * plankH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(150, y + (rand() - 0.5) * 6, 360, y + (rand() - 0.5) * 6, 512, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Seam.
    ctx.fillStyle = 'rgba(40, 26, 14, 0.55)';
    ctx.fillRect(0, p * plankH, 512, 3);
    // Butt joints.
    const joint = rand() * 512;
    ctx.fillRect(joint, p * plankH, 3, plankH);
  }
  return toTexture(canvas, true);
}

function shade(hex: string, factor: number): string {
  const c = new THREE.Color(hex).multiplyScalar(factor);
  return `#${c.getHexString()}`;
}

/**
 * The hero playfield: cream board with painted center line/circle, faceoff
 * decals, goal creases in each player's color, and a hint of air holes.
 * Canvas ratio matches the table (width : length = 1 : 1.8).
 */
export function createPlayfieldTexture(): THREE.CanvasTexture {
  const W = 640;
  const H = 1152;
  const [canvas, ctx] = makeCanvas(W, H);
  const rand = mulberry(99);

  // Cream base with soft mottled paint.
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 240; i += 1) {
    ctx.globalAlpha = 0.02 + rand() * 0.03;
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : PALETTE.creamShadow;
    const r = 14 + rand() * 60;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Air holes: subtle dot grid (skip the painted lines area lightly).
  ctx.fillStyle = 'rgba(120, 104, 82, 0.16)';
  const step = 26;
  for (let y = step; y < H - step / 2; y += step) {
    for (let x = step; x < W - step / 2; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const rose = PALETTE.dustyRoseDeep;
  const teal = PALETTE.tealDeep;
  const cx = W / 2;
  const cy = H / 2;

  // Painted border inset.
  ctx.strokeStyle = 'rgba(90, 70, 52, 0.5)';
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  // Center line (player half is bottom, +Z maps to +V here; rose bottom).
  ctx.fillStyle = rose;
  ctx.fillRect(0, cy - 4, W, 8);

  // Center circle + tiny heart at faceoff spot.
  ctx.lineWidth = 8;
  ctx.strokeStyle = rose;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.stroke();
  drawHeart(ctx, cx, cy, 15, PALETTE.honeyDeep);

  // Faceoff decals: two dots per half with small rings.
  for (const [fx, fy, color] of [
    [W * 0.28, H * 0.26, teal],
    [W * 0.72, H * 0.26, teal],
    [W * 0.28, H * 0.74, rose],
    [W * 0.72, H * 0.74, rose],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(fx, fy, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(fx, fy, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Goal creases (semi circles at each end) + trim tick marks.
  const creaseR = 150;
  ctx.lineWidth = 8;
  ctx.strokeStyle = teal;
  ctx.beginPath();
  ctx.arc(cx, 6, creaseR, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = rose;
  ctx.beginPath();
  ctx.arc(cx, H - 6, creaseR, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Sun/star doodles in the corners — toy charm.
  drawStar(ctx, 56, 66, 16, PALETTE.honeyDeep, 0.85);
  drawStar(ctx, W - 56, 66, 16, PALETTE.honeyDeep, 0.85);
  drawStar(ctx, 56, H - 66, 16, PALETTE.honeyDeep, 0.85);
  drawStar(ctx, W - 56, H - 66, 16, PALETTE.honeyDeep, 0.85);

  const texture = toTexture(canvas);
  return texture;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y - size * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(-size, -size * 0.45, -size * 0.5, -size, 0, -size * 0.35);
  ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.45, 0, size * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Round rug with concentric folk pattern in the palette colors. */
export function createRugTexture(): THREE.CanvasTexture {
  const S = 512;
  const [canvas, ctx] = makeCanvas(S, S);
  const c = S / 2;
  const rings: Array<[number, string]> = [
    [250, PALETTE.dustyRose],
    [226, PALETTE.cream],
    [206, PALETTE.sage],
    [178, PALETTE.cream],
    [156, PALETTE.teal],
    [124, PALETTE.cream],
    [100, PALETTE.honey],
    [64, PALETTE.cream],
    [40, PALETTE.dustyRose],
  ];
  for (const [r, color] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Folk dashes and dots around two of the cream bands.
  ctx.fillStyle = PALETTE.dustyRoseDeep;
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(a) * 192, c + Math.sin(a) * 192);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillRect(-2.5, -9, 5, 18);
    ctx.restore();
  }
  ctx.fillStyle = PALETTE.tealDeep;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2 + 0.13;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * 112, c + Math.sin(a) * 112, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    drawStar(ctx, c + Math.cos(a) * 82, c + Math.sin(a) * 82, 9, PALETTE.sageDeep);
  }
  drawHeart(ctx, c, c, 20, PALETTE.dustyRoseDeep);

  // Weave noise.
  const rand = mulberry(4);
  for (let i = 0; i < 2200; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 250;
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = rand() > 0.5 ? '#000000' : '#ffffff';
    ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 1);
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

/** Dusk-blue wall paint with subtle mottling; repeats. */
export function createWallTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = mulberry(31);
  ctx.fillStyle = PALETTE.duskBlue;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 340; i += 1) {
    ctx.globalAlpha = 0.025 + rand() * 0.035;
    ctx.fillStyle = rand() > 0.45 ? PALETTE.duskBlueDeep : '#7787ab';
    const r = 6 + rand() * 34;
    const x = rand() * 256;
    const y = rand() * 256;
    // Draw wrapped so the texture tiles without seams.
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, true);
}

/** Dusk sky seen through the window: warm horizon fading to deep blue. */
export function createSkyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2c3a63');
  grad.addColorStop(0.45, '#5c6b9c');
  grad.addColorStop(0.72, '#c98a7a');
  grad.addColorStop(1, '#f0c98f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Soft sun glow low on the horizon.
  const sun = ctx.createRadialGradient(170, 200, 4, 170, 200, 70);
  sun.addColorStop(0, 'rgba(255, 236, 190, 0.95)');
  sun.addColorStop(1, 'rgba(255, 236, 190, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 256, 256);

  // A couple of early stars and distant rooftops.
  const rand = mulberry(8);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 14; i += 1) {
    ctx.globalAlpha = 0.3 + rand() * 0.6;
    ctx.fillRect(rand() * 256, rand() * 90, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a3050';
  for (let x = 0; x < 256; ) {
    const w = 18 + rand() * 30;
    const h = 14 + rand() * 26;
    ctx.fillRect(x, 256 - h, w, h);
    // Tiny lit windows.
    if (rand() > 0.4) {
      ctx.fillStyle = 'rgba(255, 214, 140, 0.9)';
      ctx.fillRect(x + 4 + rand() * (w - 10), 256 - h + 4 + rand() * (h - 8), 3, 4);
      ctx.fillStyle = '#2a3050';
    }
    x += w + 2;
  }
  return toTexture(canvas);
}

/** Poster art variants, canvas-drawn. */
export function createPosterTexture(variant: 0 | 1 | 2): THREE.CanvasTexture {
  const W = 256;
  const H = 320;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.walnut;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  if (variant === 0) {
    // "AIR HOCKEY CUP" tournament poster with crossed mallets.
    ctx.fillStyle = PALETTE.dustyRoseDeep;
    ctx.fillRect(20, 20, W - 40, 64);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AIR HOCKEY', W / 2, 52);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('CUP  ’84', W / 2, 76);
    // Crossed mallet silhouettes.
    ctx.save();
    ctx.translate(W / 2, 190);
    for (const rot of [-0.5, 0.5]) {
      ctx.save();
      ctx.rotate(rot);
      ctx.fillStyle = rot < 0 ? PALETTE.dustyRose : PALETTE.teal;
      ctx.beginPath();
      ctx.ellipse(0, 34, 44, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-9, -46, 18, 80);
      ctx.beginPath();
      ctx.arc(0, -50, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    drawStar(ctx, W / 2, 286, 18, PALETTE.honeyDeep);
  } else if (variant === 1) {
    // Rocket pennant-style poster.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3d4a68');
    sky.addColorStop(1, '#6fa3a0');
    ctx.fillStyle = sky;
    ctx.fillRect(14, 14, W - 28, H - 28);
    const rand = mulberry(77);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 30; i += 1) {
      ctx.globalAlpha = 0.4 + rand() * 0.6;
      ctx.fillRect(20 + rand() * (W - 40), 20 + rand() * (H - 60), 2, 2);
    }
    ctx.globalAlpha = 1;
    // Rocket.
    ctx.save();
    ctx.translate(W / 2, 150);
    ctx.rotate(0.3);
    ctx.fillStyle = PALETTE.cream;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.dustyRoseDeep;
    ctx.beginPath();
    ctx.moveTo(-26, 30);
    ctx.lineTo(-46, 70);
    ctx.lineTo(-14, 52);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, 30);
    ctx.lineTo(46, 70);
    ctx.lineTo(14, 52);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(-18, -34);
    ctx.lineTo(18, -34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.teal;
    ctx.beginPath();
    ctx.arc(0, -14, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.honey;
    ctx.beginPath();
    ctx.moveTo(-10, 62);
    ctx.lineTo(0, 96);
    ctx.lineTo(10, 62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TO THE MOON', W / 2, 292);
  } else {
    // Mountains-at-dusk mini landscape.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#5c6b9c');
    sky.addColorStop(1, '#f0c98f');
    ctx.fillStyle = sky;
    ctx.fillRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = '#f7e3b8';
    ctx.beginPath();
    ctx.arc(190, 84, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.sageDeep;
    ctx.beginPath();
    ctx.moveTo(14, H - 14);
    ctx.lineTo(84, 130);
    ctx.lineTo(168, H - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.sage;
    ctx.beginPath();
    ctx.moveTo(96, H - 14);
    ctx.lineTo(188, 160);
    ctx.lineTo(W - 14, H - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WANDER OFTEN', W / 2, 42);
  }
  return toTexture(canvas);
}

/** One letter block face (toy blocks). */
export function createBlockLetterTexture(letter: string, bg: string, fg: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(64, 64);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, 54, 54);
  ctx.fillStyle = fg;
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 32, 35);
  return toTexture(canvas);
}

/** Tiny star decal for the puck top. */
export function createPuckDecalTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  drawStar(ctx, 64, 64, 40, '#f3d9a4');
  ctx.strokeStyle = 'rgba(243, 217, 164, 0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.stroke();
  const texture = toTexture(canvas);
  return texture;
}

/** Soft radial glow sprite (trail discs, dust motes, blob shadows). */
export function createGlowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.42)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(canvas);
}
