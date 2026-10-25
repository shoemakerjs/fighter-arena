import { ARENA_R, CONVERGE, MAPS, METEOR, ORB_HP, ORB_R, PLAYER_R, PROJ, PULSE, RAIN, RIFT, SONIC, SPAWNS, SUDDEN_DEATH_AT, WHIRL } from '../sim/constants';
import { abilityOf } from '../sim/step';
import { canSee, teamSees } from '../sim/vision';
import { FOG_EXTENT, FogMask } from './fog';
import type { GameState, Player, Projectile, Vec } from '../sim/types';
import type { Fx } from './fx';
import { abilityColor, COLORS } from './theme';
import { HUD_BOTTOM, HUD_TOP, hexA, lerpPlayer, shade, type DrawOptions, type WorldView } from './view';

const TAU = Math.PI * 2;

/** Flat top-down view. Shows the exact hitboxes, handy for debugging (open with ?2d). */
export class World2D implements WorldView {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private scale = 1;
  private cx = 0;
  private cy = 0;
  private floor: HTMLCanvasElement | null = null;
  private time = 0;
  private fog = new FogMask();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const usableH = h - HUD_TOP - HUD_BOTTOM;
    this.scale = Math.max(0.2, Math.min(w / (2 * (ARENA_R + 40)), usableH / (2 * (ARENA_R + 16))));
    this.cx = w / 2;
    this.cy = HUD_TOP + usableH / 2;
    this.floor = null;
  }

  screenToWorld(sx: number, sy: number): Vec {
    return { x: (sx - this.cx) / this.scale, y: (sy - this.cy) / this.scale };
  }

  worldToScreen(x: number, y: number, h: number): Vec {
    return { x: this.cx + x * this.scale, y: this.cy + (y - h * 0.6) * this.scale };
  }

  render(prev: GameState, cur: GameState, alpha: number, fx: Fx, dt: number, opts: DrawOptions) {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    const sx = (Math.random() - 0.5) * fx.shake;
    const sy = (Math.random() - 0.5) * fx.shake;
    ctx.save();
    ctx.translate(this.cx + sx, this.cy + sy);
    ctx.scale(this.scale, this.scale);

    this.drawFloor(cur);
    this.drawMeteors(cur);
    this.drawZones(cur, opts.localId);
    this.drawOrb(cur);
    this.drawPillars(cur);
    this.drawAimGuide(cur, opts);

    const players = cur.players.map((p, i) => lerpPlayer(prev.players[i], p, alpha));
    const order = players.slice().sort((a, b) => a.y - b.y);
    for (const p of order) {
      if (opts.localId !== null && p.id !== opts.localId && !canSee(cur, opts.localId, p.id)) continue;
      this.drawPlayer(p, cur, opts.localId);
    }
    this.drawProjectiles(prev, cur, alpha, opts.localId);
    this.drawFx(fx);

    const me = opts.localId === null ? null : cur.players[opts.localId];
    this.fog.update(!me || cur.training ? null : players.filter((p) => p.team === me.team && (!p.out || p.id === me.id)), MAPS[cur.map].solids);
    ctx.drawImage(this.fog.canvas, -FOG_EXTENT, -FOG_EXTENT, FOG_EXTENT * 2, FOG_EXTENT * 2);

    ctx.restore();
  }

  private buildFloor(): HTMLCanvasElement {
    const size = Math.ceil((ARENA_R + 40) * 2 * this.scale * this.dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const k = this.scale * this.dpr;
    g.translate(size / 2, size / 2);
    g.scale(k, k);

    const grad = g.createRadialGradient(0, 0, 0, 0, 0, ARENA_R);
    grad.addColorStop(0, COLORS.floorIn);
    grad.addColorStop(1, COLORS.floorOut);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, ARENA_R, 0, TAU);
    g.fill();

    g.save();
    g.clip();
    // Alternating stone bands
    g.fillStyle = 'rgba(255,255,255,0.018)';
    for (let i = 1, r = 160; r <= ARENA_R + 80; i++, r += 80) {
      if (i % 2 === 0) continue;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.arc(0, 0, r - 80, 0, TAU, true);
      g.fill();
    }
    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1.5;
    for (let r = 80; r < ARENA_R; r += 80) {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 80, Math.sin(a) * 80);
      g.lineTo(Math.cos(a) * ARENA_R, Math.sin(a) * ARENA_R);
      g.stroke();
    }
    // Center pad (orb)
    g.strokeStyle = 'rgba(255, 209, 102, 0.16)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 54, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255, 209, 102, 0.04)';
    g.fill();
    // Team spawn pads
    SPAWNS.forEach((sp, i) => {
      const glow = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 90);
      glow.addColorStop(0, hexA(COLORS.players[i], 0.12));
      glow.addColorStop(1, hexA(COLORS.players[i], 0));
      g.fillStyle = glow;
      g.beginPath();
      g.arc(sp.x, sp.y, 90, 0, TAU);
      g.fill();
      g.strokeStyle = hexA(COLORS.players[i], 0.28);
      g.lineWidth = 2.5;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.arc(sp.x, sp.y, 40, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    });
    // Soft inner shadow along the wall
    const edge = g.createRadialGradient(0, 0, ARENA_R - 70, 0, 0, ARENA_R);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = edge;
    g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);
    g.restore();

    // Rim
    g.lineWidth = 14;
    g.strokeStyle = COLORS.rim;
    g.beginPath();
    g.arc(0, 0, ARENA_R + 7, 0, TAU);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(160, 190, 255, 0.18)';
    g.beginPath();
    g.arc(0, 0, ARENA_R, 0, TAU);
    g.stroke();
    return c;
  }

  private drawFloor(s: GameState) {
    const { ctx } = this;
    if (!this.floor) this.floor = this.buildFloor();
    const size = (ARENA_R + 40) * 2;
    ctx.drawImage(this.floor, -size / 2, -size / 2, size, size);

    if (s.arenaR < ARENA_R - 0.5 || (s.roundFrame >= SUDDEN_DEATH_AT && !s.training)) {
      // Darken everything outside the closing wall.
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, ARENA_R + 20, 0, TAU);
      ctx.arc(0, 0, s.arenaR, 0, TAU, true);
      ctx.fillStyle = 'rgba(30, 0, 8, 0.72)';
      ctx.fill();
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
      ctx.strokeStyle = COLORS.danger;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 4;
      ctx.shadowColor = COLORS.danger;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, s.arenaR, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPillars(s: GameState) {
    const { ctx } = this;
    // The river (water strip, then the bridge decks over it)
    const river = MAPS[s.map].river;
    if (river) {
      ctx.fillStyle = '#1d5a62';
      ctx.fillRect(-river.half, -ARENA_R, river.half * 2, ARENA_R * 2);
      ctx.fillStyle = '#7a8272';
      for (const b of river.bridges) ctx.fillRect(-river.half - PLAYER_R - 12, b.y - b.half - 24, (river.half + PLAYER_R + 12) * 2, (b.half + 24) * 2);
    }
    for (const pl of MAPS[s.map].solids) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(pl.x + 6, pl.y + 10, pl.r, pl.r * 0.9, 0, 0, TAU);
      ctx.fill();

      ctx.fillStyle = COLORS.pillarSide;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y + 6, pl.r, 0, TAU);
      ctx.fill();

      const g = ctx.createRadialGradient(pl.x - pl.r * 0.35, pl.y - pl.r * 0.45, 2, pl.x, pl.y, pl.r);
      g.addColorStop(0, '#56617b');
      g.addColorStop(1, COLORS.pillarTop);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, pl.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, pl.r * 0.62, 0, TAU);
      ctx.stroke();
    }
  }

  private drawOrb(s: GameState) {
    const { ctx } = this;
    const orb = s.orb;
    if (!orb.active) {
      if (s.phase === 'fight' && orb.timer < 90) {
        const k = 1 - orb.timer / 90;
        ctx.strokeStyle = COLORS.orb;
        ctx.globalAlpha = 0.25 + 0.35 * k;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, ORB_R + 30 * (1 - k), 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      return;
    }
    const bob = Math.sin(this.time * 3) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(4, 12, ORB_R * 0.9, ORB_R * 0.5, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.shadowColor = COLORS.orb;
    ctx.shadowBlur = 28;
    const g = ctx.createRadialGradient(-6, bob - 8, 2, 0, bob, ORB_R);
    g.addColorStop(0, '#fff6d6');
    g.addColorStop(0.5, COLORS.orb);
    g.addColorStop(1, '#c4861c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, bob, ORB_R, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 230, 160, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, bob, ORB_R + 8, -Math.PI / 2, -Math.PI / 2 + TAU * (orb.hp / ORB_HP));
    ctx.stroke();
  }

  private drawMeteors(s: GameState) {
    const { ctx } = this;
    for (const m of s.meteors) {
      const k = 1 - m.t / METEOR.delay;
      const color = COLORS.meteor;
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.08 + 0.1 * k;
      ctx.beginPath();
      ctx.arc(m.x, m.y, METEOR.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.35 + 0.3 * k;
      ctx.beginPath();
      ctx.arc(m.x, m.y, METEOR.r * k, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.time * 40;
      ctx.beginPath();
      ctx.arc(m.x, m.y, METEOR.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Arrow rain (everyone sees it) and sonic sensors (only the archer who placed them). */
  private drawZones(s: GameState, localId: number | null) {
    const { ctx } = this;
    for (const z of s.zones) {
      if (z.kind === 'sonic' && localId !== null && z.owner !== localId) continue;
      const r = z.kind === 'rain' ? RAIN.r : z.kind === 'converge' ? CONVERGE.r : z.kind === 'pulse' ? PULSE.r : SONIC.r;
      const falling = z.kind === 'rain' && z.t > RAIN.ticks;
      ctx.save();
      ctx.fillStyle = ctx.strokeStyle = z.kind === 'rain' ? COLORS.vine : z.kind === 'sonic' ? COLORS.sonic : COLORS.chrono;
      ctx.globalAlpha = z.kind === 'rain' ? (falling ? 0.12 : 0.2) : 0.06;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.setLineDash(falling ? [10, 8] : []);
      ctx.beginPath();
      ctx.arc(z.x, z.y, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawAimGuide(s: GameState, opts: DrawOptions) {
    if (opts.localId === null || s.phase !== 'fight') return;
    const p = s.players[opts.localId];
    const { ctx } = this;
    const id = p.cast ? abilityOf(p, p.cast.ability).id : null;
    // Skillshot preview for the slower casts (the basic attack would leave it on screen all the time).
    if (id === 'blast' || id === 'frost' || id === 'hook' || id === 'rift') {
      const len = id === 'rift' ? RIFT.len : PROJ[id].range;
      const half = id === 'rift' ? RIFT.half : PROJ[id].r;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.fy, p.fx));
      ctx.fillStyle = abilityColor(id, p.id);
      ctx.globalAlpha = 0.14;
      ctx.fillRect(PLAYER_R, -half, len, half * 2);
      ctx.restore();
    } else if (id === 'meteor' && opts.cursor) {
      const w = this.screenToWorld(opts.cursor.x, opts.cursor.y);
      let dx = w.x - p.x;
      let dy = w.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > METEOR.range) {
        dx = (dx / d) * METEOR.range;
        dy = (dy / d) * METEOR.range;
      }
      ctx.strokeStyle = COLORS.meteor;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x + dx, p.y + dy, METEOR.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(p: Player, s: GameState, localId: number | null) {
    const { ctx } = this;
    const color = COLORS.players[p.id];
    const dead = p.hp <= 0;
    // Stealth: the enemy vanishes, you see yourself as a ghost.
    if (p.stealthT > 0 && localId !== null && p.id !== localId) return;
    ctx.save();
    if (p.stealthT > 0) ctx.globalAlpha = 0.35;

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(p.x + 4, p.y + 10, PLAYER_R * 1.05, PLAYER_R * 0.6, 0, 0, TAU);
    ctx.fill();

    if (dead) ctx.globalAlpha = 0.35;

    if (p.counterT > 0) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3;
      const r = PLAYER_R + 9 + Math.sin(this.time * 30) * 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    if (p.slowT > 0) {
      ctx.strokeStyle = COLORS.frost;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 6, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.hasteT > 0) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 12, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = dead ? 0.35 : 1;
    }

    // Weapon / facing
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.fy, p.fx));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(PLAYER_R + 12, 0);
    ctx.lineTo(PLAYER_R - 2, -8);
    ctx.lineTo(PLAYER_R - 2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Body
    const g = ctx.createRadialGradient(p.x - 7, p.y - 9, 2, p.x, p.y, PLAYER_R);
    g.addColorStop(0, shade(color, 0.35));
    g.addColorStop(1, shade(color, -0.55));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R * 0.42, 0, TAU);
    ctx.fill();

    if (p.hitT > 0) {
      ctx.globalAlpha = (p.hitT / 8) * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 1, 0, TAU);
      ctx.fill();
    }

    // Casting glow at the weapon tip
    if (p.whirlT > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = this.time * 200;
      ctx.beginPath();
      ctx.arc(p.x, p.y, WHIRL.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (p.cast && s.phase === 'fight') {
      const def = abilityOf(p, p.cast.ability);
      const k = 1 - p.cast.t / def.cast;
      const c = abilityColor(def.id, p.id);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.35 + 0.5 * k;
      ctx.beginPath();
      ctx.arc(p.x + p.fx * (PLAYER_R + 10), p.y + p.fy * (PLAYER_R + 10), 3 + 9 * k, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (p.markT > 0) {
      ctx.strokeStyle = COLORS.shadow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - PLAYER_R - 16);
      ctx.lineTo(p.x + 8, p.y - PLAYER_R - 4);
      ctx.lineTo(p.x - 8, p.y - PLAYER_R - 4);
      ctx.closePath();
      ctx.stroke();
    }
    if (p.poisonT > 0) {
      ctx.strokeStyle = COLORS.poison;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 3, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawProjectiles(prev: GameState, cur: GameState, alpha: number, localId: number | null) {
    const { ctx } = this;
    const prevById = new Map<number, Projectile>();
    for (const pr of prev.projectiles) prevById.set(pr.id, pr);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pr of cur.projectiles) {
      const old = prevById.get(pr.id);
      const x = old ? old.x + (pr.x - old.x) * alpha : pr.x;
      const y = old ? old.y + (pr.y - old.y) * alpha : pr.y;
      if (localId !== null && !cur.training && cur.players[pr.owner].team !== cur.players[localId].team && !teamSees(cur, localId, x, y)) continue;
      const color = abilityColor(pr.kind, pr.owner);

      for (let i = 5; i >= 1; i--) {
        ctx.globalAlpha = 0.09 * (6 - i);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x - pr.vx * i * 0.7, y - pr.vy * i * 0.7, pr.r * (1 - i * 0.12), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x, y, pr.r * 1.8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, pr.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, pr.r * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFx(fx: Fx) {
    const { ctx } = this;
    ctx.save();
    for (const r of fx.rings) {
      const k = 1 - r.life / r.max;
      const ease = 1 - (1 - k) * (1 - k);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.7);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * ease, 0, TAU);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

