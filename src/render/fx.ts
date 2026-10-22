import { COUNTDOWN_TICKS, CRY, LEAP, METEOR, ORB_ENERGY, ORB_HEAL, RIFT, SLASH, PLAYER_R, WHIRL } from '../sim/constants';
import type { GameEvent, GameState } from '../sim/types';
import { pointVisible } from '../sim/vision';
import type { Sfx } from './audio';
import { abilityColor, COLORS } from './theme';

export interface Particle {
  x: number;
  y: number;
  /** Height above the floor (used by the 3D view). */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

export interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

export interface Banner {
  text: string;
  sub: string;
  color: string;
  life: number;
  max: number;
}

export const PLAYER_NAMES = ['TY', 'BOT'];

/** Cosmetic effects driven by simulation events. Lives outside the deterministic sim. */
export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  banner: Banner | null = null;
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  silent = false;

  constructor(private sfx: Sfx) {}

  reset() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.banner = null;
    this.shake = 0;
    this.flash = 0;
  }

  private sound(name: Parameters<Sfx['play']>[0]) {
    if (!this.silent) this.sfx.play(name);
  }

  handle(events: GameEvent[], s: GameState, localId: number | null) {
    if (s.phase === 'countdown' && (s.phaseT === COUNTDOWN_TICKS - 1 || s.phaseT === 100 || s.phaseT === 50)) {
      this.sound('tick');
    }

    const viewer = localId === null ? null : s.players[localId];
    for (const e of events) {
      // Effects of enemy actions inside the fog would give their position away.
      const at = cosmeticPos(e, s);
      if (viewer && at && at.player !== localId && !pointVisible(viewer, at.x, at.y)) continue;
      switch (e.type) {
        case 'cast':
          if (e.ability === 'meteor' || e.ability === 'rift') this.sound('meteorCast');
          break;

        case 'release': {
          const color = COLORS.players[e.player];
          if (e.ability === 'bolt') {
            this.burst(e.x, e.y, 4, color, 120, 2.5, 0.18);
            this.sound('bolt');
          } else if (e.ability === 'blast') {
            this.burst(e.x, e.y, 12, COLORS.blast, 220, 4, 0.3);
            this.shake += 2;
            this.sound('blast');
          } else if (e.ability === 'frost') {
            this.burst(e.x, e.y, 8, COLORS.frost, 160, 3, 0.3);
            this.sound('frost');
          } else if (e.ability === 'hook') {
            this.burst(e.x, e.y, 8, COLORS.steel, 160, 2.5, 0.25);
            this.sound('hook');
          } else if (e.ability === 'dagger') {
            this.burst(e.x, e.y, 3, COLORS.players[e.player], 100, 2, 0.15);
            this.sound('slash');
          } else if (e.ability === 'mark' || e.ability === 'poison') {
            this.burst(e.x, e.y, 8, abilityColor(e.ability, e.player), 150, 2.5, 0.3);
            this.sound('frost');
          }
          break;
        }

        case 'hit': {
          if (e.kind === 'poison') {
            // Damage over time: small green ticks, no shake.
            const t = s.players[e.target];
            this.burst(t.x, t.y, 4, COLORS.poison, 90, 2.2, 0.4, 20);
            this.texts.push({ x: t.x + (Math.random() - 0.5) * 30, y: t.y - 30, text: String(e.dmg), color: COLORS.poison, life: 0.7, max: 0.7, size: 14 });
            break;
          }
          const big = e.kind === 'blast' || e.kind === 'meteor' || e.kind === 'rift' || e.kind === 'leap' || e.kind === 'execute';
          const color = abilityColor(e.kind, e.source);
          this.burst(e.x, e.y, big ? 26 : 10, color, big ? 340 : 220, big ? 4.5 : 3, big ? 0.5 : 0.32);
          this.burst(e.x, e.y, 4, '#ffffff', 160, 2, 0.15);
          const target = s.players[e.target];
          this.texts.push({
            x: target.x + (Math.random() - 0.5) * 20,
            y: target.y - 38,
            text: String(e.dmg),
            color: e.target === localId ? '#ff7a8c' : big ? COLORS.blast : '#ffffff',
            life: 0.9,
            max: 0.9,
            size: big ? 26 : 18,
          });
          if (big) this.rings.push({ x: e.x, y: e.y, r0: 10, r1: 70, life: 0.3, max: 0.3, color, width: 5 });
          this.shake += big ? 9 : 2.5;
          this.sound(big ? 'bigHit' : 'hit');
          break;
        }

        case 'block': {
          const color = COLORS.players[e.player];
          const p = s.players[e.player];
          this.rings.push({ x: p.x, y: p.y, r0: 24, r1: 80, life: 0.35, max: 0.35, color: '#ffffff', width: 4 });
          this.burst(e.x, e.y, 16, color, 260, 3, 0.35);
          this.texts.push({ x: p.x, y: p.y - 46, text: 'KONTRA!', color, life: 1, max: 1, size: 20 });
          this.shake += 3;
          this.sound('block');
          break;
        }

        case 'impact':
          this.burst(e.x, e.y, e.kind === 'blast' ? 14 : 5, abilityColor(e.kind, e.owner), 140, 2.5, 0.25);
          this.sound('impact');
          break;

        case 'meteor':
          this.rings.push({ x: e.x, y: e.y, r0: 20, r1: METEOR.r + 30, life: 0.45, max: 0.45, color: COLORS.meteor, width: 10 });
          this.burst(e.x, e.y, 50, COLORS.meteor, 420, 5, 0.7, 5);
          this.burst(e.x, e.y, 20, '#fff3c4', 260, 3, 0.4, 5);
          this.shake += 12;
          this.flash = 0.18;
          this.flashColor = COLORS.meteor;
          this.sound('boom');
          break;

        case 'orbSpawn':
          this.rings.push({ x: 0, y: 0, r0: 60, r1: 20, life: 0.5, max: 0.5, color: COLORS.orb, width: 3 });
          this.sound('counter');
          break;

        case 'orbHit':
          this.burst(e.x, e.y, 6, COLORS.orb, 180, 2.5, 0.3);
          break;

        case 'orbBreak': {
          const p = s.players[e.player];
          this.rings.push({ x: 0, y: 0, r0: 10, r1: 130, life: 0.5, max: 0.5, color: COLORS.orb, width: 6 });
          this.burst(0, 0, 36, COLORS.orb, 320, 4, 0.6);
          this.texts.push({ x: p.x, y: p.y - 46, text: `+${ORB_HEAL} HP  +${ORB_ENERGY} EN`, color: COLORS.orb, life: 1.3, max: 1.3, size: 17 });
          this.sound('orb');
          break;
        }

        case 'dash': {
          const color = COLORS.players[e.player];
          this.burst(e.x, e.y, 14, color, 120, 3.5, 0.35, 8);
          this.sound('dash');
          break;
        }

        case 'counter':
          this.sound('counter');
          break;

        case 'swing': {
          // Arc of sparks along the axe's path.
          const color = COLORS.players[e.player];
          const base = Math.atan2(e.fy, e.fx);
          const reach = PLAYER_R + SLASH.reach * 0.8;
          for (let i = 0; i <= 8; i++) {
            const a = base - 0.95 + (i / 8) * 1.9;
            this.burst(e.x + Math.cos(a) * reach, e.y + Math.sin(a) * reach, 2, i % 3 === 0 ? '#ffffff' : color, 70, 2.6, 0.22, 26);
          }
          this.sound('slash');
          break;
        }

        case 'blink': {
          this.burst(e.x0, e.y0, 18, COLORS.shadow, 160, 3.5, 0.45, 25);
          this.burst(e.x, e.y, 18, COLORS.shadow, 220, 3, 0.35, 25);
          this.rings.push({ x: e.x, y: e.y, r0: 40, r1: 10, life: 0.25, max: 0.25, color: COLORS.shadow, width: 4 });
          this.sound('dash');
          break;
        }

        case 'stealth':
          this.burst(e.x, e.y, 30, '#8f8aa8', 120, 6, 0.8, 15);
          this.sound('counter');
          break;

        case 'reveal':
          this.burst(e.x, e.y, 10, COLORS.shadow, 140, 2.5, 0.3, 25);
          break;

        case 'markPop': {
          this.rings.push({ x: e.x, y: e.y, r0: 10, r1: 60, life: 0.35, max: 0.35, color: COLORS.shadow, width: 6 });
          this.burst(e.x, e.y, 20, COLORS.shadow, 280, 3.5, 0.4, 40);
          this.shake += 4;
          this.sound('bigHit');
          break;
        }

        case 'execute': {
          this.burst(e.x, e.y, e.lethal ? 50 : 20, COLORS.blood, e.lethal ? 420 : 260, 4, 0.5);
          if (e.lethal) {
            this.flash = 0.2;
            this.flashColor = COLORS.blood;
            this.texts.push({ x: e.x, y: e.y - 60, text: 'EGZEKUCJA', color: COLORS.blood, life: 1.1, max: 1.1, size: 22 });
          }
          this.shake += e.lethal ? 12 : 6;
          this.sound('slash');
          break;
        }

        case 'nova': {
          const color = COLORS.players[e.player];
          this.rings.push({ x: e.x, y: e.y, r0: 20, r1: CRY.r, life: 0.35, max: 0.35, color, width: 8 });
          this.rings.push({ x: e.x, y: e.y, r0: 10, r1: CRY.r * 0.7, life: 0.25, max: 0.25, color: '#ffffff', width: 3 });
          this.burst(e.x, e.y, 24, color, 380, 3.5, 0.35, 10);
          this.shake += 4;
          this.sound('blast');
          break;
        }

        case 'whirl': {
          const color = COLORS.players[e.player];
          this.rings.push({ x: e.x, y: e.y, r0: WHIRL.r * 0.5, r1: WHIRL.r, life: 0.2, max: 0.2, color, width: 4 });
          this.burst(e.x, e.y, 8, color, 260, 2.5, 0.25, 26);
          this.sound('whirl');
          break;
        }

        case 'leap': {
          const color = COLORS.players[e.player];
          this.burst(e.x, e.y, 14, COLORS.earth, 160, 3.5, 0.35, 4);
          this.burst(e.x, e.y, 6, color, 120, 3, 0.3, 10);
          this.sound('dash');
          break;
        }

        case 'land':
          this.rings.push({ x: e.x, y: e.y, r0: 10, r1: LEAP.r + 15, life: 0.4, max: 0.4, color: COLORS.earth, width: 8 });
          this.burst(e.x, e.y, 34, COLORS.earth, 340, 4.5, 0.55, 3);
          this.shake += 8;
          this.sound('bigHit');
          break;

        case 'rift': {
          // Eruptions marching along the line.
          for (let d = 30; d <= RIFT.len; d += 30) {
            const x = e.x + e.fx * (PLAYER_R + d);
            const y = e.y + e.fy * (PLAYER_R + d);
            this.burst(x, y, 6, d % 60 === 0 ? COLORS.earth : '#ffe2a8', 220, 4, 0.5, 2);
          }
          for (let d = 60; d <= RIFT.len; d += 100) {
            this.rings.push({ x: e.x + e.fx * d, y: e.y + e.fy * d, r0: 8, r1: RIFT.half + 18, life: 0.4, max: 0.4, color: COLORS.earth, width: 6 });
          }
          this.shake += 11;
          this.flash = 0.12;
          this.flashColor = COLORS.earth;
          this.sound('boom');
          break;
        }

        case 'ko': {
          const color = COLORS.players[e.player];
          this.burst(e.x, e.y, 70, color, 520, 5, 0.9);
          this.burst(e.x, e.y, 30, '#ffffff', 300, 3, 0.5);
          this.rings.push({ x: e.x, y: e.y, r0: 20, r1: 200, life: 0.6, max: 0.6, color, width: 8 });
          this.shake += 18;
          this.flash = 0.25;
          this.flashColor = '#ffffff';
          this.sound('ko');
          break;
        }

        case 'fight':
          this.banner = { text: 'WALCZ!', sub: '', color: COLORS.text, life: 0.9, max: 0.9 };
          this.sound('fight');
          break;

        case 'roundEnd': {
          let text = 'REMIS';
          let color = COLORS.text;
          if (e.winner >= 0) {
            color = COLORS.players[e.winner];
            if (localId === null) text = `RUNDA: ${PLAYER_NAMES[e.winner]}`;
            else text = e.winner === localId ? 'RUNDA WYGRANA' : 'RUNDA PRZEGRANA';
          }
          this.banner = { text, sub: `${s.score[0]} : ${s.score[1]}`, color, life: 2.2, max: 2.2 };
          break;
        }

        case 'suddenDeath':
          this.banner = { text: 'NAGŁA ŚMIERĆ', sub: 'arena się zamyka', color: COLORS.danger, life: 2, max: 2 };
          this.flash = 0.2;
          this.flashColor = COLORS.danger;
          this.sound('fight');
          break;

        case 'roundStart':
        case 'matchEnd':
          break;
      }
    }
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= 900 * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.35;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) t.life -= dt;
    this.texts = this.texts.filter((t) => t.life > 0);

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);

    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    this.shake = Math.min(24, this.shake) * Math.exp(-dt * 9);
    this.flash = Math.max(0, this.flash - dt);
  }

  burst(x: number, y: number, n: number, color: string, speed: number, size: number, life: number, z = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const l = life * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: speed * (0.2 + Math.random() * 0.8),
        life: l,
        max: l,
        size: size * (0.6 + Math.random() * 0.6),
        color,
        drag: 5,
      });
    }
  }
}


/** Where a purely cosmetic event happens (null for events that are always shown). */
function cosmeticPos(e: GameEvent, s: GameState): { x: number; y: number; player: number } | null {
  switch (e.type) {
    case 'cast': {
      const p = s.players[e.player];
      return { x: p.x, y: p.y, player: e.player };
    }
    case 'release':
    case 'dash':
    case 'leap':
    case 'land':
    case 'swing':
    case 'nova':
    case 'whirl':
    case 'rift':
    case 'blink':
    case 'stealth':
    case 'reveal':
      return { x: e.x, y: e.y, player: e.player };
    case 'impact':
      return { x: e.x, y: e.y, player: e.owner };
    default:
      return null;
  }
}
