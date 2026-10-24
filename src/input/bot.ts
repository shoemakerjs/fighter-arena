import { ARENA_R, BLADE, BLINK, CHAMP, CHAMPIONS, CHRONO, CONVERGE, CRY, DRAIN, EXECUTE, FATE, FLICKER, KATANA, LEAP, LONGSHOT, METEOR, PILLARS, PLAYER_R, PROJ, RAIN, RIFT, SLASH, SLOT, SLOT_BUTTONS, SWARM, TEMPEST, TIDES, WHIRL, type AbilityId } from '../sim/constants';
import { BTN, type GameState, type Input, type Player, type ProjKind } from '../sim/types';
import { canSee, teamSees } from '../sim/vision';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Profile {
  /** Ticks before the bot notices a new projectile. */
  reaction: number;
  /** Aim error as a fraction of the distance to the target. */
  aimError: number;
  /** Chance to try dodging a projectile it noticed. */
  dodge: number;
  aggression: number;
  /** How much of the target's movement it leads its shots by. */
  lead: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { reaction: 22, aimError: 0.16, dodge: 0.25, aggression: 0.45, lead: 0.4 },
  normal: { reaction: 14, aimError: 0.09, dodge: 0.55, aggression: 0.75, lead: 0.8 },
  hard: { reaction: 8, aimError: 0.04, dodge: 0.85, aggression: 1, lead: 1 },
};

const PREFERRED_RANGE = 300;

/** Small seeded PRNG so a bot is reproducible for a given seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * AI opponent. It only reads the game state and produces an Input, exactly like
 * a human player would — the simulation can't tell the difference.
 */
export class Bot {
  private p: Profile;
  private rng: () => number;
  private strafe = 1;
  private strafeT = 0;
  private lastTx = 0;
  private lastTy = 0;
  private tvx = 0;
  private tvy = 0;
  private errX = 0;
  private errY = 0;
  private errT = 0;
  /** Last position where the (possibly stealthed) enemy was seen. */
  private seenX = 0;
  private seenY = 0;
  /** How long to draw the current longshot (ticks). */
  private drawFor = 0;
  /** The enemy it's fighting (2v2: picked among the two). */
  private targetId = -1;
  /** Per-projectile decision: will the bot react to it at all? */
  private judged = new Map<number, boolean>();

  constructor(
    readonly id: number,
    difficulty: Difficulty,
    seed = 1,
  ) {
    this.p = PROFILES[difficulty];
    this.rng = mulberry32(seed * 7919 + id);
  }

  think(s: GameState): Input {
    const me = s.players[this.id];
    const r = this.rng;
    if (me.out) return { mx: 0, my: 0, ax: Math.round(me.x), ay: Math.round(me.y), buttons: 0 };
    const foe = this.pickTarget(s, me);

    if (s.phase !== 'fight') {
      this.lastTx = this.seenX = foe.x;
      this.lastTy = this.seenY = foe.y;
      this.tvx = this.tvy = 0;
      this.judged.clear();
      return { mx: 0, my: 0, ax: Math.round(foe.x), ay: Math.round(foe.y), buttons: 0 };
    }

    // An enemy in fog or stealth can't be seen: work from where it was last visible,
    // and once there, go look around the middle.
    const hidden = !canSee(s, this.id, foe.id);
    if (!hidden) {
      this.seenX = foe.x;
      this.seenY = foe.y;
    } else if (Math.hypot(this.seenX - me.x, this.seenY - me.y) < 60) {
      this.seenX = (r() - 0.5) * 300;
      this.seenY = (r() - 0.5) * 300;
    }
    const tx = this.seenX;
    const ty = this.seenY;

    // Track the target's velocity (smoothed) for leading shots.
    this.tvx = hidden ? this.tvx * 0.9 : this.tvx * 0.7 + (foe.x - this.lastTx) * 0.3;
    this.tvy = hidden ? this.tvy * 0.9 : this.tvy * 0.7 + (foe.y - this.lastTy) * 0.3;
    this.lastTx = tx;
    this.lastTy = ty;

    const dx = tx - me.x;
    const dy = ty - me.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;
    const warrior = me.champ === CHAMP.WARRIOR;
    const assassin = me.champ === CHAMP.ASSASSIN;
    const archer = me.champ === CHAMP.ARCHER;
    const mage = me.champ === CHAMP.MAGE;
    const samurai = me.champ === CHAMP.SAMURAI;
    const blood = me.champ === CHAMP.BLOOD;
    const chrono = me.champ === CHAMP.CHRONO;
    // Champions that fight up close and walk in rather than kite.
    const melee = warrior || samurai || chrono;
    const foeMelee = foe.champ === CHAMP.WARRIOR || foe.champ === CHAMP.SAMURAI || foe.champ === CHAMP.CHRONO;
    const foeLow = foe.hp <= CHAMPIONS[foe.champ].hp * EXECUTE.threshold;
    const kit = CHAMPIONS[me.champ].abilities;
    const ready = (slot: number) => me.cooldowns[slot] === 0 && me.energy >= kit[slot].energyCost;
    const a = this.p.aggression;

    // --- Movement: warriors close in, mages hold range (more of it against melee) and strafe.
    let wx = 0;
    let wy = 0;
    const pref = assassin ? (foeMelee ? 300 : 230) : archer ? (foeMelee ? 420 : 380) : blood ? (foeMelee ? 330 : 270) : foeMelee ? 360 : foe.champ === CHAMP.ASSASSIN ? 400 : PREFERRED_RANGE;
    const radial = melee ? (dist > (samurai ? 80 : 60) ? 1 : 0) : dist > pref + 60 ? 1 : dist < pref - 80 ? -1 : 0;
    wx += nx * radial * (melee ? 1.4 : 1);
    wy += ny * radial * (melee ? 1.4 : 1);

    if (--this.strafeT <= 0) {
      this.strafe = r() < 0.5 ? -1 : 1;
      this.strafeT = 40 + Math.floor(r() * 90);
    }
    const strafe = melee ? (dist > 160 ? 0.8 : samurai ? 0.6 : 0.3) : 0.9;
    wx += -ny * this.strafe * strafe;
    wy += nx * this.strafe * strafe;

    const ed = Math.hypot(me.x, me.y);
    if (ed > s.arenaR - 120) {
      wx -= (me.x / ed) * 1.6;
      wy -= (me.y / ed) * 1.6;
    }
    // Slide around pillars instead of grinding into them.
    for (const pl of PILLARS) {
      const pd = Math.hypot(me.x - pl.x, me.y - pl.y);
      if (pd < pl.r + PLAYER_R + 30) {
        wx += ((me.x - pl.x) / pd) * 0.8;
        wy += ((me.y - pl.y) / pd) * 0.8;
      }
    }
    // Go for the orb when it's up and the bot is closer to it.
    if (s.orb.active && Math.hypot(me.x, me.y) < Math.hypot(tx, ty) && r() < 0.5) {
      wx -= me.x / Math.max(1, ed);
      wy -= me.y / Math.max(1, ed);
    }

    // --- Dodging.
    let buttons = 0;
    let dodging = false;
    let dodgeX = 0;
    let dodgeY = 0;
    let escape = false;

    for (const m of s.meteors) {
      if (s.players[m.owner].team === me.team) continue;
      const md = Math.hypot(me.x - m.x, me.y - m.y);
      if (md < METEOR.r + PLAYER_R + 30 && this.decide(m.id)) {
        const k = md < 1 ? 1 : md;
        wx = ((me.x - m.x) / k) * 3;
        wy = ((me.y - m.y) / k) * 3;
        dodging = true;
      }
    }

    for (const z of s.zones) {
      if ((z.kind !== 'rain' && z.kind !== 'converge') || s.players[z.owner].team === me.team) continue;
      const zd = Math.hypot(me.x - z.x, me.y - z.y);
      if (zd < (z.kind === 'rain' ? RAIN.r : CONVERGE.r) + PLAYER_R + 25 && this.decide(z.id)) {
        const k = zd < 1 ? 1 : zd;
        wx = ((me.x - z.x) / k) * 3;
        wy = ((me.y - z.y) / k) * 3;
        dodging = true;
      }
    }

    let threatT = Infinity;
    let threatKind: ProjKind = 'bolt';
    let threatX = 0;
    let threatY = 0;
    for (const pr of s.projectiles) {
      if (s.players[pr.owner].team === me.team || pr.age < this.p.reaction || !teamSees(s, this.id, pr.x, pr.y)) continue;
      const sp = Math.hypot(pr.vx, pr.vy);
      const ux = pr.vx / sp;
      const uy = pr.vy / sp;
      const rx = me.x - pr.x;
      const ry = me.y - pr.y;
      const along = rx * ux + ry * uy;
      if (along < 0) continue;
      const t = along / sp;
      if (t > 40) continue;
      const perp = rx * -uy + ry * ux;
      if (Math.abs(perp) > PLAYER_R + pr.r + 14) continue;
      if (!this.decide(pr.id)) continue;
      if (t < threatT) {
        threatT = t;
        threatKind = pr.kind;
        threatX = pr.x;
        threatY = pr.y;
        const side = perp >= 0 ? 1 : -1;
        dodgeX = -uy * side;
        dodgeY = ux * side;
      }
    }
    let deflecting = false;
    if (threatT < Infinity) {
      dodging = true;
      wx = dodgeX * 2;
      wy = dodgeY * 2;
      if (samurai && threatT < 18 && ready(SLOT.Q) && r() < 0.5) {
        // Deflect, facing the incoming projectile.
        buttons |= BTN.Q;
        deflecting = true;
      } else if (!warrior && threatT < 10 && ready(SLOT.SPACE) && r() < 0.3) {
        buttons |= BTN.SPACE;
      } else if (mage && threatT < 12 && threatKind !== 'bolt' && ready(SLOT.Q) && r() < 0.5) {
        buttons |= BTN.Q;
      }
    }

    // Ranged champions caught in melee range try to get out.
    // Archers have nothing for close range, so they bail out earlier.
    const close = archer ? 50 : 0;
    const foeThreatening = foeMelee && (dist < 90 + close || (dist < 120 + close && (foe.cast !== null || foe.whirlT > 0)));
    if (!melee && foeThreatening && !buttons && this.decide(-s.frame)) {
      if (archer && ready(SLOT.E) && me.cast === null && r() < 0.5) buttons |= BTN.E;
      // (The blood mage's Q is a charge-up, not an escape: it dashes off with Crimson Step below.)
      else if (!archer && !blood && ready(SLOT.Q) && r() < 0.5) buttons |= BTN.Q;
      else if (ready(SLOT.SPACE)) {
        buttons |= BTN.SPACE;
        escape = true;
      }
    }

    // --- Attacking.
    const los = this.lineOfSight(me.x, me.y, tx, ty);
    let aimId: AbilityId = me.cast ? kit[me.cast.ability].id : kit[SLOT.M1].id;
    const busy = me.cast !== null || me.counterT > 0 || me.dashT > 0;
    // A samurai deflecting towards us would send any projectile straight back: hold fire, like a person would.
    const foeDeflecting = foe.deflectT > 0 && !hidden && foe.fx * (me.x - foe.x) + foe.fy * (me.y - foe.y) > 0;
    const press = (slot: number) => {
      const id = kit[slot].id;
      if (foeDeflecting && (id in PROJ || (id === 'tempest' && me.stacks >= TEMPEST.max))) return;
      buttons |= SLOT_BUTTONS[slot];
      aimId = id;
    };

    // Keep drawing a longshot / gathering Tides of Blood until the planned charge (or the target hides).
    const charging = me.cast ? kit[me.cast.ability].id : null;
    if (me.cast && (charging === 'longshot' || charging === 'tides')) {
      const drawn = kit[me.cast.ability].cast - me.cast.t;
      if (drawn < this.drawFor && !hidden) buttons |= SLOT_BUTTONS[me.cast.ability];
    }

    let engage = false;
    // Out of body: snap back when hurt, after landing a good amount, or when it went badly.
    if (samurai && me.soulT > 0 && (me.hp < CHAMPIONS[me.champ].hp * 0.3 || me.soulDmg >= 20 || dist > 360) && r() < 0.1) buttons |= BTN.E;

    if (!busy && !(buttons & (BTN.SPACE | BTN.Q | BTN.E))) {
      if (samurai) {
        const pinned = foeLow || foe.rootT > 0 || foe.stunT > 0 || foe.cast !== null;
        const crescent = me.stacks >= TEMPEST.max;
        if (ready(SLOT.R) && !hidden && los && dist < FATE.range - 20 && r() < (pinned ? 0.3 : 0.03)) press(SLOT.R);
        else if (ready(SLOT.E) && me.soulT === 0 && !hidden && dist > 120 && dist < 320 && r() < 0.03 * a) press(SLOT.E);
        else if (ready(SLOT.SPACE) && !hidden && dist > 140 && dist < BLADE.ticks * BLADE.speed + 80 && r() < 0.06 * a) {
          press(SLOT.SPACE);
          engage = true;
        } else if (ready(SLOT.M2) && los && dist < (crescent ? PROJ.crescent.range - 40 : TEMPEST.len + PLAYER_R * 2 - 10) && r() < 0.2 * a) press(SLOT.M2);
        else if (dist < 2 * PLAYER_R + KATANA.reach && r() < 0.95 * a) press(SLOT.M1);
      } else if (chrono) {
        const reach = 2 * PLAYER_R + CHRONO.reach;
        // Recall after a bad trade (it lost a lot over the last two seconds), or when low and cornered.
        const lost = me.trail.length >= 3 ? me.trail[2] - me.hp : 0;
        const lowMe = me.hp < CHAMPIONS[me.champ].hp * 0.35;
        const pinned = foe.stunT > 0 || foe.slowT > 0 || foe.rootT > 0 || foe.cast !== null;
        if (ready(SLOT.E) && (lost >= 30 || (lowMe && dist < 150)) && r() < 0.2) press(SLOT.E);
        else if (ready(SLOT.R) && !hidden && los && dist < PROJ.pulse.range - 30 && r() < (pinned ? 0.3 : 0.03)) press(SLOT.R);
        else if (ready(SLOT.Q) && !hidden && dist < CONVERGE.range && (pinned || dist < reach + 20) && r() < 0.06 * a) press(SLOT.Q);
        else if (me.charges > 0 && ready(SLOT.SPACE) && !hidden && dist > 170 && dist < 170 + FLICKER.range && r() < 0.08 * a) {
          press(SLOT.SPACE);
          engage = true;
        } else if (ready(SLOT.M2) && !hidden && dist < PROJ.clock.range && r() < 0.08 * a) press(SLOT.M2);
        else if (dist < reach && r() < 0.95 * a) press(SLOT.M1);
      } else if (blood) {
        const hurt = me.hp < CHAMPIONS[me.champ].hp * 0.75;
        // Night Swarm: through a weakened target, or away from a melee one when low.
        const low = me.hp < CHAMPIONS[me.champ].hp * 0.3;
        const swarmIn = !hidden && dist < SWARM.range - 30 && foe.hp < CHAMPIONS[foe.champ].hp * 0.4;
        if (ready(SLOT.R) && (swarmIn || (low && foeMelee && dist < 200) || (!hidden && dist < SWARM.range - 30 && r() < 0.005))) press(SLOT.R);
        else if (ready(SLOT.E) && !hidden && dist < DRAIN.range - 40 && (hurt || foeMelee) && r() < 0.08 * a) press(SLOT.E);
        else if (ready(SLOT.Q) && dist < TIDES.r + PLAYER_R && r() < 0.15 * a) {
          press(SLOT.Q);
          // Gather longer when the target is slowed or rooted and won't walk out.
          this.drawFor = Math.ceil(kit[SLOT.Q].cast * (foe.slowT > 0 || foe.rootT > 0 ? 1 : 0.4 + r() * 0.4));
        } else if (ready(SLOT.M2) && los && dist < PROJ.transfusion.range - 30 && r() < 0.1 * a) press(SLOT.M2);
        else if (los && dist < PROJ.bloodbolt.range && (!dodging || r() < 0.5) && r() < 0.9 * a) press(SLOT.M1);
      } else if (archer) {
        const pinned = foe.rootT > 0 || foe.slowT > 0 || foe.cast !== null;
        if (ready(SLOT.R) && !hidden && dist < RAIN.range + 40 && (pinned ? r() < 0.2 : r() < 0.005)) press(SLOT.R);
        else if (ready(SLOT.Q) && hidden && r() < 0.015) press(SLOT.Q);
        else if (ready(SLOT.E) && los && dist < PROJ.snare.range - 40 && r() < (foeMelee && dist < 220 ? 0.2 : 0.02) * a) press(SLOT.E);
        else if (ready(SLOT.M2) && los && !hidden && dist < PROJ.longshot.range + LONGSHOT.range - 60 && r() < (foe.rootT > 0 ? 0.3 : 0.03) * a) {
          press(SLOT.M2);
          // Draw just enough to reach, more when the target is pinned down.
          const need = (dist - PROJ.longshot.range) / LONGSHOT.range;
          this.drawFor = Math.ceil(kit[SLOT.M2].cast * Math.max(foe.rootT > 0 ? 1 : 0.4 + r() * 0.6, need + 0.1));
        } else if (ready(SLOT.Q) && los && r() < 0.004) press(SLOT.Q);
        else if (los && dist < PROJ.arrow.range && (!dodging || r() < 0.5) && r() < 0.9 * a) press(SLOT.M1);
      } else if (assassin) {
        const lowMe = me.hp < CHAMPIONS[me.champ].hp * 0.4;
        if (ready(SLOT.R) && !hidden && dist < EXECUTE.range - 20 && r() < (foeLow ? 0.4 : 0.02)) press(SLOT.R);
        else if (ready(SLOT.Q) && me.stealthT === 0 && (lowMe || dist > 380) && r() < 0.02) press(SLOT.Q);
        else if (me.stealthT > 0 && dist > 200) {
          // Stay hidden while closing in.
        } else if (ready(SLOT.SPACE) && foeLow && dist > 200 && dist < 200 + BLINK.range && r() < 0.1) press(SLOT.SPACE);
        else if (ready(SLOT.M2) && los && dist < PROJ.mark.range - 30 && r() < 0.04 * a) press(SLOT.M2);
        else if (ready(SLOT.E) && los && dist < PROJ.poison.range - 30 && r() < 0.03 * a) press(SLOT.E);
        else if (los && dist < PROJ.dagger.range - 10 && (!dodging || r() < 0.5) && r() < 0.9 * a) press(SLOT.M1);
      } else if (warrior) {
        const reach = 2 * PLAYER_R + SLASH.reach;
        if (ready(SLOT.R) && los && dist < RIFT.len && r() < 0.1) press(SLOT.R);
        // War Cry pulls: interrupt a cast, or drag a target that is just out of axe reach.
        else if (ready(SLOT.Q) && dist < CRY.r && (foe.cast !== null || (dist > reach && r() < 0.15 * a))) press(SLOT.Q);
        else if (ready(SLOT.SPACE) && dist > 150 && dist < LEAP.range + 40 && r() < 0.07 * a) press(SLOT.SPACE);
        else if (ready(SLOT.M2) && los && dist > 140 && dist < PROJ.hook.range - 30 && r() < 0.06 * a) press(SLOT.M2);
        else if (ready(SLOT.E) && dist < WHIRL.r + 10 && me.whirlT === 0 && r() < 0.03 * a) press(SLOT.E);
        else if (dist < reach && me.whirlT === 0 && r() < 0.95 * a) press(SLOT.M1);
      } else if (los && dist < PROJ.bolt.range) {
        const foeCastingBlast = foe.cast !== null && CHAMPIONS[foe.champ].abilities[foe.cast.ability].id === 'blast';
        if (ready(SLOT.R) && dist < METEOR.range + 40 && (foe.slowT > 0 || foe.cast) && r() < 0.1) press(SLOT.R);
        else if (ready(SLOT.M2) && foeMelee && dist < 150 && r() < 0.3 * a) press(SLOT.M2);
        else if (ready(SLOT.M2) && dist < PROJ.blast.range - 80 && (foeCastingBlast ? r() < 0.15 * a : r() < 0.02 * a)) press(SLOT.M2);
        else if (ready(SLOT.E) && dist < PROJ.frost.range - 40 && r() < (foeMelee && dist < 250 ? 0.2 : 0.015) * a) press(SLOT.E);
        else if (!dodging || r() < 0.5) {
          if (r() < 0.9 * a) press(SLOT.M1);
        }
      }
    }

    // --- Aim with lead + slowly drifting error.
    if (--this.errT <= 0) {
      this.errT = 25 + Math.floor(r() * 20);
      this.errX = (r() * 2 - 1) * this.p.aimError * dist;
      this.errY = (r() * 2 - 1) * this.p.aimError * dist;
    }
    let ax: number;
    let ay: number;
    if (deflecting || me.deflectT > 0) {
      // Face the incoming projectile, or else the shooter, so the deflect catches it.
      ax = threatT < Infinity ? threatX : tx;
      ay = threatT < Infinity ? threatY : ty;
    } else if (engage || aimId === 'soul' || aimId === 'fate') {
      // Samurai engages: dash, spirit or blink straight at the target, leading a little.
      ax = tx + this.tvx * 12 * this.p.lead;
      ay = ty + this.tvy * 12 * this.p.lead;
    } else if (aimId === 'tempest' && me.stacks >= TEMPEST.max) {
      const t = dist / PROJ.crescent.speed;
      ax = tx + this.tvx * t * this.p.lead + this.errX;
      ay = ty + this.tvy * t * this.p.lead + this.errY;
    } else if (aimId === 'blink' && !escape && threatT === Infinity) {
      // Blink in for the kill.
      ax = tx;
      ay = ty;
    } else if (buttons & BTN.SPACE && !warrior) {
      // Dash / blink: sideways out of a projectile, or straight away from a melee threat.
      // A vault jumps away from the aim point, so aim the other way.
      const flip = archer ? -1 : 1;
      const ex = (escape ? -nx : dodgeX) * flip;
      const ey = (escape ? -ny : dodgeY) * flip;
      ax = me.x + ex * 200;
      ay = me.y + ey * 200;
    } else if (aimId === 'converge') {
      // Where the target will be when the field collapses (roughly).
      ax = tx + this.tvx * CONVERGE.delay * this.p.lead * 0.4;
      ay = ty + this.tvy * CONVERGE.delay * this.p.lead * 0.4;
    } else if (aimId === 'swarm') {
      // Fly through the target, or away from it when low.
      const away = me.hp < CHAMPIONS[me.champ].hp * 0.3 && foe.hp >= CHAMPIONS[foe.champ].hp * 0.4;
      ax = away ? me.x - nx * SWARM.range : tx + nx * 80;
      ay = away ? me.y - ny * SWARM.range : ty + ny * 80;
    } else if (aimId === 'meteor' || aimId === 'rain') {
      const t = kit[SLOT.R].cast + (aimId === 'rain' ? RAIN.delay : METEOR.delay);
      ax = tx + this.tvx * t * this.p.lead * 0.5;
      ay = ty + this.tvy * t * this.p.lead * 0.5;
    } else if (aimId === 'leap') {
      ax = tx + this.tvx * LEAP.ticks * this.p.lead;
      ay = ty + this.tvy * LEAP.ticks * this.p.lead;
    } else if (aimId in PROJ) {
      const t = dist / PROJ[aimId as ProjKind].speed;
      ax = tx + this.tvx * t * this.p.lead + this.errX;
      ay = ty + this.tvy * t * this.p.lead + this.errY;
    } else {
      // Melee, line attacks and the execute dash: aim straight at the target.
      ax = tx + this.tvx * 6;
      ay = ty + this.tvy * 6;
    }

    // Keep the arena-wide clamp so a wild aim point stays sane.
    const lim = ARENA_R * 2;
    return {
      mx: Math.abs(wx) > 0.3 ? Math.sign(wx) : 0,
      my: Math.abs(wy) > 0.3 ? Math.sign(wy) : 0,
      ax: Math.round(Math.max(-lim, Math.min(lim, ax))),
      ay: Math.round(Math.max(-lim, Math.min(lim, ay))),
      buttons,
    };
  }

  /**
   * The enemy to fight: the nearest one it can see (else the nearest), sticking with
   * the current one unless another is clearly closer. In 1v1 it's simply the opponent.
   */
  private pickTarget(s: GameState, me: Player): Player {
    const foes = s.players.filter((p) => p.team !== me.team && !p.out);
    if (foes.length === 0) return s.players.find((p) => p.team !== me.team)!;
    const dist = (p: Player) => Math.hypot(p.x - me.x, p.y - me.y);
    const visible = foes.filter((p) => canSee(s, this.id, p.id));
    const pool = visible.length ? visible : foes;
    let best = pool.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const cur = pool.find((p) => p.id === this.targetId);
    if (cur && dist(cur) < dist(best) / 0.7) best = cur;
    if (best.id !== this.targetId) {
      // New target: forget the old one's last position and speed.
      this.targetId = best.id;
      this.lastTx = this.seenX = best.x;
      this.lastTy = this.seenY = best.y;
      this.tvx = this.tvy = 0;
    }
    return best;
  }

  private decide(id: number): boolean {
    let d = this.judged.get(id);
    if (d === undefined) {
      d = this.rng() < this.p.dodge;
      this.judged.set(id, d);
      if (this.judged.size > 200) this.judged.delete(this.judged.keys().next().value!);
    }
    return d;
  }

  private lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    for (const pl of PILLARS) {
      const t = Math.max(0, Math.min(1, ((pl.x - x0) * dx + (pl.y - y0) * dy) / len2));
      const cx = x0 + dx * t - pl.x;
      const cy = y0 + dy * t - pl.y;
      const rr = pl.r + PROJ.bolt.r;
      if (cx * cx + cy * cy < rr * rr) return false;
    }
    return true;
  }
}
