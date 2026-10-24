import { CHAMPIONS, MAX_ENERGY, ROUNDS_TO_WIN, SLOT_KEYS, SUDDEN_DEATH_AT, TEMPEST, TICK_RATE, type AbilityId } from '../sim/constants';
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
  private chip = [0, 0];
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

    for (let i = 0; i < 2; i++) {
      const hp = cur.players[i].hp;
      this.chip[i] = hp > this.chip[i] ? hp : this.chip[i] + (hp - this.chip[i]) * Math.min(1, dt * 3);
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
      this.drawOverhead(p, view.worldToScreen(p.x, p.y, OVERHEAD_H));
    }
    this.drawTexts(fx, view);

    if (opts.localId !== null) {
      this.drawTopHud(cur);
      this.drawAbilityBar(cur.players[opts.localId]);
    }
    this.drawCenterText(cur, fx);
    if (opts.cursor) this.drawCursor(opts.cursor, opts.localId ?? 0);
  }

  private drawOverhead(p: Player, at: Vec) {
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
    // Energy, split in quarters
    ctx.fillStyle = COLORS.energy;
    ctx.fillRect(x, y + 7.5, (w * p.energy) / MAX_ENERGY, 2);
    ctx.fillStyle = 'rgba(5,7,12,0.9)';
    for (let i = 1; i < 4; i++) ctx.fillRect(x + (w * i) / 4 - 0.5, y + 7, 1, 3);

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

    // Names, score pips, HP
    for (let i = 0; i < 2; i++) {
      const dir = i === 0 ? -1 : 1;
      const color = COLORS.players[i];
      const p = s.players[i];
      const nameX = cx + dir * 70;
      ctx.textAlign = i === 0 ? 'right' : 'left';
      ctx.font = `22px ${DISPLAY}`;
      ctx.fillStyle = color;
      const name = p.dummy ? 'TRAINING DUMMY' : `${PLAYER_NAMES[i]} · ${ROSTER[p.champ].hero}`;
      ctx.fillText(name, nameX, y - 6);

      const barW = Math.min(260, this.w / 2 - 110);
      const bx = i === 0 ? nameX - barW : nameX;
      ctx.fillStyle = 'rgba(12, 15, 22, 0.85)';
      roundRect(ctx, bx, y + 6, barW, 10, 3);
      ctx.fill();
      const hpW = (barW * p.hp) / maxHp(p);
      const chipW = (barW * this.chip[i]) / maxHp(p);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(i === 0 ? bx + barW - chipW : bx, y + 7, chipW, 8);
      ctx.fillStyle = color;
      ctx.fillRect(i === 0 ? bx + barW - hpW : bx, y + 7, hpW, 8);

      const nameW = ctx.measureText(name).width;
      for (let r = 0; r < ROUNDS_TO_WIN; r++) {
        ctx.beginPath();
        ctx.arc(nameX + dir * (nameW + 14 + r * 16), y - 7, 5, 0, TAU);
        ctx.fillStyle = r < s.score[i] ? color : 'rgba(255,255,255,0.1)';
        ctx.fill();
      }
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
      const cd = p.cooldowns[i];
      const noEnergy = p.energy < def.energyCost;
      const active =
        p.cast?.ability === i ||
        (def.id === 'counter' && p.counterT > 0) ||
        ((def.id === 'dash' || def.id === 'leap' || def.id === 'vault' || def.id === 'blade') && p.dashT > 0) ||
        (def.id === 'arrow' && p.quickT > 0) ||
        (def.id === 'soul' && p.soulT > 0) ||
        (def.id === 'deflect' && p.deflectT > 0) ||
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

      // Steel Tempest stacks
      if (def.id === 'tempest') {
        for (let k = 0; k < TEMPEST.max; k++) {
          ctx.beginPath();
          ctx.arc(x + slot / 2 + (k - (TEMPEST.max - 1) / 2) * 10, y0 + slot - 7, 3, 0, TAU);
          ctx.fillStyle = k < p.stacks ? COLORS.edge : 'rgba(255,255,255,0.15)';
          ctx.fill();
        }
      }

      if (cd > 0 && def.cooldown > 30) {
        const k = cd / def.cooldown;
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
