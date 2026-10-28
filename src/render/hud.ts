import { CHAMP, CHAMPIONS, CHRONO, EXECUTE, FLICKER, MAX_ENERGY, ROUNDS_TO_WIN, SLOT, SLOT_KEYS, SUDDEN_DEATH_AT, TEMPEST, TICK_RATE, VENOM, type AbilityId } from '../sim/constants';
import { abilityOf, maxHp } from '../sim/step';
import { canSee } from '../sim/vision';
import type { GameState, Player, Vec } from '../sim/types';
import { PLAYER_NAMES, type Fx } from './fx';
import { ROSTER } from '../ui/roster';
import { COLORS, DISPLAY, FONT } from './theme';
import { HUD_BOTTOM, HUD_TOP, lerpPlayer, type DrawOptions, type WorldView } from './view';

const TAU = Math.PI * 2;
/** Height above the floor where overhead bars sit. */
const OVERHEAD_H = 82;

/** Screen-space overlay: bars, ability bar, banners, cursor. Shared by the 2D and 3D views. */
export class Hud {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** Lagging HP per player for the "chip damage" bar. */
  private chip: number[] = [];
  private time = 0;

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
  }

  draw(prev: GameState, cur: GameState, alpha: number, fx: Fx, dt: number, opts: DrawOptions, view: WorldView) {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    for (let i = 0; i < cur.players.length; i++) {
      const hp = cur.players[i].hp;
      const chip = this.chip[i] ?? hp;
      this.chip[i] = hp > chip ? hp : chip + (hp - chip) * Math.min(1, dt * 3);
    }

    if (fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.35, fx.flash * 1.6);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    this.drawVignette();

    const players = cur.players.map((p, i) => lerpPlayer(prev.players[i], p, alpha));
    for (const p of players) {
      // An enemy in fog or stealth has no bars to give it away.
      if (opts.localId !== null && p.id !== opts.localId && !canSee(cur, opts.localId, p.id)) continue;
      this.drawOverhead(p, view.worldToScreen(p.x, p.y, OVERHEAD_H), cur);
    }
    this.drawTexts(fx, view);

    if (opts.localId !== null) {
      this.drawTopHud(cur);
      this.drawAbilityBar(cur.players[opts.localId]);
    }
    this.drawCenterText(cur, fx);
    if (opts.cursor) this.drawCursor(opts.cursor, opts.localId ?? 0);
  }

  /**
   * Execute marker for a bar of `p` facing a Shade: a notch at the threshold; below it the
   * fill turns blood red and pulses, and a blade mark shows when Execute is ready to use.
   * `x0`/`w` span the bar, `fromRight` for bars that drain towards the right.
   */
  private drawExecuteMark(s: GameState, p: Player, x0: number, y: number, w: number, h: number, fromRight: boolean) {
    // Any Shade on the other team.
    const foe = s.players.find((q) => q.team !== p.team && q.champ === CHAMP.ASSASSIN && !q.dummy && !q.out);
    if (!foe) return;
    const { ctx } = this;
    const nx = fromRight ? x0 + w - w * EXECUTE.threshold : x0 + w * EXECUTE.threshold;
    const below = p.hp > 0 && p.hp <= maxHp(p) * EXECUTE.threshold;
    if (below) {
      const hpW = (w * p.hp) / maxHp(p);
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(this.time * 10);
      ctx.fillStyle = COLORS.blood;
      ctx.fillRect(fromRight ? x0 + w - hpW : x0, y, hpW, h);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = below ? '#ffffff' : 'rgba(255, 45, 85, 0.9)';
    ctx.fillRect(Math.round(nx) - 1, y - 2, 2, h + 4);
    const ready = below && foe.energy >= CHAMPIONS[foe.champ].abilities[SLOT.R].energyCost && foe.cooldowns[SLOT.R] === 0;
    if (ready) {
      // Little downward blade above the notch
      ctx.fillStyle = COLORS.blood;
      ctx.beginPath();
      ctx.moveTo(nx, y - 3);
      ctx.lineTo(nx - 4, y - 11);
      ctx.lineTo(nx + 4, y - 11);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawOverhead(p: Player, at: Vec, s: GameState) {
    if (p.hp <= 0) return;
    const { ctx } = this;
    const color = COLORS.players[p.id];
    const w = 66;
    const x = Math.round(at.x - w / 2);
    const y = Math.round(at.y);

    ctx.fillStyle = 'rgba(5, 7, 12, 0.8)';
    roundRect(ctx, x - 2, y - 2, w + 4, 13, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x, y, (w * this.chip[p.id]) / maxHp(p), 6);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, (w * p.hp) / maxHp(p), 6);
    this.drawExecuteMark(s, p, x, y, w, 6, false);
    // Energy, split in quarters
    ctx.fillStyle = COLORS.energy;
    ctx.fillRect(x, y + 7.5, (w * p.energy) / MAX_ENERGY, 2);
    ctx.fillStyle = 'rgba(5,7,12,0.9)';
    for (let i = 1; i < 4; i++) ctx.fillRect(x + (w * i) / 4 - 0.5, y + 7, 1, 3);
    // 2v2: say who's who above the bar.
    if (s.players.length > 2) {
      ctx.font = `600 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = color;
      ctx.fillText(PLAYER_NAMES[p.id], at.x, y - (p.cast ? 30 : 4));
    }

    if (p.cast) {
      const def = abilityOf(p, p.cast.ability);
      const k = 1 - p.cast.t / def.cast;
      const by = y - 14;
      ctx.fillStyle = 'rgba(5, 7, 12, 0.8)';
      roundRect(ctx, at.x - 30, by, 60, 6, 3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(at.x - 29, by + 1, 58 * k, 4);
      ctx.font = `500 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(238, 242, 251, 0.85)';
      ctx.fillText(def.name.toUpperCase(), at.x, by - 2);
    }
  }

  private drawTexts(fx: Fx, view: WorldView) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of fx.texts) {
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      const at = view.worldToScreen(t.x, t.y, 70);
      const y = at.y - (1 - k) * 40;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = `${t.size * 1.15 * pop}px ${DISPLAY}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(5,7,12,0.85)';
      ctx.strokeText(t.text, at.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, at.x, y);
    }
    ctx.restore();
  }

  private drawVignette() {
    const { ctx } = this;
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawTopHud(s: GameState) {
    const { ctx } = this;
    const cx = this.w / 2;
    const y = 30;

    if (s.training) {
      // No clock and no rounds in training.
      ctx.font = `22px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText('Training', cx, y + 1);
    } else {
      this.drawClock(s, cx, y);
    }
    this.drawNames(s, cx, y);
  }

  private drawClock(s: GameState, cx: number, y: number) {
    const { ctx } = this;
    // Round timer
    const secs = Math.floor(s.roundFrame / TICK_RATE);
    const sudden = s.roundFrame >= SUDDEN_DEATH_AT;
    const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    ctx.fillStyle = 'rgba(12, 15, 22, 0.85)';
    roundRect(ctx, cx - 44, y - 18, 88, 36, 8);
    ctx.fill();
    ctx.strokeStyle = sudden ? COLORS.danger : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `26px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = sudden ? COLORS.danger : COLORS.text;
    ctx.fillText(label, cx, y + 1);
    ctx.font = `500 11px ${FONT}`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`ROUND ${s.round}`, cx, y + 30);
  }

  /**
   * Names, score pips (not in training) and HP bars: team 0 on the left, team 1 on
   * the right; in 2v2 the second member of each team gets a smaller row below.
   */
  private drawNames(s: GameState, cx: number, y: number) {
    const { ctx } = this;
    for (const team of [0, 1]) {
      const dir = team === 0 ? -1 : 1;
      const left = team === 0;
      const color = COLORS.players[team];
      const nameX = cx + dir * 70;
      s.players
        .filter((p) => p.team === team)
        .forEach((p, k) => {
          const main = k === 0;
          const yy = y + k * 34;
          ctx.globalAlpha = p.out ? 0.45 : 1;
          ctx.textAlign = left ? 'right' : 'left';
          ctx.font = `${main ? 22 : 17}px ${DISPLAY}`;
          ctx.fillStyle = color;
          const name = p.dummy ? 'TRAINING DUMMY' : `${PLAYER_NAMES[p.id]} · ${ROSTER[p.champ].hero}`;
          ctx.fillText(name, nameX, yy - 6);

          const barW = Math.min(main ? 260 : 200, this.w / 2 - 110);
          const barH = main ? 8 : 6;
          const bx = left ? nameX - barW : nameX;
          ctx.fillStyle = 'rgba(12, 15, 22, 0.85)';
          roundRect(ctx, bx, yy + 6, barW, barH + 2, 3);
          ctx.fill();
          const hpW = (barW * p.hp) / maxHp(p);
          const chipW = (barW * (this.chip[p.id] ?? p.hp)) / maxHp(p);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(left ? bx + barW - chipW : bx, yy + 7, chipW, barH);
          ctx.fillStyle = color;
          ctx.fillRect(left ? bx + barW - hpW : bx, yy + 7, hpW, barH);
          this.drawExecuteMark(s, p, bx, yy + 7, barW, barH, left);
          ctx.globalAlpha = 1;

          if (!main || s.training) return;
          const nameW = ctx.measureText(name).width;
          for (let r = 0; r < ROUNDS_TO_WIN; r++) {
            ctx.beginPath();
            ctx.arc(nameX + dir * (nameW + 14 + r * 16), yy - 7, 5, 0, TAU);
            ctx.fillStyle = r < s.score[team] ? color : 'rgba(255,255,255,0.1)';
            ctx.fill();
          }
        });
    }
  }

  private drawAbilityBar(p: Player) {
    const { ctx } = this;
    const slot = 54;
    const gap = 10;
    const kit = CHAMPIONS[p.champ].abilities;
    const n = kit.length;
    const total = n * slot + (n - 1) * gap;
    const x0 = this.w / 2 - total / 2;
    const y0 = this.h - slot - 26;

    // Energy bar
    ctx.fillStyle = 'rgba(12, 15, 22, 0.85)';
    roundRect(ctx, x0, y0 - 18, total, 8, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.energy;
    const full = p.energy >= MAX_ENERGY;
    if (full) {
      ctx.save();
      ctx.shadowColor = COLORS.energy;
      ctx.shadowBlur = 10 + Math.sin(this.time * 6) * 4;
    }
    roundRect(ctx, x0 + 1, y0 - 17, ((total - 2) * p.energy) / MAX_ENERGY, 6, 3);
    ctx.fill();
    if (full) ctx.restore();
    ctx.fillStyle = 'rgba(5,7,12,0.9)';
    for (let i = 1; i < 4; i++) ctx.fillRect(x0 + (total * i) / 4 - 1, y0 - 18, 2, 8);

    for (let i = 0; i < n; i++) {
      const def = kit[i];
      const x = x0 + i * (slot + gap);
      // Time Skip is limited by its charges (its own cooldown is just a short lockout).
      const outOfCharges = def.id === 'flicker' && p.charges === 0;
      const cd = outOfCharges ? p.chargeT : p.cooldowns[i];
      const cdMax = outOfCharges ? FLICKER.recharge : def.cooldown;
      const noEnergy = p.energy < def.energyCost;
      const active =
        p.cast?.ability === i ||
        (def.id === 'counter' && p.counterT > 0) ||
        ((def.id === 'dash' || def.id === 'leap' || def.id === 'vault' || def.id === 'blade') && p.dashT > 0) ||
        (def.id === 'arrow' && p.quickT > 0) ||
        (def.id === 'soul' && p.soulT > 0) ||
        (def.id === 'deflect' && p.deflectT > 0) ||
        (def.id === 'step' && p.dashT > 0 && p.dashKind === 4) ||
        (def.id === 'drain' && p.drainT > 0) ||
        (def.id === 'swarm' && p.dashT > 0 && p.dashKind === 5) ||
        // The next Transfusion is the empowered one.
        (def.id === 'transfusion' && (p.bloodCount + 1) % 3 === 0) ||
        (def.id === 'tempest' && p.stacks >= TEMPEST.max) ||
        (def.id === 'whirl' && p.whirlT > 0) ||
        (def.id === 'smoke' && p.stealthT > 0);

      ctx.fillStyle = 'rgba(16, 20, 30, 0.92)';
      roundRect(ctx, x, y0, slot, slot, 10);
      ctx.fill();
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.1)';
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = cd > 0 || noEnergy ? 0.35 : 1;
      drawIcon(ctx, def.id === 'tempest' && p.stacks >= TEMPEST.max ? 'crescent' : def.id, x + slot / 2, y0 + slot / 2, COLORS.players[p.id]);
      ctx.restore();

      // Pips under the icon: Steel Tempest stacks, Time Skip charges, hits towards Resonance.
      const pips =
        def.id === 'tempest' ? { n: TEMPEST.max, on: p.stacks, color: COLORS.edge }
        : def.id === 'flicker' ? { n: FLICKER.charges, on: p.charges, color: COLORS.chrono }
        : def.id === 'chrono' ? { n: CHRONO.hits - 1, on: p.resoN, color: COLORS.chrono }
        : def.id === 'jab' ? { n: 1, on: p.quickT > 0 ? 1 : 0, color: COLORS.tongue }
        : def.id === 'poison' ? { n: VENOM.charges, on: p.venom, color: COLORS.poison }
        : null;
      if (pips) {
        for (let k = 0; k < pips.n; k++) {
          ctx.beginPath();
          ctx.arc(x + slot / 2 + (k - (pips.n - 1) / 2) * 10, y0 + slot - 7, 3, 0, TAU);
          ctx.fillStyle = k < pips.on ? pips.color : 'rgba(255,255,255,0.15)';
          ctx.fill();
        }
      }

      if (cd > 0 && cdMax > 30) {
        const k = cd / cdMax;
        ctx.save();
        roundRect(ctx, x, y0, slot, slot, 10);
        ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.moveTo(x + slot / 2, y0 + slot / 2);
        ctx.arc(x + slot / 2, y0 + slot / 2, slot, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.font = `600 17px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = COLORS.text;
        ctx.fillText(String(Math.ceil(cd / TICK_RATE)), x + slot / 2, y0 + slot / 2 + 1);
      }

      ctx.font = `600 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(SLOT_KEYS[i], x + slot / 2, y0 + slot + 5);
    }
  }

  private drawCenterText(s: GameState, fx: Fx) {
    const { ctx } = this;
    const cy = HUD_TOP + (this.h - HUD_TOP - HUD_BOTTOM) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (s.phase === 'countdown') {
      const n = Math.ceil(s.phaseT / 50);
      const k = (s.phaseT % 50) / 50;
      ctx.save();
      ctx.font = `24px ${DISPLAY}`;
      ctx.fillStyle = COLORS.muted;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(5,7,12,0.7)';
      ctx.strokeText(`Round ${s.round}`, this.w / 2, cy - 70);
      ctx.fillText(`Round ${s.round}`, this.w / 2, cy - 70);
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.font = `${84 + 34 * k}px ${DISPLAY}`;
      ctx.lineWidth = 8;
      ctx.strokeText(String(n), this.w / 2, cy);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(n), this.w / 2, cy);
      ctx.restore();
    }

    const b = fx.banner;
    if (b) {
      const k = b.life / b.max;
      const appear = Math.min(1, (1 - k) * 6);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 4) * appear;
      const scale = 1 + (1 - appear) * 0.4;
      ctx.translate(this.w / 2, cy - 10);
      ctx.scale(scale, scale);
      ctx.font = `68px ${DISPLAY}`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(5,7,12,0.8)';
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, 0, 0);
      if (b.sub) {
        ctx.font = `500 20px ${FONT}`;
        ctx.fillStyle = COLORS.text;
        ctx.lineWidth = 5;
        ctx.strokeText(b.sub, 0, 48);
        ctx.fillText(b.sub, 0, 48);
      }
      ctx.restore();
    }
  }

  private drawCursor(c: Vec, localId: number) {
    const { ctx } = this;
    const color = COLORS.players[localId];
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(c.x + dx * 13, c.y + dy * 13);
      ctx.lineTo(c.x + dx * 18, c.y + dy * 18);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, Math.max(0, w) / 2, h / 2));
}

function drawIcon(ctx: CanvasRenderingContext2D, ability: AbilityId | 'crescent', x: number, y: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (ability) {
    case 'jab':
      // A stone-tipped spear thrusting right, with speed lines
      ctx.strokeStyle = '#8a6a48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-15, 6);
      ctx.lineTo(6, -2);
      ctx.stroke();
      ctx.fillStyle = '#b8bcc4';
      ctx.beginPath();
      ctx.moveTo(15, -5.5);
      ctx.lineTo(5, -6);
      ctx.lineTo(7, 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.lineTo(-4, -10);
      ctx.moveTo(-10, 12);
      ctx.lineTo(0, 8);
      ctx.stroke();
      break;
    case 'tongue':
      // A frog's mouth with the tongue lashing out to a sticky tip
      ctx.fillStyle = '#7d9a5a';
      ctx.beginPath();
      ctx.arc(-9, 0, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.tongue;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, 1);
      ctx.quadraticCurveTo(4, -6, 11, 0);
      ctx.stroke();
      ctx.fillStyle = COLORS.tongue;
      ctx.beginPath();
      ctx.arc(12, 0, 4, 0, TAU);
      ctx.fill();
      break;
    case 'lily':
      // A frog arcing over and splashing into water
      ctx.strokeStyle = COLORS.bog;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.quadraticCurveTo(-2, -16, 8, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(8, 9, 9, 3.5, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#7d9a5a';
      ctx.beginPath();
      ctx.arc(-13, 6, 4, 0, TAU);
      ctx.fill();
      break;
    case 'submerge':
      // Just the eyes above the water line, ripples spreading out
      ctx.fillStyle = '#7d9a5a';
      ctx.beginPath();
      ctx.ellipse(0, 4, 10, 6, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#e2b45a';
      for (const ex of [-5, 5]) {
        ctx.beginPath();
        ctx.arc(ex, 0, 2.6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#141010';
      for (const ex of [-5, 5]) ctx.fillRect(ex - 1.8, -0.5, 3.6, 1);
      ctx.strokeStyle = COLORS.bog;
      for (const [rx, ry, w] of [[13, 3.5, 2], [17, 5, 1.2]]) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.ellipse(0, 5, rx, ry, 0, 0, TAU);
        ctx.stroke();
      }
      break;
    case 'marsh':
      // A pool with ripples and a lily pad
      ctx.fillStyle = COLORS.bog;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(0, 3, 15, 9, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.bog;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 3, 9, 5, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#7d9a5a';
      ctx.beginPath();
      ctx.arc(5, 0, 5, 0.4, TAU - 0.2);
      ctx.lineTo(5, 0);
      ctx.fill();
      break;
    case 'toad':
      // A great toad's open maw rising from rings of water
      ctx.strokeStyle = COLORS.bog;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 9, 15, 5, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#7d9a5a';
      ctx.beginPath();
      ctx.arc(0, 4, 12, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#2a1a1a';
      ctx.beginPath();
      ctx.ellipse(0, 3, 8, 3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e2b45a';
      for (const ex of [-7, 7]) {
        ctx.beginPath();
        ctx.arc(ex, -7, 3, 0, TAU);
        ctx.fill();
      }
      break;
    case 'chrono':
      // A pickaxe with a green crack of time at its point
      ctx.strokeStyle = '#8a6a48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, 13);
      ctx.lineTo(6, -7);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-4, -14);
      ctx.quadraticCurveTo(7, -11, 14, -1);
      ctx.stroke();
      ctx.strokeStyle = COLORS.chrono;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 3);
      ctx.lineTo(11, 7);
      ctx.lineTo(15, 9);
      ctx.lineTo(12, 13);
      ctx.stroke();
      break;
    case 'clock':
      // A clock-faced bomb with its bounce arcs behind it
      ctx.strokeStyle = COLORS.chrono;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(-16, 10);
      ctx.quadraticCurveTo(-11, -2, -6, 10);
      ctx.quadraticCurveTo(-3, 4, 0, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#3a3f4f';
      ctx.beginPath();
      ctx.arc(6, -3, 9, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(6, -3);
      ctx.lineTo(6, -9);
      ctx.moveTo(6, -3);
      ctx.lineTo(10, -1);
      ctx.stroke();
      break;
    case 'flicker':
      // Afterimages streaking right
      ctx.fillStyle = COLORS.chrono;
      for (const [ox, a] of [[-12, 0.25], [-5, 0.5], [3, 1]]) {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(ox, 0, 6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, -8);
      ctx.lineTo(15, 0);
      ctx.lineTo(10, 8);
      ctx.stroke();
      break;
    case 'converge':
      // Rings closing in on a point
      ctx.strokeStyle = COLORS.chrono;
      for (const [r, w] of [[15, 1.5], [10, 2], [5, 2.5]]) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, TAU);
      ctx.fill();
      break;
    case 'recall':
      // A clock face with a hand turning back
      ctx.strokeStyle = COLORS.chrono;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 13, -Math.PI * 0.35, Math.PI * 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, -15);
      ctx.lineTo(-3, -10);
      ctx.lineTo(-9, -9);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -8);
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, 3);
      ctx.stroke();
      break;
    case 'pulse':
      // A round bomb with a blinking core
      ctx.fillStyle = '#3a3f4f';
      ctx.beginPath();
      ctx.arc(0, 2, 11, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.chrono;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = COLORS.chrono;
      ctx.beginPath();
      ctx.arc(0, 2, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.chrono;
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(-8, -8);
      ctx.moveTo(12, -12);
      ctx.lineTo(8, -8);
      ctx.moveTo(0, -15);
      ctx.lineTo(0, -10);
      ctx.stroke();
      break;
    case 'bolt':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(4, 0, 6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.arc(-6, 0, 4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.arc(-13, 0, 2.5, 0, TAU);
      ctx.fill();
      break;
    case 'blast':
      ctx.fillStyle = COLORS.blast;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.blast;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
        ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
        ctx.stroke();
      }
      break;
    case 'dash':
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (const o of [-8, 2]) {
        ctx.beginPath();
        ctx.moveTo(o, -9);
        ctx.lineTo(o + 9, 0);
        ctx.lineTo(o, 9);
        ctx.stroke();
      }
      break;
    case 'counter':
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(12, -8);
      ctx.lineTo(10, 6);
      ctx.lineTo(0, 14);
      ctx.lineTo(-10, 6);
      ctx.lineTo(-12, -8);
      ctx.closePath();
      ctx.globalAlpha *= 0.5;
      ctx.fill();
      ctx.globalAlpha *= 2;
      ctx.stroke();
      break;
    case 'frost':
      ctx.strokeStyle = COLORS.frost;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        const dx = Math.cos(a) * 14;
        const dy = Math.sin(a) * 14;
        ctx.beginPath();
        ctx.moveTo(-dx, -dy);
        ctx.lineTo(dx, dy);
        ctx.stroke();
      }
      break;
    case 'meteor':
      ctx.fillStyle = COLORS.meteor;
      ctx.beginPath();
      ctx.arc(4, 4, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.energy;
      ctx.lineWidth = 3;
      for (const o of [-7, 0, 7]) {
        ctx.beginPath();
        ctx.moveTo(-4 + o * 0.6, -4 - o * 0.6 - 2);
        ctx.lineTo(-14 + o * 0.6, -14 - o * 0.6 - 2);
        ctx.stroke();
      }
      break;
    case 'slash':
      // Axe
      ctx.strokeStyle = '#c9a26a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, 12);
      ctx.lineTo(8, -10);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(4, -14);
      ctx.quadraticCurveTo(18, -10, 14, 4);
      ctx.lineTo(4, -4);
      ctx.closePath();
      ctx.fill();
      break;
    case 'hook':
      ctx.strokeStyle = COLORS.steel;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-10 + i * 7, 6 - i * 5, 4, 2.5, -0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(9, -6, 6, Math.PI * 0.9, Math.PI * 2.2);
      ctx.stroke();
      break;
    case 'leap':
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 10);
      ctx.quadraticCurveTo(0, -22, 14, 10);
      ctx.stroke();
      ctx.fillStyle = COLORS.earth;
      ctx.fillRect(8, 9, 12, 3);
      ctx.fillRect(-20, 9, 12, 3);
      break;
    case 'cry':
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      for (const r of [5, 10, 15]) {
        ctx.globalAlpha *= 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'whirl':
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, 12, a, a + 1.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'dagger':
      ctx.fillStyle = color;
      for (const o of [-6, 6]) {
        ctx.beginPath();
        ctx.moveTo(-12, o);
        ctx.lineTo(10, o - 3);
        ctx.lineTo(14, o);
        ctx.lineTo(10, o + 3);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'mark':
      ctx.strokeStyle = COLORS.shadow;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, 5);
      ctx.lineTo(-7, 5);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'blink':
      ctx.fillStyle = COLORS.shadow;
      ctx.globalAlpha *= 0.4;
      ctx.beginPath();
      ctx.arc(-9, 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha *= 2.5;
      ctx.beginPath();
      ctx.arc(9, -2, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'smoke':
      ctx.fillStyle = '#9b96b5';
      for (const [cx, cy, r] of [
        [-7, 3, 8],
        [5, 5, 9],
        [0, -5, 9],
      ]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'poison':
      ctx.fillStyle = COLORS.poison;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(11, 2, 0, 12);
      ctx.quadraticCurveTo(-11, 2, 0, -14);
      ctx.fill();
      break;
    case 'execute':
      ctx.strokeStyle = COLORS.blood;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-14, 12);
      ctx.lineTo(14, -12);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.lineTo(4, 14);
      ctx.stroke();
      break;
    case 'arrow':
    case 'longshot': {
      const long = ability === 'longshot';
      ctx.strokeStyle = long ? COLORS.longshot : color;
      ctx.fillStyle = long ? COLORS.longshot : color;
      ctx.lineWidth = long ? 3 : 2.5;
      ctx.beginPath();
      ctx.moveTo(-13, 13);
      ctx.lineTo(9, -9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14, -14);
      ctx.lineTo(4, -11);
      ctx.lineTo(11, -4);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2;
      for (const o of [0, 4]) {
        ctx.beginPath();
        ctx.moveTo(-13 + o, 13 - o);
        ctx.lineTo(-16 + o, 6 - o);
        ctx.moveTo(-13 + o, 13 - o);
        ctx.lineTo(-6 + o, 16 - o);
        ctx.stroke();
      }
      if (long) {
        // Drawn bow behind the arrow.
        ctx.globalAlpha *= 0.6;
        ctx.beginPath();
        ctx.arc(-2, -2, 15, Math.PI * 0.95, Math.PI * 1.55);
        ctx.stroke();
      }
      break;
    }
    case 'vault':
      ctx.strokeStyle = COLORS.vine;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(12, 10);
      ctx.quadraticCurveTo(0, -18, -12, 6);
      ctx.stroke();
      ctx.fillStyle = COLORS.vine;
      ctx.beginPath();
      ctx.moveTo(-16, 2);
      ctx.lineTo(-8, 4);
      ctx.lineTo(-13, 11);
      ctx.closePath();
      ctx.fill();
      break;
    case 'sonic':
      ctx.strokeStyle = COLORS.sonic;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 8, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COLORS.sonic;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.5;
      for (const r of [17, 20]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, -0.5, 0.5);
        ctx.stroke();
      }
      break;
    case 'snare':
      ctx.strokeStyle = COLORS.vine;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.bezierCurveTo(-6, -12, 2, 12, 14, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.bezierCurveTo(-6, 18, 2, -6, 14, 6);
      ctx.stroke();
      ctx.fillStyle = COLORS.vine;
      for (const [x, y] of [[-5, -4], [6, 9]]) {
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 2, 0.6, 0, TAU);
        ctx.fill();
      }
      break;
    case 'rain':
      ctx.strokeStyle = COLORS.vine;
      ctx.lineWidth = 2.5;
      for (const [x, y] of [[-10, -6], [0, -12], [10, -4], [-4, 4], [7, 8]]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 3, y + 3);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x + 3, y + 3);
        ctx.stroke();
      }
      break;
    case 'katana':
      // Curved blade with a small guard
      ctx.strokeStyle = COLORS.steel;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 10);
      ctx.quadraticCurveTo(4, 0, 14, -14);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-8, 10);
      ctx.lineTo(-14, 16);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-12, 6);
      ctx.lineTo(-4, 14);
      ctx.stroke();
      break;
    case 'tempest':
      ctx.strokeStyle = COLORS.edge;
      ctx.fillStyle = COLORS.edge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(9, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(8, -5);
      ctx.lineTo(8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.5;
      for (const o of [-6, 6]) {
        ctx.beginPath();
        ctx.moveTo(-12, o);
        ctx.lineTo(2, o);
        ctx.stroke();
      }
      break;
    case 'crescent':
      // A flying crescent cut
      ctx.fillStyle = COLORS.edge;
      ctx.beginPath();
      ctx.arc(-4, 0, 15, -1.2, 1.2);
      ctx.arc(-10, 0, 13, 1.05, -1.05, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLORS.edge;
      ctx.lineWidth = 1.5;
      for (const o of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.moveTo(-20, o);
        ctx.lineTo(-13, o);
        ctx.stroke();
      }
      break;
    case 'blade':
      ctx.strokeStyle = COLORS.edge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 10);
      ctx.quadraticCurveTo(0, -12, 14, -4);
      ctx.stroke();
      ctx.strokeStyle = COLORS.steel;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, -10);
      ctx.lineTo(16, -14);
      ctx.stroke();
      break;
    case 'deflect':
      // Blade held across, with a parry arc in front of it
      ctx.strokeStyle = COLORS.steel;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, 14);
      ctx.lineTo(10, -14);
      ctx.stroke();
      ctx.strokeStyle = COLORS.edge;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(-6, 0, 16, -1, 1);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const [x, y] of [[9, -9], [11, 0], [9, 9]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, TAU);
        ctx.fill();
      }
      break;
    case 'soul':
      // Body and the spirit stepping out of it
      ctx.fillStyle = COLORS.spirit;
      ctx.globalAlpha *= 0.45;
      ctx.beginPath();
      ctx.arc(6, -2, 7, 0, TAU);
      ctx.fill();
      ctx.globalAlpha /= 0.45;
      ctx.beginPath();
      ctx.arc(-6, 2, 7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.spirit;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(-6, 2);
      ctx.lineTo(6, -2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'fate':
      ctx.strokeStyle = COLORS.spirit;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-16, 8);
      ctx.lineTo(16, -8);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      ctx.lineTo(10, 10);
      ctx.stroke();
      break;
    case 'bloodbolt':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(10, -10);
      ctx.quadraticCurveTo(2, 4, -6, 6);
      ctx.quadraticCurveTo(-12, 0, -6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COLORS.crimson;
      ctx.beginPath();
      ctx.arc(-8, 8, 5, 0, TAU);
      ctx.fill();
      break;
    case 'transfusion':
      // A drop flowing back along an arrow
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 8);
      ctx.lineTo(10, -8);
      ctx.stroke();
      ctx.fillStyle = COLORS.crimson;
      ctx.beginPath();
      ctx.moveTo(-4, -16);
      ctx.quadraticCurveTo(4, -6, -4, -2);
      ctx.quadraticCurveTo(-12, -6, -4, -16);
      ctx.fill();
      ctx.fillStyle = COLORS.heal;
      ctx.fillRect(8, 6, 8, 2.5);
      ctx.fillRect(10.75, 3.25, 2.5, 8);
      break;
    case 'step':
      // Crimson chevrons with drops trailing behind
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 3;
      for (const o of [-6, 4]) {
        ctx.beginPath();
        ctx.moveTo(o, -9);
        ctx.lineTo(o + 9, 0);
        ctx.lineTo(o, 9);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.crimson;
      for (const [x, y] of [[-13, -4], [-16, 5]]) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, TAU);
        ctx.fill();
      }
      break;
    case 'tides':
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 2.5;
      for (const r of [5, 10, 15]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.crimson;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
      break;
    case 'drain':
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(-12, 8);
      ctx.quadraticCurveTo(0, -12, 12, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.crimson;
      ctx.beginPath();
      ctx.arc(-12, 8, 4, 0, TAU);
      ctx.arc(12, 4, 3, 0, TAU);
      ctx.fill();
      break;
    case 'swarm':
      // Three bats, the front one with crimson eyes
      ctx.fillStyle = COLORS.crimson;
      for (const [bx, by, k] of [[-9, -9, 0.6], [10, -6, 0.7], [0, 5, 1.1]]) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(k, k);
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.quadraticCurveTo(6, -9, 14, -6);
        ctx.quadraticCurveTo(10, -2, 11, 3);
        ctx.quadraticCurveTo(6, 0, 4, 3);
        ctx.lineTo(0, 1);
        ctx.lineTo(-4, 3);
        ctx.quadraticCurveTo(-6, 0, -11, 3);
        ctx.quadraticCurveTo(-10, -2, -14, -6);
        ctx.quadraticCurveTo(-6, -9, 0, -3);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2.2, 3.5, 1.6, 1.6);
      ctx.fillRect(0.6, 3.5, 1.6, 1.6);
      break;
    case 'rift':
      ctx.strokeStyle = COLORS.earth;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-16, 10);
      ctx.lineTo(-6, 2);
      ctx.lineTo(-2, 8);
      ctx.lineTo(8, -4);
      ctx.lineTo(12, 0);
      ctx.lineTo(18, -10);
      ctx.stroke();
      break;
  }
  ctx.restore();
}
