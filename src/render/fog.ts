import { ARENA_R, PILLARS, VISION_R } from '../sim/constants';
import type { Player } from '../sim/types';

/** Half-size of the square of world the fog mask covers. */
export const FOG_EXTENT = ARENA_R + 48;
const SIZE = 512;
const FOG = 'rgba(4, 6, 11, 0.74)';
const MASK = '#000';

/**
 * Top-down fog texture: dark where the viewer can't see, clear inside the vision
 * radius except in the shadows behind pillars. Matches sim/vision.ts.
 * Canvas x/y map to sim x/y over [-FOG_EXTENT, FOG_EXTENT].
 */
export class FogMask {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
  }

  private scratch = document.createElement('canvas');

  /** Redraw for these viewers (a team shares its vision); empty or null clears the fog (attract mode). */
  update(viewers: Player[] | Player | null) {
    const list = viewers === null ? [] : Array.isArray(viewers) ? viewers : [viewers];
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    if (list.length === 0) return;
    // Opaque masks first: fog stays only where every viewer is fogged.
    this.draw(g, list[0]);
    if (list.length > 1) {
      if (this.scratch.width !== SIZE) this.scratch.width = this.scratch.height = SIZE;
      const sg = this.scratch.getContext('2d')!;
      for (const v of list.slice(1)) {
        sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.clearRect(0, 0, SIZE, SIZE);
        this.draw(sg, v);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(this.scratch, 0, 0);
      }
    }
    // Then tint the remaining coverage with the fog colour.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = FOG;
    g.fillRect(0, 0, SIZE, SIZE);
    g.globalCompositeOperation = 'source-over';
  }

  /** One viewer's fog as an opaque mask: everywhere except its vision circle, plus pillar shadows. */
  private draw(g: CanvasRenderingContext2D, viewer: Player) {
    const k = SIZE / (2 * FOG_EXTENT);
    g.setTransform(k, 0, 0, k, SIZE / 2, SIZE / 2);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = MASK;
    g.fillRect(-FOG_EXTENT, -FOG_EXTENT, FOG_EXTENT * 2, FOG_EXTENT * 2);

    // Cut out the vision circle with a soft rim.
    g.globalCompositeOperation = 'destination-out';
    const grad = g.createRadialGradient(viewer.x, viewer.y, VISION_R - 40, viewer.x, viewer.y, VISION_R + 6);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(viewer.x, viewer.y, VISION_R + 6, 0, Math.PI * 2);
    g.fill();

    // Put the fog back in each pillar's shadow.
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = MASK;
    for (const pl of PILLARS) {
      const dx = pl.x - viewer.x;
      const dy = pl.y - viewer.y;
      const d = Math.hypot(dx, dy);
      if (d <= pl.r + 1 || d > VISION_R + pl.r) continue;
      const a = Math.atan2(dy, dx);
      const h = Math.asin(pl.r / d);
      const tl = Math.sqrt(d * d - pl.r * pl.r);
      const far = FOG_EXTENT * 3;
      g.beginPath();
      g.moveTo(viewer.x + Math.cos(a + h) * tl, viewer.y + Math.sin(a + h) * tl);
      g.lineTo(viewer.x + Math.cos(a + h) * far, viewer.y + Math.sin(a + h) * far);
      g.lineTo(viewer.x + Math.cos(a - h) * far, viewer.y + Math.sin(a - h) * far);
      g.lineTo(viewer.x + Math.cos(a - h) * tl, viewer.y + Math.sin(a - h) * tl);
      g.closePath();
      g.fill();
    }
  }
}
