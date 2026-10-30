/**
 * Hand-painted UI shapes (Figma "stylized strokes"), drawn to canvases:
 * - cards: a slightly skewed quadrilateral with jittered edges, dry-brush streaks
 *   bleeding out and dark flecks just inside;
 * - pill buttons: the same treatment around a capsule;
 * - the selection ring: brush strokes laid along a rounded square.
 */

const FILL = '#1f1f1f';
const MARGIN = 10;

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** A torn card in FILL, the accent color for an `.accent` card, or the card's own `--card-fill`. */
function paint(el: HTMLElement, seed: number) {
  const own = getComputedStyle(el).getPropertyValue('--card-fill').trim();
  const fill = own || (el.classList.contains('accent') ? cssVar('--accent') || '#7cc7ff' : FILL);
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = w + MARGIN * 2;
  const H = h + MARGIN * 2;
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const r = rng(seed);

  // Skewed corners: each pushed in by a few pixels.
  const m = MARGIN;
  const corners: [number, number][] = [
    [m + r() * 4, m + 4 + r() * 6],
    [W - m - r() * 3, m + r() * 3],
    [W - m - 1 - r() * 4, H - m - r() * 3],
    [m + r() * 3, H - m - 3 - r() * 5],
  ];

  // Jittered outline: small wobble everywhere, occasional chips.
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % 4];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const steps = Math.max(2, Math.round(len / 5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      let j = (r() - 0.5) * 1.6;
      if (r() < 0.06) j -= 1.5 + r() * 2.5;
      const x = x0 + (x1 - x0) * t + nx * j;
      const y = y0 + (y1 - y0) * t + ny * j;
      if (i === 0 && s === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();

  // Dry-brush streaks along each edge: light ones bleed out, dark ones sit inside.
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % 4];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    // Outward normal (points away from the card's center).
    const nx = uy;
    const ny = -ux;
    const horizontal = i % 2 === 0;
    const count = Math.round(len / (horizontal ? 7 : 11));
    for (let k = 0; k < count; k++) {
      const t = r();
      const bx = x0 + (x1 - x0) * t;
      const by = y0 + (y1 - y0) * t;
      const out = r() < 0.55;
      const off = out ? r() * 4.5 : -(1 + r() * 5);
      const l = (horizontal ? 8 : 5) + r() * (horizontal ? 46 : 22);
      const x = bx + nx * off;
      const y = by + ny * off;
      g.strokeStyle = out ? rgba(fill, 0.55 + r() * 0.45) : `rgba(0,0,0,${0.25 + r() * 0.45})`;
      g.lineWidth = 0.6 + r() * (out ? 2.4 : 1.6);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + ux * l + nx * (r() - 0.5) * 1.5, y + uy * l + ny * (r() - 0.5) * 1.5);
      g.stroke();
    }
  }

  // Drawn by `.rough::before`, which extends MARGIN past the element so streaks can bleed out.
  el.style.setProperty('--rough', `url(${c.toDataURL()})`);
}

/**
 * A brushed strip for `.rough.strip` (the filter bar): top and bottom only gently torn, the
 * ends breaking up into dry-brush streaks, as if the stroke ran out of paint.
 */
function paintStrip(el: HTMLElement, seed: number) {
  const fill = getComputedStyle(el).getPropertyValue('--card-fill').trim() || FILL;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return;
  const m = MARGIN;
  const { c, g } = makeCanvas(w + m * 2, h + m * 2);
  const r = rng(seed);
  // The solid body stops short of the ends, where the streaks take over.
  const fade = Math.min(80, w * 0.16);
  const x0 = m + fade;
  const x1 = m + w - fade;
  const step = 4;
  g.beginPath();
  for (let x = x0; x <= x1; x += step) g.lineTo(x, m + (r() - 0.5) * 1.4 + (r() < 0.05 ? 1.2 : 0));
  for (let x = x1; x >= x0; x -= step) g.lineTo(x, m + h + (r() - 0.5) * 1.4 - (r() < 0.05 ? 1.2 : 0));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  // Each end: horizontal bristle streaks of every length, thinning out towards the tip.
  for (const dir of [-1, 1]) {
    const base = dir < 0 ? x0 + 12 : x1 - 12;
    const reach = fade + m - 3;
    for (let k = 0; k < h * 3; k++) {
      const y = m + 1 + r() * (h - 2);
      // Mostly short, a few running nearly to the tip; the longer, the fainter and thinner.
      const t = Math.pow(r(), 1.4);
      const len = 12 + t * reach;
      g.strokeStyle = rgba(fill, (0.95 - t * 0.6) * (0.6 + r() * 0.4));
      g.lineWidth = (0.8 + r() * 3) * (1 - t * 0.5);
      g.beginPath();
      g.moveTo(base, y);
      g.lineTo(base + dir * len, y + (r() - 0.5) * 2);
      g.stroke();
    }
  }
  // A few light streaks along the body for texture, and dark flecks inside.
  for (let k = 0; k < w / 12; k++) {
    const x = x0 + r() * (x1 - x0);
    const y = m + 2 + r() * (h - 4);
    g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.12 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 8 + r() * 40, y + (r() - 0.5));
    g.stroke();
  }
  el.style.setProperty('--rough', `url(${c.toDataURL()})`);
}

interface Sample {
  x: number;
  y: number;
  /** Outward normal. */
  nx: number;
  ny: number;
  /** Tangent, clockwise. */
  tx: number;
  ty: number;
}

/** Points every ~`step` px around a rounded rectangle, clockwise from the top-left. */
function roundedRect(x: number, y: number, w: number, h: number, rad: number, step: number): Sample[] {
  const out: Sample[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny, tx: -ny, ty: nx });
    }
  };
  const arc = (cx: number, cy: number, a0: number) => {
    const n = Math.max(2, Math.round((rad * Math.PI) / 2 / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      out.push({ x: cx + nx * rad, y: cy + ny * rad, nx, ny, tx: -ny, ty: nx });
    }
  };
  edge(x + rad, y, x + w - rad, y, 0, -1);
  arc(x + w - rad, y + rad, -Math.PI / 2);
  edge(x + w, y + rad, x + w, y + h - rad, 1, 0);
  arc(x + w - rad, y + h - rad, 0);
  edge(x + w - rad, y + h, x + rad, y + h, 0, 1);
  arc(x + rad, y + h - rad, Math.PI / 2);
  edge(x, y + h - rad, x, y + rad, -1, 0);
  arc(x + rad, y + rad, Math.PI);
  return out;
}

function makeCanvas(w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.lineCap = 'round';
  return { c, g };
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Stroke a run of samples (following curves) shifted along the normal by `off`. */
function strokeAlong(g: CanvasRenderingContext2D, pts: Sample[], start: number, count: number, off: number) {
  g.beginPath();
  for (let k = 0; k <= count; k++) {
    const p = pts[(start + k) % pts.length];
    const x = p.x + p.nx * off;
    const y = p.y + p.ny * off;
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

const PILL_MARGIN = 6;

/** A capsule with a torn edge and brush streaks, in `color`. */
function paintPill(w: number, h: number, color: string, seed: number): string {
  const W = w + PILL_MARGIN * 2;
  const H = h + PILL_MARGIN * 2;
  const { c, g } = makeCanvas(W, H);
  const r = rng(seed);
  const pts = roundedRect(PILL_MARGIN, PILL_MARGIN, w, h, Math.min(w, h) / 2, 3);

  g.beginPath();
  pts.forEach((p, i) => {
    let j = (r() - 0.5) * 1.2;
    if (r() < 0.05) j -= 1 + r() * 2;
    const x = p.x + p.nx * j;
    const y = p.y + p.ny * j;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
  g.fillStyle = color;
  g.fill();

  const count = Math.round(pts.length / 1.6);
  for (let k = 0; k < count; k++) {
    const i = Math.floor(r() * pts.length);
    const out = r() < 0.55;
    g.strokeStyle = out ? rgba(color, 0.5 + r() * 0.5) : `rgba(0,0,0,${0.12 + r() * 0.25})`;
    g.lineWidth = 0.6 + r() * (out ? 1.8 : 1.2);
    strokeAlong(g, pts, i, 2 + Math.floor(r() * (out ? 8 : 4)), out ? r() * 3 : -(1 + r() * 3));
  }
  return c.toDataURL();
}

/**
 * Selection ring: a torn dry-brush stroke laid along a rounded square of `size` (radius
 * `rad`), spread over a band of `band` px centered on its edge. The image is
 * `size + 2 * pad` square.
 */
export function brushRing(size: number, rad: number, band: number, pad: number, color: string, seed = 5): string {
  const S = size + pad * 2;
  const { c, g } = makeCanvas(S, S);
  const r = rng(seed);
  const pts = roundedRect(pad, pad, size, size, rad, 2);

  // The core in uneven dabs: each a little off the edge and its own width, with the odd gap.
  for (let i = 0; i < pts.length; ) {
    const len = 6 + Math.floor(r() * 22);
    g.strokeStyle = rgba(color, 0.75 + r() * 0.25);
    g.lineWidth = band * (0.3 + r() * 0.4);
    strokeAlong(g, pts, i, len, (r() - 0.5) * band * 0.35);
    i += len - (r() < 0.2 ? -1 - Math.floor(r() * 3) : 1);
  }
  // Streaks across the whole band for texture.
  const count = pts.length * 4;
  for (let k = 0; k < count; k++) {
    g.strokeStyle = rgba(color, 0.25 + r() * 0.75);
    g.lineWidth = 0.6 + r() * 2.4;
    strokeAlong(g, pts, Math.floor(r() * pts.length), 2 + Math.floor(r() * 16), (r() - 0.5) * band * 1.4);
  }
  // Stray bristles flicking out past the band.
  for (let k = 0; k < 46; k++) {
    g.strokeStyle = rgba(color, 0.3 + r() * 0.5);
    g.lineWidth = 0.5 + r();
    strokeAlong(g, pts, Math.floor(r() * pts.length), 1 + Math.floor(r() * 5), (r() < 0.5 ? -1 : 1) * band * (0.6 + r() * 0.5));
  }
  // Dark nicks and tears through it so it doesn't look machine-perfect.
  for (let k = 0; k < 28; k++) {
    g.strokeStyle = `rgba(0,0,0,${0.35 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 2.2;
    strokeAlong(g, pts, Math.floor(r() * pts.length), 1 + Math.floor(r() * 4), (r() - 0.5) * band * 0.8);
  }
  return c.toDataURL();
}

/**
 * A torn square to mask an image with: white inside an edge that wobbles, is bitten into
 * here and there, and frays into short bristles (across the edge, never along it, so it
 * reads as torn paper rather than a frame). `size` px square; `strength` scales how torn
 * it is (1 for portraits, lower for small boxes).
 */
export function tornSquare(size: number, seed: number, strength = 1, rad = 7): string {
  const { c, g } = makeCanvas(size, size);
  const r = rng(seed);
  const m = 2 + 3.5 * strength;
  const pts = roundedRect(m, m, size - m * 2, size - m * 2, rad, 1.5);
  // Slow wobble plus grain, and bites: a few px deep, a few samples wide.
  const p1 = r() * 6.3;
  const p2 = r() * 6.3;
  const bite = new Float32Array(pts.length);
  for (let k = 0; k < pts.length * 0.035 * strength; k++) {
    const at = Math.floor(r() * pts.length);
    const w = 2 + Math.floor(r() * 5);
    const d = (1.5 + r() * 3.5) * strength;
    for (let q = -w; q <= w; q++) bite[(at + q + pts.length) % pts.length] = Math.max(bite[(at + q + pts.length) % pts.length], d * (1 - Math.abs(q) / (w + 1)));
  }
  const edgeAt = new Float32Array(pts.length);
  g.beginPath();
  pts.forEach((p, i) => {
    const t = (i / pts.length) * Math.PI * 2;
    const j = (Math.sin(t * 7 + p1) * 0.9 + Math.sin(t * 19 + p2) * 0.5 + (r() - 0.5) * 1.1) * strength - bite[i];
    edgeAt[i] = j;
    const x = p.x + p.nx * j;
    const y = p.y + p.ny * j;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
  g.fillStyle = '#fff';
  g.fill();
  // Fraying: short bristles across the edge, some sticking out, some cut in.
  for (let k = 0; k < pts.length * 1.4 * strength; k++) {
    const i = Math.floor(r() * pts.length);
    const p = pts[i];
    const out = r() < 0.55;
    const len = (1 + r() * 4) * strength;
    // From just inside the torn edge outwards, or from just outside it inwards.
    const start = edgeAt[i] + (out ? -0.5 : 0.8);
    g.globalCompositeOperation = out ? 'source-over' : 'destination-out';
    g.strokeStyle = out ? `rgba(255,255,255,${0.4 + r() * 0.6})` : `rgba(0,0,0,${0.5 + r() * 0.5})`;
    g.lineWidth = 0.5 + r() * 1.1;
    const sx = p.x + p.nx * start;
    const sy = p.y + p.ny * start;
    const dir = out ? 1 : -1;
    const lean = (r() - 0.5) * 0.6;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + (p.nx + p.tx * lean) * len * dir, sy + (p.ny + p.ty * lean) * len * dir);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  return c.toDataURL();
}

/**
 * A thin torn frame in `color` around a rounded square of `size` (radius `rad`), `width` px
 * thick with dry-brush streaks off both edges, like the Lock in pill's. The image is
 * `size + 2 * pad` square.
 */
export function tornFrame(size: number, rad: number, width: number, pad: number, color: string, seed = 5): string {
  const S = size + pad * 2;
  const { c, g } = makeCanvas(S, S);
  const r = rng(seed);
  const pts = roundedRect(pad, pad, size, size, rad, 2);
  const edge = (side: number) => {
    pts.forEach((p, i) => {
      // Wobble only outwards, so the band never thins to a gap.
      let j = r() * 1.2;
      if (r() < 0.07) j += 1 + r() * 2.5;
      const o = side * (width / 2 + j);
      const x = p.x + p.nx * o;
      const y = p.y + p.ny * o;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
  };
  g.beginPath();
  edge(1);
  edge(-1);
  g.fillStyle = color;
  g.fill('evenodd');
  // Streaks off both edges fray it; the band itself stays unbroken.
  for (let k = 0; k < pts.length * 1.2; k++) {
    const out = r() < 0.5 ? 1 : -1;
    g.strokeStyle = rgba(color, 0.4 + r() * 0.6);
    g.lineWidth = 0.5 + r() * 1.8;
    strokeAlong(g, pts, Math.floor(r() * pts.length), 2 + Math.floor(r() * 10), out * (width / 2 + r() * 2.5));
  }
  // Only a few faint dry spots inside it.
  for (let k = 0; k < pts.length * 0.06; k++) {
    g.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.15})`;
    g.lineWidth = 0.5 + r() * 0.8;
    strokeAlong(g, pts, Math.floor(r() * pts.length), 2 + Math.floor(r() * 6), (r() - 0.5) * width * 0.5);
  }
  return c.toDataURL();
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Weak, so cards that get re-rendered away don't stay around.
const seeds = new WeakMap<Element, number>();
let nextSeed = 1;
let observer: ResizeObserver | null = null;

function paintOne(el: HTMLElement) {
  if (!seeds.has(el)) seeds.set(el, 1013 * nextSeed++);
  const seed = seeds.get(el)!;
  if (el.classList.contains('pill') || el.classList.contains('brush')) {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const accent = cssVar('--accent') || '#7cc7ff';
    el.style.setProperty('--brush', `url(${paintPill(w, h, accent, seed)})`);
    if (el.classList.contains('pill')) el.style.setProperty('--brush-off', `url(${paintPill(w, h, '#3a3a40', seed)})`);
  } else if (el.classList.contains('strip')) {
    paintStrip(el, seed);
  } else {
    paint(el, seed);
  }
}

/** Paint one `.rough` / `.pill` / `.brush` element now and again whenever it changes size. */
export function roughen(el: HTMLElement) {
  observer ??= new ResizeObserver((entries) => {
    for (const e of entries) paintOne(e.target as HTMLElement);
  });
  paintOne(el);
  observer.observe(el);
}

/** Stop repainting the rough shapes inside `root` (before it's re-rendered). */
export function release(root: Element) {
  if (!observer) return;
  for (const el of root.querySelectorAll('.rough, .pill, .brush')) observer.unobserve(el);
}

/**
 * Paint every `.rough` card, `.pill` button and `.brush` stroke (e.g. a scrollbar
 * thumb) on the page. Pills get two images: `--brush` (accent) and `--brush-off`
 * (disabled); brush strokes only `--brush`. Elements added later go through roughen().
 */
export function roughenCards() {
  for (const el of document.querySelectorAll<HTMLElement>('.rough, .pill, .brush')) roughen(el);
}
