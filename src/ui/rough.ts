/**
 * Torn-paper card backgrounds (Figma "stylized strokes"): a slightly skewed
 * quadrilateral with jittered edges, dry-brush streaks bleeding out of the
 * edges and dark flecks just inside them. Painted to a canvas at the element's
 * size and used as its background image.
 */

const FILL = '#1f1f1f';
const MARGIN = 10;

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function paint(el: HTMLElement, seed: number) {
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
  g.fillStyle = FILL;
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
      g.strokeStyle = out ? `rgba(31,31,31,${0.55 + r() * 0.45})` : `rgba(0,0,0,${0.25 + r() * 0.45})`;
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

/** Paint every `.rough` element now and again whenever it changes size. */
export function roughenCards() {
  const els = document.querySelectorAll<HTMLElement>('.rough');
  const seeds = new Map<HTMLElement, number>();
  els.forEach((el, i) => seeds.set(el, 1013 * (i + 1)));
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) paint(e.target as HTMLElement, seeds.get(e.target as HTMLElement) ?? 7);
  });
  els.forEach((el) => {
    paint(el, seeds.get(el)!);
    ro.observe(el);
  });
}
