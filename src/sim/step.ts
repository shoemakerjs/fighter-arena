/**
 * Deterministic game simulation.
 *
 * Rules for everything in this folder, so the same code can later run rollback
 * netcode or verify replays on a server:
 * - state only changes inside step(), from the previous state + both inputs;
 * - no Date, no Math.random, no Math.sin/cos/atan2 (engines may differ in the
 *   last bits) — only + - * / and Math.sqrt;
 * - iteration order is always array order.
 */
import {
  ARENA_MIN_R,
  ARENA_R,
  ARENA_SHRINK,
  BLADE,
  BLEED,
  BLINK,
  BLOODBOLT,
  BUFFER_TICKS,
  CHAMP,
  CHAMPIONS,
  CHRONO,
  CLOCK,
  CONVERGE,
  COUNTDOWN_TICKS,
  COUNTER,
  CRY,
  DASH,
  DUMMY,
  DEFLECT,
  DRAIN,
  EXECUTE,
  FATE,
  FLICKER,
  HASTE_MUL,
  JAB,
  KATANA,
  KB_DECAY,
  LEAP,
  LILY,
  LONGSHOT,
  MARK,
  MARSH,
  MAX_ENERGY,
  METEOR,
  ORB_ENERGY,
  ORB_HEAL,
  ORB_HP,
  ORB_R,
  ORB_RESPAWN,
  ORB_SPAWN_AT,
  MAPS,
  SUBMERGE,
  PICKUP,
  PLAYER_R,
  POISON,
  PROJ,
  PULSE,
  RAIN,
  RECALL,
  RIFT,
  ROUND_END_TICKS,
  ROUNDS_TO_WIN,
  SLASH,
  SLOT,
  SLOT_BUTTONS,
  SMOKE,
  SNARE,
  SOUL,
  SONIC,
  SPAWNS,
  STAB,
  VENOM,
  STEP,
  SWARM,
  SUDDEN_DEATH_AT,
  TEAM_SPREAD,
  TEMPEST,
  TIDES,
  TOAD,
  TONGUE,
  TRANSFUSION,
  VAULT,
  WHIRL,
  type AbilityDef,
  type AbilityId,
  type River,
} from './constants';
import { BTN, type GameEvent, type GameState, type HitKind, type Input, type Player, type Projectile, type ProjKind } from './types';
import { lineClear, solidsOf } from './vision';

/**
 * `champs` has one entry per player: two for 1v1, four for 2v2 (teams by id % 2).
 * `training`: player 1 is a training dummy standing in the middle (champs[1] is ignored).
 * `map`: index into MAPS, the first round's map; `rotateMaps` picks another one every round after.
 */
export function createMatch(champs: number[] = [0, 0], training = false, map = 0, rotateMaps = true): GameState {
  return {
    frame: 0,
    training,
    champs: champs.slice(),
    map: Math.max(0, Math.min(MAPS.length - 1, map)),
    rotateMaps,
    phase: training ? 'fight' : 'countdown',
    phaseT: training ? 0 : COUNTDOWN_TICKS,
    round: 1,
    roundFrame: 0,
    score: [0, 0],
    lastRoundWinner: -1,
    arenaR: ARENA_R,
    players: champs.map((c, i) => createPlayer(i, c, champs.length, training && i === 1)),
    projectiles: [],
    meteors: [],
    zones: [],
    // No orb in training: it would sit right under the dummy.
    orb: { active: false, hp: ORB_HP, timer: training ? Number.MAX_SAFE_INTEGER : ORB_SPAWN_AT },
    pickups: [],
    pickupT: PICKUP.first,
    nextId: 1,
  };
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

export function abilityOf(p: Player, slot: number): AbilityDef {
  return CHAMPIONS[p.champ].abilities[slot];
}

export function maxHp(p: Player): number {
  return p.dummy ? DUMMY.hp : CHAMPIONS[p.champ].hp;
}

/** Team spawn, with 2v2 partners side by side. */
function spawnOf(id: number, count: number): { x: number; y: number } {
  const base = SPAWNS[id % 2];
  if (count <= 2) return base;
  return { x: base.x, y: base.y + (id < 2 ? -TEAM_SPREAD : TEAM_SPREAD) };
}

function createPlayer(id: number, champ: number, count: number, dummy = false): Player {
  const spawn = dummy ? { x: 0, y: 0 } : spawnOf(id, count);
  return {
    id,
    team: id % 2,
    out: false,
    dummy,
    restT: 0,
    champ,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    fx: id % 2 === 0 ? 1 : -1,
    fy: 0,
    hp: dummy ? DUMMY.hp : CHAMPIONS[champ].hp,
    energy: 0,
    cooldowns: [0, 0, 0, 0, 0, 0],
    cast: null,
    buffer: -1,
    bufferT: 0,
    prevButtons: 0,
    dashT: 0,
    dashX: 0,
    dashY: 0,
    dashKind: 0,
    dashHit: 0,
    whirlT: 0,
    markT: 0,
    stealthT: 0,
    ambushT: 0,
    poisonT: 0,
    venom: 0,
    venomT: 0,
    poisonBy: 0,
    rootT: 0,
    revealT: 0,
    quickT: 0,
    stunT: 0,
    deflectT: 0,
    stacks: 0,
    stackT: 0,
    soulT: 0,
    soulX: 0,
    soulY: 0,
    soulDmg: 0,
    soulTarget: -1,
    bleedT: 0,
    bleedBy: 0,
    drainT: 0,
    drainTarget: -1,
    bloodCount: 0,
    resoN: 0,
    resoT: 0,
    resoTarget: -1,
    charges: FLICKER.charges,
    chargeT: 0,
    trail: [],
    submergeT: 0,
    pickT: 0,
    counterT: 0,
    slowT: 0,
    slowMul: 1,
    hasteT: 0,
    hitT: 0,
  };
}

function resetRound(s: GameState) {
  if (s.rotateMaps && MAPS.length > 1) {
    // Any map but the last one. The frame the round ends on varies from round to round,
    // so it serves as the dice while every peer still picks the same.
    const k = (Math.imul(s.frame, 2654435761) >>> 0) % (MAPS.length - 1);
    s.map = k >= s.map ? k + 1 : k;
  }
  s.round++;
  s.roundFrame = 0;
  s.phase = 'countdown';
  s.phaseT = COUNTDOWN_TICKS;
  s.arenaR = ARENA_R;
  s.players = s.champs.map((c, i) => createPlayer(i, c, s.champs.length));
  s.projectiles = [];
  s.meteors = [];
  s.zones = [];
  s.orb = { active: false, hp: ORB_HP, timer: ORB_SPAWN_AT };
  s.pickups = [];
  s.pickupT = PICKUP.first;
}

export function step(s: GameState, inputs: Input[]): GameEvent[] {
  const ev: GameEvent[] = [];
  s.frame++;

  switch (s.phase) {
    case 'countdown':
      for (let i = 0; i < s.players.length; i++) {
        const p = s.players[i];
        aimAt(p, inputs[i]);
        p.prevButtons = inputs[i].buttons;
      }
      if (--s.phaseT <= 0) {
        s.phase = 'fight';
        ev.push({ type: 'fight' });
      }
      break;

    case 'fight':
      fight(s, inputs, ev);
      break;

    case 'roundEnd':
      // Let the knocked-out player slide; nothing else moves.
      for (const p of s.players) slide(s, p);
      if (--s.phaseT <= 0) {
        if (Math.max(s.score[0], s.score[1]) >= ROUNDS_TO_WIN) {
          s.phase = 'matchEnd';
          ev.push({ type: 'matchEnd', winner: s.score[0] > s.score[1] ? 0 : 1 });
        } else {
          resetRound(s);
          ev.push({ type: 'roundStart', round: s.round });
        }
      }
      break;

    case 'matchEnd':
      break;
  }
  return ev;
}

function fight(s: GameState, inputs: Input[], ev: GameEvent[]) {
  s.roundFrame++;

  if (s.roundFrame === SUDDEN_DEATH_AT && !s.training) ev.push({ type: 'suddenDeath' });
  if (s.roundFrame > SUDDEN_DEATH_AT && s.arenaR > ARENA_MIN_R && !s.training) {
    s.arenaR = Math.max(ARENA_MIN_R, s.arenaR - ARENA_SHRINK);
  }

  const orb = s.orb;
  if (!orb.active && --orb.timer <= 0) {
    orb.active = true;
    orb.hp = ORB_HP;
    ev.push({ type: 'orbSpawn' });
  }

  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    // Knocked out in 2v2: lies there while the ally fights on.
    if (p.out) slide(s, p);
    else updatePlayer(s, p, inputs[i], ev);
  }
  separatePlayers(s);
  updateProjectiles(s, ev);
  updateMeteors(s, ev);
  updateZones(s, ev);
  if (!s.training) updatePickups(s, ev);

  if (s.training) for (const p of s.players) restTraining(p);

  for (const p of s.players) {
    if (p.hp > 0 || p.out) continue;
    p.out = true;
    p.cast = null;
    p.dashT = 0;
    ev.push({ type: 'ko', player: p.id, x: p.x, y: p.y });
  }
  // The round ends when a whole team is down (both at once is a draw).
  const standing = [0, 1].map((team) => s.players.some((p) => p.team === team && !p.out));
  if (!standing[0] || !standing[1]) {
    const winner = standing[0] ? 0 : standing[1] ? 1 : -1;
    if (winner >= 0) s.score[winner]++;
    s.lastRoundWinner = winner;
    s.projectiles = [];
    s.meteors = [];
    s.zones = [];
    s.phase = 'roundEnd';
    s.phaseT = ROUND_END_TICKS;
    ev.push({ type: 'roundEnd', winner });
  }
}

// ---------------------------------------------------------------------------
// Players

/** Everyone on the other team still in the round. */
export function enemiesOf(s: GameState, p: Player): Player[] {
  return s.players.filter((q) => q.team !== p.team && !q.out);
}

/** Knockback drift only (between rounds, or while knocked out). */
function slide(s: GameState, p: Player) {
  p.x += p.vx;
  p.y += p.vy;
  p.vx *= KB_DECAY;
  p.vy *= KB_DECAY;
  collideWorld(s, p);
}

/** In training nobody dies; left alone for a while, a player heals back up. */
function restTraining(p: Player) {
  if (p.hp < 1) p.hp = 1;
  if (++p.restT >= DUMMY.rest) p.hp = maxHp(p);
}

function aimAt(p: Player, inp: Input) {
  const dx = inp.ax - p.x;
  const dy = inp.ay - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    p.fx = dx / d;
    p.fy = dy / d;
  }
}

/**
 * Where Rewind takes the time kobold now. Once the trail spans RECALL.ticks, that moment
 * lies between the two oldest samples, so blend them (the spot then glides instead of
 * jumping a sample at a time). Null with no trail yet.
 */
export function rewindPoint(s: GameState, p: Player): { x: number; y: number; hp: number } | null {
  const t = p.trail;
  if (t.length < 3) return null;
  const full = t.length >= 3 * (RECALL.ticks / RECALL.every + 1);
  const k = full ? (s.roundFrame % RECALL.every) / RECALL.every : 0;
  return { x: t[0] + (t[3] - t[0]) * k, y: t[1] + (t[4] - t[1]) * k, hp: t[2] + (t[5] - t[2]) * k };
}

/** Mid-leap or mid-hop: in the air, flies over pillars. */
export function airborne(p: Player): boolean {
  return p.dashT > 0 && (p.dashKind === 1 || p.dashKind === 6 || p.dashKind === 7);
}

/** Leaping, executing or under the water: nothing can hit them and they pass through the enemy. */
export function untargetable(p: Player): boolean {
  return p.submergeT > 0 || (p.dashT > 0 && (p.dashKind === 1 || p.dashKind === 2 || p.dashKind === 5 || p.dashKind === 6 || p.dashKind === 7));
}

/** Leaping, executing, sweeping or submerged: moves through the enemy instead of bumping it. */
function passesThrough(p: Player): boolean {
  return p.submergeT > 0 || (p.dashT > 0 && p.dashKind >= 1);
}

function updatePlayer(s: GameState, p: Player, inp: Input, ev: GameEvent[]) {
  for (let k = 0; k < p.cooldowns.length; k++) if (p.cooldowns[k] > 0) p.cooldowns[k]--;
  if (p.slowT > 0 && --p.slowT === 0) p.slowMul = 1;
  if (p.hasteT > 0) p.hasteT--;
  if (p.counterT > 0) p.counterT--;
  if (p.hitT > 0) p.hitT--;
  if (p.pickT > 0) p.pickT--;
  if (p.markT > 0) p.markT--;
  if (p.venomT > 0 && --p.venomT === 0) p.venom = 0;
  if (p.ambushT > 0) p.ambushT--;
  if (p.rootT > 0) p.rootT--;
  if (p.revealT > 0) p.revealT--;
  if (p.quickT > 0) p.quickT--;
  if (p.stunT > 0) p.stunT--;
  if (p.deflectT > 0) p.deflectT--;
  if (p.stackT > 0 && --p.stackT === 0) p.stacks = 0;
  if (p.soulT > 0 && --p.soulT === 0) soulReturn(s, p, ev);
  if (p.drainT > 0) drainPulse(s, p, ev);
  if (p.resoT > 0 && --p.resoT === 0) p.resoN = 0;
  if (p.charges < FLICKER.charges && --p.chargeT <= 0) {
    p.charges++;
    if (p.charges < FLICKER.charges) p.chargeT = FLICKER.recharge;
  }
  // The time kobold remembers where it was, for Rewind.
  if (p.champ === CHAMP.CHRONO && s.roundFrame % RECALL.every === 0) {
    p.trail.push(p.x, p.y, p.hp);
    if (p.trail.length > 3 * (RECALL.ticks / RECALL.every + 1)) p.trail.splice(0, 3);
  }
  if (p.stealthT > 0 && --p.stealthT === 0) ev.push({ type: 'reveal', player: p.id, x: p.x, y: p.y });
  if (p.poisonT > 0) {
    p.poisonT--;
    if (p.poisonT % POISON.every === 0 && p.hp > 0) {
      // Damage over time ignores counters and doesn't pop marks.
      p.hp = Math.max(0, p.hp - POISON.dmg);
      p.restT = 0;
      ev.push({ type: 'hit', target: p.id, source: p.poisonBy, dmg: POISON.dmg, x: p.x, y: p.y, kind: 'poison' });
    }
  }

  if (p.bleedT > 0) {
    p.bleedT--;
    if (p.bleedT % BLEED.every === 0 && p.hp > 0) {
      p.hp = Math.max(0, p.hp - BLEED.dmg);
      p.restT = 0;
      ev.push({ type: 'hit', target: p.id, source: p.bleedBy, dmg: BLEED.dmg, x: p.x, y: p.y, kind: 'bleed' });
      heal(s.players[p.bleedBy], BLEED.dmg, ev);
    }
  }

  aimAt(p, inp);
  // Out of breath: leap out of the water toward the cursor.
  if (p.submergeT > 0 && --p.submergeT === 0) emerge(p, inp, ev);

  const pressed = inp.buttons & ~p.prevButtons;
  p.prevButtons = inp.buttons;
  // Stunned: inputs are dropped, not buffered for later.
  const stunned = p.stunT > 0;
  for (let k = 1; k < SLOT_BUTTONS.length; k++) {
    if (pressed & SLOT_BUTTONS[k] && !stunned) {
      p.buffer = k;
      p.bufferT = BUFFER_TICKS;
    }
  }

  if (p.bufferT > 0 && !stunned) {
    if (tryStart(s, p, p.buffer, inp, ev)) {
      p.buffer = -1;
      p.bufferT = 0;
    } else if (--p.bufferT === 0) {
      p.buffer = -1;
    }
  }
  // The basic attack auto-repeats while held.
  if (inp.buttons & BTN.M1 && p.bufferT === 0 && !stunned) tryStart(s, p, SLOT.M1, inp, ev);

  if (p.cast) {
    const slot = p.cast.ability;
    const def = abilityOf(p, slot);
    p.cast.t--;
    // A longshot fires when the button is let go (after a minimal draw) or at full draw.
    const drawn = def.cast - p.cast.t;
    // Longshot and Tides of Blood go off when the button is let go (after a minimal draw) or at full draw.
    const minDraw = def.id === 'longshot' ? LONGSHOT.minDraw : def.id === 'tides' ? TIDES.minDraw : -1;
    const letGo = minDraw >= 0 && !(inp.buttons & SLOT_BUTTONS[slot]) && drawn >= minDraw;
    if (p.cast.t <= 0 || letGo) {
      p.cast = null;
      release(s, p, slot, inp, ev, drawn / def.cast);
    }
  }

  if (p.whirlT > 0) {
    p.whirlT--;
    if (p.whirlT % WHIRL.every === 0) whirlPulse(s, p, ev);
  }

  if (p.dashT > 0) {
    p.dashT--;
    p.x += p.dashX;
    p.y += p.dashY;
    if (p.dashT === 0 && (p.dashKind === 1 || p.dashKind === 6 || p.dashKind === 7)) {
      collideWorld(s, p);
      if (p.dashKind === 1) land(s, p, ev);
      if (p.dashKind === 6) {
        // Lily Leap: dives under where it lands, unseen until it attacks or the dive runs out.
        p.stealthT = LILY.dive;
        ev.push({ type: 'stealth', player: p.id, x: p.x, y: p.y });
      }
      if (p.dashKind === 7) surface(s, p, ev);
    }
    if (p.dashKind === 2 && !p.dashHit) executeContact(s, p, ev);
    if (p.dashKind === 3 && !p.dashHit) bladeContact(s, p, ev);
    if (p.dashKind === 4) stepContact(s, p, ev);
    if (p.dashKind === 5) swarmContact(s, p, ev);
  } else {
    const held = p.rootT > 0 || stunned || p.submergeT > 0;
    const mx = held ? 0 : Math.sign(inp.mx);
    const my = held ? 0 : Math.sign(inp.my);
    let speed = CHAMPIONS[p.champ].speed;
    if (p.slowT > 0) speed *= p.slowMul;
    if (p.hasteT > 0) speed *= HASTE_MUL;
    if (p.cast) speed *= abilityOf(p, p.cast.ability).castSlow;
    if (p.counterT > 0) speed *= COUNTER.slow;
    if (p.whirlT > 0) speed *= WHIRL.speed;
    if (p.stealthT > 0) speed *= SMOKE.speed;
    if (p.drainT > 0) speed *= DRAIN.speed;
    if (mx !== 0 && my !== 0) speed *= Math.SQRT1_2;
    p.x += mx * speed;
    p.y += my * speed;
  }
  p.x += p.vx;
  p.y += p.vy;
  p.vx *= KB_DECAY;
  p.vy *= KB_DECAY;
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vy) < 0.01) p.vy = 0;

  // Pillars don't stop a leap mid-air.
  if (!airborne(p)) collideWorld(s, p);
  else clampToArena(s, p);
}

function tryStart(s: GameState, p: Player, slot: number, inp: Input, ev: GameEvent[]): boolean {
  const def = abilityOf(p, slot);
  // Soul Unbound recast: snap back early (works on cooldown, which started on the way out).
  if (def.id === 'soul' && p.soulT > 0) {
    soulReturn(s, p, ev);
    return true;
  }
  // Under the water: pressing Submerge again leaps out; nothing else works down there.
  if (p.submergeT > 0) {
    if (def.id !== 'submerge') return false;
    p.submergeT = 0;
    emerge(p, inp, ev);
    return true;
  }
  if (p.cooldowns[slot] > 0 || p.energy < def.energyCost) return false;
  // Rooted: no dashes, leaps or teleports.
  const mobility = def.id === 'dash' || def.id === 'leap' || def.id === 'blink' || def.id === 'vault' || def.id === 'execute' || def.id === 'blade' || def.id === 'soul' || def.id === 'fate' || def.id === 'step' || def.id === 'swarm' || def.id === 'flicker' || def.id === 'recall' || def.id === 'lily' || def.id === 'submerge';
  if (p.rootT > 0 && mobility) return false;

  // Submerge: under the water at once, cancelling any cast.
  if (def.id === 'submerge') {
    if (p.dashT > 0) return false;
    p.cast = null;
    p.counterT = 0;
    p.vx = 0;
    p.vy = 0;
    p.submergeT = SUBMERGE.ticks;
    p.cooldowns[slot] = def.cooldown;
    ev.push({ type: 'submerge', player: p.id, x: p.x, y: p.y });
    return true;
  }

  // Time Skip: instant short blink along the movement (the aim when standing), on charges. Works mid-cast.
  if (def.id === 'flicker') {
    if (p.charges <= 0 || p.dashT > 0) return false;
    let dx = Math.sign(inp.mx);
    let dy = Math.sign(inp.my);
    if (dx === 0 && dy === 0) {
      dx = p.fx;
      dy = p.fy;
    } else if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    const x0 = p.x;
    const y0 = p.y;
    p.cast = null;
    p.x += dx * FLICKER.range;
    p.y += dy * FLICKER.range;
    collideWorld(s, p);
    if (p.charges === FLICKER.charges) p.chargeT = FLICKER.recharge;
    p.charges--;
    p.cooldowns[slot] = def.cooldown;
    ev.push({ type: 'flicker', player: p.id, x0, y0, x: p.x, y: p.y });
    return true;
  }

  // Rewind: back to where it was RECALL.ticks ago, getting part of the HP lost since then.
  if (def.id === 'recall') {
    const back = rewindPoint(s, p);
    if (p.dashT > 0 || !back) return false;
    const { x, y, hp } = back;
    const x0 = p.x;
    const y0 = p.y;
    p.cast = null;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    collideWorld(s, p);
    p.trail = [];
    p.cooldowns[slot] = def.cooldown;
    ev.push({ type: 'recall', player: p.id, x0, y0, x: p.x, y: p.y });
    if (hp > p.hp) heal(p, Math.round((hp - p.hp) * RECALL.heal), ev);
    return true;
  }

  // Night Swarm: like a leap toward the cursor, but on the ground (pillars still stop it).
  if (def.id === 'swarm') {
    if (p.dashT > 0) return false;
    let tx = inp.ax - p.x;
    let ty = inp.ay - p.y;
    const d = Math.sqrt(tx * tx + ty * ty);
    if (d > SWARM.range) {
      tx = (tx / d) * SWARM.range;
      ty = (ty / d) * SWARM.range;
    }
    p.cast = null;
    p.counterT = 0;
    p.drainT = 0;
    p.cooldowns[slot] = def.cooldown;
    p.energy -= def.energyCost;
    p.dashKind = 5;
    p.dashHit = 0;
    p.dashT = SWARM.ticks;
    p.dashX = tx / SWARM.ticks;
    p.dashY = ty / SWARM.ticks;
    if (p.stealthT > 0) p.stealthT = 0;
    ev.push({ type: 'swarm', player: p.id, x: p.x, y: p.y });
    return true;
  }

  // Blink: instant teleport, also usable mid-cast (cancels it).
  if (def.id === 'blink') {
    if (p.dashT > 0) return false;
    let tx = inp.ax - p.x;
    let ty = inp.ay - p.y;
    const d = Math.sqrt(tx * tx + ty * ty);
    if (d > BLINK.range) {
      tx = (tx / d) * BLINK.range;
      ty = (ty / d) * BLINK.range;
    }
    const x0 = p.x;
    const y0 = p.y;
    p.cast = null;
    p.x += tx;
    p.y += ty;
    collideWorld(s, p);
    p.cooldowns[slot] = def.cooldown;
    ev.push({ type: 'blink', player: p.id, x0, y0, x: p.x, y: p.y });
    return true;
  }

  // Mobility works mid-cast and cancels the cast.
  if (def.id === 'dash' || def.id === 'leap' || def.id === 'lily' || def.id === 'vault' || def.id === 'blade' || def.id === 'soul' || def.id === 'step') {
    if (p.dashT > 0) return false;
    p.cast = null;
    p.counterT = 0;
    p.whirlT = 0;
    p.cooldowns[slot] = def.cooldown;
    if (def.id === 'dash') {
      p.dashKind = 0;
      p.dashT = DASH.ticks;
      p.dashX = p.fx * DASH.speed;
      p.dashY = p.fy * DASH.speed;
      ev.push({ type: 'dash', player: p.id, x: p.x, y: p.y });
    } else if (def.id === 'blade') {
      p.dashKind = 3;
      p.dashHit = 0;
      p.dashT = BLADE.ticks;
      p.dashX = p.fx * BLADE.speed;
      p.dashY = p.fy * BLADE.speed;
      ev.push({ type: 'dash', player: p.id, x: p.x, y: p.y });
    } else if (def.id === 'step') {
      p.dashKind = 4;
      p.dashHit = 0;
      p.dashT = STEP.ticks;
      p.dashX = p.fx * STEP.speed;
      p.dashY = p.fy * STEP.speed;
      ev.push({ type: 'dash', player: p.id, x: p.x, y: p.y });
    } else if (def.id === 'soul') {
      p.soulX = p.x;
      p.soulY = p.y;
      p.soulT = SOUL.ticks;
      p.soulDmg = 0;
      p.dashKind = 0;
      p.dashT = SOUL.dashTicks;
      p.dashX = p.fx * SOUL.speed;
      p.dashY = p.fy * SOUL.speed;
      ev.push({ type: 'soul', player: p.id, x: p.x, y: p.y });
    } else if (def.id === 'vault') {
      p.dashKind = 0;
      p.dashT = VAULT.ticks;
      p.dashX = -p.fx * VAULT.speed;
      p.dashY = -p.fy * VAULT.speed;
      p.quickT = VAULT.quick;
      for (const foe of enemiesOf(s, p)) {
        const dx = foe.x - p.x;
        const dy = foe.y - p.y;
        const reach = VAULT.r + PLAYER_R;
        if (dx * dx + dy * dy < reach * reach && !untargetable(foe) && foe.hp > 0) {
          foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, VAULT.slowMul) : VAULT.slowMul;
          foe.slowT = Math.max(foe.slowT, VAULT.slowT);
        }
      }
      ev.push({ type: 'vault', player: p.id, x: p.x, y: p.y });
    } else {
      // Leap (warrior) or Lily Leap (frog): toward the cursor, through the air.
      const lily = def.id === 'lily';
      const range = lily ? LILY.range : LEAP.range;
      const ticks = lily ? LILY.ticks : LEAP.ticks;
      let tx = inp.ax - p.x;
      let ty = inp.ay - p.y;
      const d = Math.sqrt(tx * tx + ty * ty);
      if (d > range) {
        tx = (tx / d) * range;
        ty = (ty / d) * range;
      }
      p.dashKind = lily ? 6 : 1;
      p.dashT = ticks;
      p.dashX = tx / ticks;
      p.dashY = ty / ticks;
      ev.push({ type: 'leap', player: p.id, x: p.x, y: p.y });
    }
    return true;
  }

  // Deflecting holds the sword up, a drain keeps you busy: no attacks (mobility above still works).
  if (p.cast || p.dashT > 0 || p.counterT > 0 || p.whirlT > 0 || p.deflectT > 0 || p.drainT > 0) return false;

  if (def.id === 'drain') {
    // The nearest enemy in reach; nothing in reach, nothing spent.
    let best: Player | null = null;
    let bestD = DRAIN.range * DRAIN.range;
    for (const foe of enemiesOf(s, p)) {
      const dx = foe.x - p.x;
      const dy = foe.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD && foe.hp > 0 && !untargetable(foe) && lineClear(p.x, p.y, foe.x, foe.y, solidsOf(s))) {
        best = foe;
        bestD = d2;
      }
    }
    if (!best) return false;
    p.drainT = DRAIN.ticks;
    p.drainTarget = best.id;
    p.cooldowns[slot] = def.cooldown;
    return true;
  }

  if (def.id === 'counter') {
    p.counterT = COUNTER.ticks;
    p.cooldowns[slot] = def.cooldown;
    ev.push({ type: 'counter', player: p.id });
    return true;
  }
  if (def.id === 'deflect') {
    p.deflectT = DEFLECT.ticks;
    p.cooldowns[slot] = def.cooldown;
    return true;
  }
  if (def.id === 'whirl') {
    p.whirlT = WHIRL.ticks;
    p.cooldowns[slot] = def.cooldown;
    return true;
  }
  // After a vault the next arrow skips its windup.
  if (def.id === 'arrow' && p.quickT > 0) {
    release(s, p, slot, inp, ev);
    return true;
  }
  if (def.id === 'poison') {
    p.venom = VENOM.charges;
    p.venomT = VENOM.ticks;
    p.cooldowns[slot] = def.cooldown;
    ev.push({ type: 'venom', player: p.id, x: p.x, y: p.y });
    return true;
  }
  if (def.id === 'smoke') {
    p.stealthT = SMOKE.ticks;
    p.cooldowns[slot] = def.cooldown;
    ev.push({ type: 'stealth', player: p.id, x: p.x, y: p.y });
    return true;
  }

  p.cast = { ability: slot, t: def.cast };
  ev.push({ type: 'cast', player: p.id, ability: def.id });
  return true;
}

/** `draw` is how much of the windup ran (0..1); only a longshot cares. */
function release(s: GameState, p: Player, slot: number, inp: Input, ev: GameEvent[], draw = 1) {
  const def = abilityOf(p, slot);
  p.cooldowns[slot] = def.cooldown;
  p.energy -= def.energyCost;
  const foes = enemiesOf(s, p);
  // Attacking out of stealth reveals you; out of Shade's Veil the hit it lands is an ambush.
  if (p.stealthT > 0) {
    p.stealthT = 0;
    if (p.champ === CHAMP.ASSASSIN) p.ambushT = SMOKE.window;
    ev.push({ type: 'reveal', player: p.id, x: p.x, y: p.y });
  }

  switch (def.id) {
    case 'meteor': {
      let tx = inp.ax - p.x;
      let ty = inp.ay - p.y;
      const d = Math.sqrt(tx * tx + ty * ty);
      if (d > METEOR.range) {
        tx = (tx / d) * METEOR.range;
        ty = (ty / d) * METEOR.range;
      }
      s.meteors.push({ id: s.nextId++, owner: p.id, x: p.x + tx, y: p.y + ty, t: METEOR.delay });
      ev.push({ type: 'release', player: p.id, ability: def.id, x: p.x, y: p.y });
      return;
    }

    case 'rain': {
      let tx = inp.ax - p.x;
      let ty = inp.ay - p.y;
      const d = Math.sqrt(tx * tx + ty * ty);
      if (d > RAIN.range) {
        tx = (tx / d) * RAIN.range;
        ty = (ty / d) * RAIN.range;
      }
      s.zones.push({ id: s.nextId++, owner: p.id, kind: 'rain', x: p.x + tx, y: p.y + ty, t: RAIN.delay + RAIN.ticks, target: -1 });
      ev.push({ type: 'release', player: p.id, ability: def.id, x: p.x, y: p.y });
      return;
    }

    case 'marsh': {
      let tx = inp.ax - p.x;
      let ty = inp.ay - p.y;
      const d = Math.sqrt(tx * tx + ty * ty);
      if (d > MARSH.range) {
        tx = (tx / d) * MARSH.range;
        ty = (ty / d) * MARSH.range;
      }
      s.zones.push({ id: s.nextId++, owner: p.id, kind: 'marsh', x: p.x + tx, y: p.y + ty, t: MARSH.ticks, target: -1 });
      ev.push({ type: 'release', player: p.id, ability: def.id, x: p.x, y: p.y });
      return;
    }

    case 'jab': {
      // Right after a Tongue Snap hit, the jab strikes harder.
      const dmg = JAB.dmg + (p.quickT > 0 ? JAB.bonus : 0);
      p.quickT = 0;
      ev.push({ type: 'thrust', player: p.id, x: p.x, y: p.y, fx: p.fx, fy: p.fy });
      const x0 = p.x + p.fx * PLAYER_R;
      const y0 = p.y + p.fy * PLAYER_R;
      const x1 = x0 + p.fx * JAB.len;
      const y1 = y0 + p.fy * JAB.len;
      const reach = JAB.half + PLAYER_R;
      for (const foe of foes) {
        if (segDist2(foe.x, foe.y, x0, y0, x1, y1) <= reach * reach) hit(p, foe, dmg, JAB.energy, 'jab', foe.x, foe.y, ev);
      }
      if (s.orb.active && segDist2(0, 0, x0, y0, x1, y1) <= (JAB.half + ORB_R) * (JAB.half + ORB_R)) damageOrb(s, p.id, dmg, 0, 0, ev);
      return;
    }

    case 'converge': {
      let tx = inp.ax - p.x;
      let ty = inp.ay - p.y;
      const d = Math.sqrt(tx * tx + ty * ty);
      if (d > CONVERGE.range) {
        tx = (tx / d) * CONVERGE.range;
        ty = (ty / d) * CONVERGE.range;
      }
      s.zones.push({ id: s.nextId++, owner: p.id, kind: 'converge', x: p.x + tx, y: p.y + ty, t: CONVERGE.delay, target: -1 });
      ev.push({ type: 'release', player: p.id, ability: def.id, x: p.x, y: p.y });
      return;
    }

    case 'clock': {
      // Lobbed to the cursor (clamped to its range), landing exactly there.
      const pd = PROJ.clock;
      const tx = inp.ax - p.x;
      const ty = inp.ay - p.y;
      const d = Math.sqrt(tx * tx + ty * ty);
      const nx = d > 1 ? tx / d : p.fx;
      const ny = d > 1 ? ty / d : p.fy;
      const len = Math.max(CLOCK.minHop, Math.min(pd.range, d));
      const life = Math.max(1, Math.round(len / pd.speed));
      s.projectiles.push({ id: s.nextId++, owner: p.id, kind: 'clock', x: p.x, y: p.y, vx: (nx * len) / life, vy: (ny * len) / life, r: pd.r, life, age: 0, dmg: pd.dmg, kb: 0, bounces: CLOCK.bounces });
      ev.push({ type: 'release', player: p.id, ability: def.id, x: p.x, y: p.y });
      return;
    }

    case 'chrono': {
      ev.push({ type: 'swing', player: p.id, x: p.x, y: p.y, fx: p.fx, fy: p.fy, reach: CHRONO.reach });
      for (const foe of foes) {
        if (inCone(p, foe.x, foe.y, 2 * PLAYER_R + CHRONO.reach, CHRONO.minDot) && hit(p, foe, CHRONO.dmg, CHRONO.energy, 'chrono', (p.x + foe.x) / 2, (p.y + foe.y) / 2, ev)) resonate(p, foe, ev);
      }
      if (s.orb.active && inCone(p, 0, 0, PLAYER_R + ORB_R + CHRONO.reach, CHRONO.minDot)) damageOrb(s, p.id, CHRONO.dmg, 0, 0, ev);
      return;
    }

    case 'tides': {
      p.hp = Math.max(1, p.hp - TIDES.cost);
      ev.push({ type: 'tides', player: p.id, x: p.x, y: p.y, power: draw });
      const dmg = Math.round(TIDES.dmg + TIDES.bonus * draw);
      for (const foe of areaHit(s, p, p.x, p.y, TIDES.r, dmg, 10, 0, 'tides', ev)) {
        foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, TIDES.slowMul) : TIDES.slowMul;
        foe.slowT = Math.max(foe.slowT, TIDES.slowT);
      }
      return;
    }

    case 'slash': {
      ev.push({ type: 'swing', player: p.id, x: p.x, y: p.y, fx: p.fx, fy: p.fy, reach: SLASH.reach });
      const reach = 2 * PLAYER_R + SLASH.reach;
      for (const foe of foes) {
        if (inCone(p, foe.x, foe.y, reach, SLASH.minDot)) hit(p, foe, SLASH.dmg, SLASH.energy, 'slash', (p.x + foe.x) / 2, (p.y + foe.y) / 2, ev);
      }
      if (s.orb.active && inCone(p, 0, 0, PLAYER_R + ORB_R + SLASH.reach, SLASH.minDot)) damageOrb(s, p.id, SLASH.dmg, 0, 0, ev);
      return;
    }

    case 'dagger': {
      ev.push({ type: 'swing', player: p.id, x: p.x, y: p.y, fx: p.fx, fy: p.fy, reach: STAB.reach });
      const reach = 2 * PLAYER_R + STAB.reach;
      let landed = false;
      for (const foe of foes) {
        if (!inCone(p, foe.x, foe.y, reach, STAB.minDot) || !hit(p, foe, STAB.dmg, STAB.energy, 'stab', (p.x + foe.x) / 2, (p.y + foe.y) / 2, ev)) continue;
        landed = true;
        // Coated knives poison whoever they cut.
        if (p.venom > 0) {
          foe.poisonT = POISON.ticks;
          foe.poisonBy = p.id;
        }
      }
      if (landed && p.venom > 0 && --p.venom === 0) p.venomT = 0;
      if (s.orb.active && inCone(p, 0, 0, PLAYER_R + ORB_R + STAB.reach, STAB.minDot)) damageOrb(s, p.id, STAB.dmg, 0, 0, ev);
      return;
    }

    case 'katana': {
      ev.push({ type: 'swing', player: p.id, x: p.x, y: p.y, fx: p.fx, fy: p.fy, reach: KATANA.reach });
      for (const foe of foes) {
        if (inCone(p, foe.x, foe.y, 2 * PLAYER_R + KATANA.reach, KATANA.minDot)) hit(p, foe, KATANA.dmg, KATANA.energy, 'katana', (p.x + foe.x) / 2, (p.y + foe.y) / 2, ev);
      }
      if (s.orb.active && inCone(p, 0, 0, PLAYER_R + ORB_R + KATANA.reach, KATANA.minDot)) damageOrb(s, p.id, KATANA.dmg, 0, 0, ev);
      return;
    }

    case 'tempest': {
      // Full stacks: the thrust becomes a gale that flies and stuns.
      if (p.stacks >= TEMPEST.max) {
        p.stacks = 0;
        p.stackT = 0;
        fireProjectile(s, p, 'crescent', 1, ev, def.id);
        return;
      }
      ev.push({ type: 'thrust', player: p.id, x: p.x, y: p.y, fx: p.fx, fy: p.fy });
      const x0 = p.x + p.fx * PLAYER_R;
      const y0 = p.y + p.fy * PLAYER_R;
      const x1 = x0 + p.fx * TEMPEST.len;
      const y1 = y0 + p.fy * TEMPEST.len;
      const reach = TEMPEST.half + PLAYER_R;
      let landed = false;
      for (const foe of foes) {
        if (segDist2(foe.x, foe.y, x0, y0, x1, y1) <= reach * reach && hit(p, foe, TEMPEST.dmg, TEMPEST.energy, 'tempest', foe.x, foe.y, ev)) landed = true;
      }
      // One stack per thrust, however many it hit.
      if (landed) {
        p.stacks = Math.min(TEMPEST.max, p.stacks + 1);
        p.stackT = TEMPEST.window;
      }
      if (s.orb.active && segDist2(0, 0, x0, y0, x1, y1) <= (TEMPEST.half + ORB_R) * (TEMPEST.half + ORB_R)) damageOrb(s, p.id, TEMPEST.dmg, 0, 0, ev);
      return;
    }

    case 'fate': {
      const x0 = p.x;
      const y0 = p.y;
      const x1 = x0 + p.fx * FATE.range;
      const y1 = y0 + p.fy * FATE.range;
      const reach = FATE.half + PLAYER_R;
      const caught = foes.filter((foe) => segDist2(foe.x, foe.y, x0, y0, x1, y1) <= reach * reach && hit(p, foe, FATE.dmg, 0, 'fate', foe.x, foe.y, ev));
      if (s.orb.active && segDist2(0, 0, x0, y0, x1, y1) <= (FATE.half + ORB_R) * (FATE.half + ORB_R)) damageOrb(s, p.id, FATE.dmg, 0, 0, ev);
      p.x = x1;
      p.y = y1;
      collideWorld(s, p);
      caught.forEach((foe, k) => {
        // Dragged along to the end of the line, right in front of the samurai (side by side if two).
        const side = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2 * PLAYER_R;
        foe.x = p.x + p.fx * (2 * PLAYER_R + 2) - p.fy * side;
        foe.y = p.y + p.fy * (2 * PLAYER_R + 2) + p.fx * side;
        foe.vx = 0;
        foe.vy = 0;
        collideWorld(s, foe);
        stun(foe, FATE.stun, ev);
      });
      ev.push({ type: 'fate', player: p.id, x0, y0, x: p.x, y: p.y });
      return;
    }

    case 'execute': {
      p.dashKind = 2;
      p.dashHit = 0;
      p.dashT = EXECUTE.ticks;
      p.dashX = (p.fx * EXECUTE.range) / EXECUTE.ticks;
      p.dashY = (p.fy * EXECUTE.range) / EXECUTE.ticks;
      ev.push({ type: 'dash', player: p.id, x: p.x, y: p.y });
      return;
    }

    case 'cry': {
      ev.push({ type: 'nova', player: p.id, x: p.x, y: p.y });
      for (const foe of areaHit(s, p, p.x, p.y, CRY.r, CRY.dmg, CRY.energy, 0, 'cry', ev)) {
        // An impulse that, decaying, carries the enemy to just in front of the warrior.
        const dx = p.x - foe.x;
        const dy = p.y - foe.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0.0001) knockback(foe, dx / d, dy / d, Math.max(0, d - CRY.stop) * (1 - KB_DECAY));
        else knockback(foe, p.fx, p.fy, 0);
      }
      return;
    }

    case 'rift': {
      ev.push({ type: 'rift', player: p.id, x: p.x, y: p.y, fx: p.fx, fy: p.fy });
      const x0 = p.x + p.fx * PLAYER_R;
      const y0 = p.y + p.fy * PLAYER_R;
      const x1 = x0 + p.fx * RIFT.len;
      const y1 = y0 + p.fy * RIFT.len;
      for (const foe of foes) {
        if (segDist2(foe.x, foe.y, x0, y0, x1, y1) <= (RIFT.half + PLAYER_R) * (RIFT.half + PLAYER_R) && hit(p, foe, RIFT.dmg, 0, 'rift', foe.x, foe.y, ev)) {
          knockback(foe, p.fx, p.fy, RIFT.kb);
        }
      }
      if (s.orb.active && segDist2(0, 0, x0, y0, x1, y1) <= (RIFT.half + ORB_R) * (RIFT.half + ORB_R)) damageOrb(s, p.id, RIFT.dmg, 0, 0, ev);
      return;
    }

    default:
      fireProjectile(s, p, def.id as ProjKind, draw, ev, def.id);
  }
}

/** Launch a projectile along the aim; `draw` only matters for a longshot. */
function fireProjectile(s: GameState, p: Player, kind: ProjKind, draw: number, ev: GameEvent[], ability: AbilityId) {
  const pd = PROJ[kind];
  let speed = pd.speed;
  let range = pd.range;
  let dmg = pd.dmg;
  let kb = pd.kb;
  if (kind === 'longshot') {
    speed += LONGSHOT.speed * draw;
    range += LONGSHOT.range * draw;
    dmg = Math.round(dmg + LONGSHOT.dmg * draw);
    if (draw >= 1) kb = LONGSHOT.kb;
  } else if (kind === 'arrow' && p.quickT > 0) {
    p.quickT = 0;
    dmg += VAULT.bonus;
  } else if (kind === 'transfusion' && ++p.bloodCount % TRANSFUSION.every === 0) {
    dmg = Math.round(dmg * TRANSFUSION.boost);
  }
  const off = PLAYER_R + pd.r * 0.5;
  const x = p.x + p.fx * off;
  const y = p.y + p.fy * off;
  s.projectiles.push({
    id: s.nextId++,
    owner: p.id,
    kind,
    x,
    y,
    vx: p.fx * speed,
    vy: p.fy * speed,
    r: pd.r,
    life: Math.floor(range / speed),
    age: 0,
    dmg,
    kb,
    bounces: 0,
  });
  ev.push({ type: 'release', player: p.id, ability, x, y });
}

/** The first enemy within `reach` of p (in id order), if any. */
function touching(s: GameState, p: Player, reach: number): Player | null {
  for (const foe of enemiesOf(s, p)) {
    const dx = foe.x - p.x;
    const dy = foe.y - p.y;
    if (dx * dx + dy * dy <= reach * reach && foe.hp > 0) return foe;
  }
  return null;
}

/** Execute connects with the first enemy it passes through. */
function executeContact(s: GameState, p: Player, ev: GameEvent[]) {
  const foe = touching(s, p, 2 * PLAYER_R + 8);
  if (!foe) return;
  p.dashHit = 1;
  const lethal = foe.hp <= maxHp(foe) * EXECUTE.threshold;
  ev.push({ type: 'execute', player: p.id, x: foe.x, y: foe.y, lethal });
  hit(p, foe, lethal ? Math.max(EXECUTE.dmg, foe.hp) : EXECUTE.dmg, 0, 'execute', foe.x, foe.y, ev);
}

/** Sweeping Blade cuts the first enemy it passes through. */
function bladeContact(s: GameState, p: Player, ev: GameEvent[]) {
  const foe = touching(s, p, 2 * PLAYER_R + 6);
  if (!foe) return;
  p.dashHit = 1;
  hit(p, foe, BLADE.dmg, BLADE.energy, 'blade', foe.x, foe.y, ev);
}

/** End Soul Unbound: back to where it started, echoing part of the damage dealt as a spirit. */
function soulReturn(s: GameState, p: Player, ev: GameEvent[]) {
  const x0 = p.x;
  const y0 = p.y;
  const echo = Math.round(p.soulDmg * SOUL.echo);
  p.soulT = 0;
  p.soulDmg = 0;
  p.cast = null;
  p.dashT = 0;
  p.x = p.soulX;
  p.y = p.soulY;
  collideWorld(s, p);
  ev.push({ type: 'soulReturn', player: p.id, x0, y0, x: p.x, y: p.y });
  const foe = p.soulTarget >= 0 ? s.players[p.soulTarget] : null;
  if (echo > 0 && foe && !foe.out) hit(p, foe, echo, 0, 'soul', foe.x, foe.y, ev);
}

function whirlPulse(s: GameState, p: Player, ev: GameEvent[]) {
  ev.push({ type: 'whirl', player: p.id, x: p.x, y: p.y });
  areaHit(s, p, p.x, p.y, WHIRL.r, WHIRL.dmg, WHIRL.energy, 0, 'whirl', ev);
}

function land(s: GameState, p: Player, ev: GameEvent[]) {
  ev.push({ type: 'land', player: p.id, x: p.x, y: p.y });
  for (const foe of areaHit(s, p, p.x, p.y, LEAP.r, LEAP.dmg, LEAP.energy, 0, 'leap', ev)) {
    foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, LEAP.slowMul) : LEAP.slowMul;
    foe.slowT = Math.max(foe.slowT, LEAP.slowT);
  }
}

/** Target center within `reach` and in front of the attacker (cos of the half-angle >= minDot). */
function inCone(p: Player, x: number, y: number, reach: number, minDot: number): boolean {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > reach) return false;
  if (d < PLAYER_R) return true;
  return (dx * p.fx + dy * p.fy) / d >= minDot;
}

function segDist2(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + dx * t - px;
  const cy = y0 + dy * t - py;
  return cx * cx + cy * cy;
}

/** Circle around (x, y): hits every enemy inside (pushed outwards by kb) and the orb. Returns the enemies hit. */
function areaHit(s: GameState, p: Player, x: number, y: number, r: number, dmg: number, energy: number, kb: number, kind: HitKind, ev: GameEvent[]): Player[] {
  const landed: Player[] = [];
  for (const foe of enemiesOf(s, p)) {
    let dx = foe.x - x;
    let dy = foe.y - y;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (!(d < r + PLAYER_R && hit(p, foe, dmg, energy, kind, foe.x, foe.y, ev))) continue;
    landed.push(foe);
    if (kb > 0) {
      if (d < 0.0001) {
        dx = p.fx;
        dy = p.fy;
        d = 1;
      }
      knockback(foe, dx / d, dy / d, kb);
    }
  }
  if (s.orb.active && Math.sqrt(x * x + y * y) < r + ORB_R) damageOrb(s, p.id, dmg, 0, 0, ev);
  return landed;
}

function collideWorld(s: GameState, p: Player) {
  // Mid-dash (or mid-leap) you fly over the river; land in it and you're put on the nearest dry spot.
  const river = MAPS[s.map].river;
  if (river && p.dashT === 0) keepOutOfRiver(river, p);
  for (const pl of solidsOf(s)) {
    let dx = p.x - pl.x;
    let dy = p.y - pl.y;
    const min = pl.r + PLAYER_R;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min) {
      let d = Math.sqrt(d2);
      if (d < 0.0001) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      p.x = pl.x + (dx / d) * min;
      p.y = pl.y + (dy / d) * min;
    }
  }
  clampToArena(s, p);
}

/**
 * Push a player standing in the river out by the shortest way: back to its bank, or
 * sideways onto the bridge it is walking off.
 */
function keepOutOfRiver(river: River, p: Player) {
  const bank = river.half + PLAYER_R / 2;
  const ax = Math.abs(p.x);
  if (ax >= bank) return;
  let bestDy = Infinity;
  let toY = p.y;
  for (const b of river.bridges) {
    const dy = Math.abs(p.y - b.y);
    if (dy < b.half) return;
    if (dy - b.half < bestDy) {
      bestDy = dy - b.half;
      toY = b.y + (p.y > b.y ? 1 : -1) * (b.half - 0.01);
    }
  }
  if (bestDy < bank - ax) p.y = toY;
  else p.x = p.x >= 0 ? bank : -bank;
}

function clampToArena(s: GameState, p: Player) {
  const lim = s.arenaR - PLAYER_R;
  const d = Math.sqrt(p.x * p.x + p.y * p.y);
  if (d > lim) {
    p.x *= lim / d;
    p.y *= lim / d;
  }
}

/** Push overlapping champions apart (every pair; the knocked out don't block). */
function separatePlayers(s: GameState) {
  for (let i = 0; i < s.players.length; i++) {
    for (let j = i + 1; j < s.players.length; j++) separatePair(s, s.players[i], s.players[j]);
  }
}

function separatePair(s: GameState, a: Player, b: Player) {
  if (a.out || b.out || passesThrough(a) || passesThrough(b)) return;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const min = PLAYER_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  let d = Math.sqrt(d2);
  if (d < 0.0001) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  const push = (min - d) / 2;
  a.x -= (dx / d) * push;
  a.y -= (dy / d) * push;
  b.x += (dx / d) * push;
  b.y += (dy / d) * push;
  collideWorld(s, a);
  collideWorld(s, b);
}

// ---------------------------------------------------------------------------
// Damage

/** Applies a hit unless the target is untargetable or countering. Returns true if it landed. */
function hit(attacker: Player, target: Player, dmg: number, energy: number, kind: HitKind, x: number, y: number, ev: GameEvent[]): boolean {
  if (target.hp <= 0 || untargetable(target)) return false;
  if (target.counterT > 0) {
    block(target, x, y, ev);
    return false;
  }
  if (attacker.ambushT > 0) {
    attacker.ambushT = 0;
    dmg = Math.round(dmg * SMOKE.ambush);
    ev.push({ type: 'ambush', player: target.id, x: target.x, y: target.y });
  }
  if (target.markT > 0 && kind !== 'mark') {
    target.markT = 0;
    dmg += MARK.bonus;
    ev.push({ type: 'markPop', player: target.id, x: target.x, y: target.y });
  }
  target.hp = Math.max(0, target.hp - dmg);
  target.hitT = 8;
  target.restT = 0;
  // A samurai out of body remembers what it dealt (and to whom), to echo it on the way back.
  if (attacker.soulT > 0 && kind !== 'soul') {
    attacker.soulDmg += dmg;
    attacker.soulTarget = target.id;
  }
  attacker.energy = Math.min(MAX_ENERGY, attacker.energy + energy);
  ev.push({ type: 'hit', target: target.id, source: attacker.id, dmg, x, y, kind });
  return true;
}

function block(target: Player, x: number, y: number, ev: GameEvent[]) {
  target.counterT = 0;
  target.energy = Math.min(MAX_ENERGY, target.energy + COUNTER.energy);
  target.hasteT = COUNTER.haste;
  ev.push({ type: 'block', player: target.id, x, y });
}

/** Heal up to max HP (the knocked out stay down). */
function heal(p: Player, amount: number, ev: GameEvent[]) {
  if (amount <= 0 || p.hp <= 0 || p.out) return;
  const before = p.hp;
  p.hp = Math.min(maxHp(p), p.hp + amount);
  if (p.hp > before) ev.push({ type: 'heal', player: p.id, amount: p.hp - before, x: p.x, y: p.y });
}

/** Crimson Step: everyone passed through starts bleeding (once per dash each). */
function stepContact(s: GameState, p: Player, ev: GameEvent[]) {
  const reach = 2 * PLAYER_R + 6;
  for (const foe of enemiesOf(s, p)) {
    const bit = 1 << foe.id;
    const dx = foe.x - p.x;
    const dy = foe.y - p.y;
    if (p.dashHit & bit || dx * dx + dy * dy > reach * reach || foe.hp <= 0 || untargetable(foe)) continue;
    p.dashHit |= bit;
    foe.bleedT = BLEED.ticks;
    foe.bleedBy = p.id;
    ev.push({ type: 'bleed', player: foe.id, x: foe.x, y: foe.y });
  }
}

/** Exsanguinate: drain the tethered enemy while it stays in reach and no pillar is in the way. */
function drainPulse(s: GameState, p: Player, ev: GameEvent[]) {
  const t = s.players[p.drainTarget];
  const dx = t.x - p.x;
  const dy = t.y - p.y;
  const reach = DRAIN.range * 1.15;
  if (!t || t.out || t.hp <= 0 || untargetable(t) || dx * dx + dy * dy > reach * reach || !lineClear(p.x, p.y, t.x, t.y, solidsOf(s))) {
    p.drainT = 0;
    return;
  }
  if (--p.drainT % DRAIN.every === 0 && hit(p, t, DRAIN.dmg, DRAIN.energy, 'drain', t.x, t.y, ev)) heal(p, DRAIN.heal, ev);
}

/** Tongue Snap landed: the frog is yanked to just short of the target, and its next Jab is empowered. */
function yank(p: Player, target: Player, ev: GameEvent[]) {
  p.quickT = TONGUE.window;
  if (p.out || p.stunT > 0 || p.rootT > 0 || p.dashT > 0 || p.submergeT > 0) return;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const travel = d - TONGUE.gap;
  if (travel <= 0) return;
  p.cast = null;
  p.dashKind = 0;
  p.dashT = TONGUE.ticks;
  p.dashX = (dx / d) * (travel / TONGUE.ticks);
  p.dashY = (dy / d) * (travel / TONGUE.ticks);
  ev.push({ type: 'yank', player: p.id, x0: p.x, y0: p.y, x: p.x + (dx / d) * travel, y: p.y + (dy / d) * travel });
}

/** Out of the water: a short leap toward the cursor (SUBMERGE.range at most), landing in surface(). */
function emerge(p: Player, inp: Input, ev: GameEvent[]) {
  let tx = inp.ax - p.x;
  let ty = inp.ay - p.y;
  const d = Math.sqrt(tx * tx + ty * ty);
  if (d > SUBMERGE.range) {
    tx = (tx / d) * SUBMERGE.range;
    ty = (ty / d) * SUBMERGE.range;
  }
  p.dashKind = 7;
  p.dashT = SUBMERGE.jump;
  p.dashX = tx / SUBMERGE.jump;
  p.dashY = ty / SUBMERGE.jump;
  ev.push({ type: 'leap', player: p.id, x: p.x, y: p.y });
}

function surface(s: GameState, p: Player, ev: GameEvent[]) {
  ev.push({ type: 'surface', player: p.id, x: p.x, y: p.y });
  for (const foe of areaHit(s, p, p.x, p.y, SUBMERGE.r, SUBMERGE.dmg, SUBMERGE.energy, 0, 'submerge', ev)) {
    foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, SUBMERGE.slowMul) : SUBMERGE.slowMul;
    foe.slowT = Math.max(foe.slowT, SUBMERGE.slowT);
  }
}

/** Night Swarm: bite everyone flown through (once per swarm each), slowing them and healing you. */
function swarmContact(s: GameState, p: Player, ev: GameEvent[]) {
  const reach = 2 * PLAYER_R + 10;
  for (const foe of enemiesOf(s, p)) {
    const bit = 1 << foe.id;
    const dx = foe.x - p.x;
    const dy = foe.y - p.y;
    if (p.dashHit & bit || dx * dx + dy * dy > reach * reach || foe.hp <= 0 || untargetable(foe)) continue;
    p.dashHit |= bit;
    if (!hit(p, foe, SWARM.dmg, 0, 'swarm', foe.x, foe.y, ev)) continue;
    heal(p, SWARM.heal, ev);
    foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, SWARM.slowMul) : SWARM.slowMul;
    foe.slowT = Math.max(foe.slowT, SWARM.slowT);
  }
}

/** The time kobold's hits in a row on one enemy; every CHRONO.hits-th resonates. */
function resonate(p: Player, foe: Player, ev: GameEvent[]) {
  if (p.resoTarget !== foe.id || p.resoT === 0) {
    p.resoTarget = foe.id;
    p.resoN = 0;
  }
  p.resoN++;
  p.resoT = CHRONO.window;
  if (p.resoN < CHRONO.hits) return;
  p.resoN = 0;
  p.resoT = 0;
  ev.push({ type: 'resonance', player: foe.id, x: foe.x, y: foe.y });
  if (!hit(p, foe, CHRONO.bonus, 0, 'resonance', foe.x, foe.y, ev)) return;
  foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, CHRONO.slowMul) : CHRONO.slowMul;
  foe.slowT = Math.max(foe.slowT, CHRONO.slowT);
  p.hasteT = Math.max(p.hasteT, CHRONO.haste);
}

function stun(target: Player, ticks: number, ev: GameEvent[]) {
  target.stunT = Math.max(target.stunT, ticks);
  target.cast = null;
  target.whirlT = 0;
  target.counterT = 0;
  target.deflectT = 0;
  target.drainT = 0;
  if (!untargetable(target)) target.dashT = 0;
  target.buffer = -1;
  target.bufferT = 0;
  ev.push({ type: 'stun', player: target.id, x: target.x, y: target.y });
}

function knockback(target: Player, nx: number, ny: number, force: number) {
  target.vx += nx * force;
  target.vy += ny * force;
  target.cast = null;
  target.whirlT = 0;
  target.drainT = 0;
}

function damageOrb(s: GameState, owner: number, dmg: number, x: number, y: number, ev: GameEvent[]) {
  const orb = s.orb;
  if (!orb.active) return;
  orb.hp -= dmg;
  ev.push({ type: 'orbHit', x, y });
  if (orb.hp <= 0) {
    orb.active = false;
    orb.timer = ORB_RESPAWN;
    const p = s.players[owner];
    p.hp = Math.min(maxHp(p), p.hp + ORB_HEAL);
    p.energy = Math.min(MAX_ENERGY, p.energy + ORB_ENERGY);
    ev.push({ type: 'orbBreak', player: owner, x: 0, y: 0 });
  }
}

function hitsPillar(s: GameState, x: number, y: number, r: number): boolean {
  for (const pl of solidsOf(s)) {
    const dx = x - pl.x;
    const dy = y - pl.y;
    const min = pl.r + r;
    if (dx * dx + dy * dy < min * min) return true;
  }
  return false;
}

function updateProjectiles(s: GameState, ev: GameEvent[]) {
  const alive = [];
  for (const pr of s.projectiles) {
    if (pr.kind === 'clock') {
      if (clockTick(s, pr, ev)) alive.push(pr);
      continue;
    }
    pr.x += pr.vx;
    pr.y += pr.vy;
    pr.age++;

    if (pr.age > pr.life) {
      fizzle(s, pr, ev);
      continue;
    }
    const ad = Math.sqrt(pr.x * pr.x + pr.y * pr.y);
    if (ad > s.arenaR - pr.r * 0.5 || hitsPillar(s, pr.x, pr.y, pr.r)) {
      fizzle(s, pr, ev);
      continue;
    }

    // The first enemy it touches; untargetable champions let projectiles fly through.
    const tmin = PLAYER_R + pr.r;
    const target = enemiesOf(s, s.players[pr.owner]).find((t) => {
      const tdx = t.x - pr.x;
      const tdy = t.y - pr.y;
      return !untargetable(t) && tdx * tdx + tdy * tdy < tmin * tmin;
    });
    if (target) {
      // Deflect: coming at her front, it turns around and becomes hers.
      if (target.deflectT > 0 && pr.vx * target.fx + pr.vy * target.fy < DEFLECT.minDot) {
        pr.owner = target.id;
        pr.vx = -pr.vx;
        pr.vy = -pr.vy;
        pr.age = 0;
        target.energy = Math.min(MAX_ENERGY, target.energy + DEFLECT.energy);
        ev.push({ type: 'deflect', player: target.id, x: pr.x, y: pr.y });
        alive.push(pr);
        continue;
      }
      // A Blasting Charge or a lotus bait doesn't hurt on contact: it sticks (a counter knocks it away).
      if (pr.kind === 'pulse' || pr.kind === 'toad') {
        if (target.counterT > 0) block(target, pr.x, pr.y, ev);
        else {
          s.zones.push({ id: s.nextId++, owner: pr.owner, kind: pr.kind, x: target.x, y: target.y, t: pr.kind === 'pulse' ? PULSE.fuse : TOAD.delay, target: target.id });
          ev.push({ type: 'stick', player: target.id, owner: pr.owner, x: target.x, y: target.y });
        }
        continue;
      }
      const pd = PROJ[pr.kind];
      if (hit(s.players[pr.owner], target, pr.dmg, pd.energy, pr.kind, pr.x, pr.y, ev)) {
        if (pr.kb !== 0) {
          const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
          knockback(target, pr.vx / sp, pr.vy / sp, pr.kb);
        }
        if (pd.slowT > 0) {
          target.slowT = pd.slowT;
          target.slowMul = pd.slowMul;
        }
        if (pr.kind === 'mark') target.markT = MARK.ticks;
        if (pr.kind === 'sonic') target.revealT = SONIC.reveal;
        if (pr.kind === 'crescent') stun(target, TEMPEST.stun, ev);
        const shooter = s.players[pr.owner];
        if (pr.kind === 'bloodbolt') heal(shooter, BLOODBOLT.heal, ev);
        if (pr.kind === 'transfusion') heal(shooter, Math.round((TRANSFUSION.heal * pr.dmg) / PROJ.transfusion.dmg), ev);
        if (pr.kind === 'snare') {
          target.rootT = SNARE.root;
          ev.push({ type: 'root', player: target.id, x: target.x, y: target.y });
        }
        if (pr.kind === 'tongue') yank(shooter, target, ev);
      }
      continue;
    }

    if (s.orb.active) {
      const omin = ORB_R + pr.r;
      if (pr.x * pr.x + pr.y * pr.y < omin * omin) {
        damageOrb(s, pr.owner, pr.dmg, pr.x, pr.y, ev);
        fizzle(s, pr, ev, false);
        continue;
      }
    }

    alive.push(pr);
  }
  s.projectiles = alive;
}

/** A projectile that ends without hitting the enemy; a sonic arrow leaves a sensor where it stops. */
function fizzle(s: GameState, pr: Projectile, ev: GameEvent[], impact = true) {
  if (impact) ev.push({ type: 'impact', x: pr.x, y: pr.y, kind: pr.kind, owner: pr.owner });
  // A Transfusion that hits nothing costs its caster blood (one turned around by a deflect doesn't).
  const owner = s.players[pr.owner];
  if (impact && pr.kind === 'transfusion' && owner.champ === CHAMP.BLOOD && owner.hp > 0) {
    const lost = Math.min(TRANSFUSION.missCost, owner.hp - 1);
    owner.hp -= lost;
    if (lost > 0) ev.push({ type: 'bloodloss', player: owner.id, amount: lost, x: owner.x, y: owner.y });
  }
  if (pr.kind === 'sonic') {
    s.zones.push({ id: s.nextId++, owner: pr.owner, kind: 'sonic', x: pr.x, y: pr.y, t: SONIC.ticks, target: -1 });
    ev.push({ type: 'sensor', owner: pr.owner, x: pr.x, y: pr.y });
  }
  // A Blasting Charge or a lotus bait that hit nothing lies where it stopped, still ticking.
  if (pr.kind === 'pulse') s.zones.push({ id: s.nextId++, owner: pr.owner, kind: 'pulse', x: pr.x, y: pr.y, t: PULSE.fuse, target: -1 });
  if (pr.kind === 'toad') s.zones.push({ id: s.nextId++, owner: pr.owner, kind: 'toad', x: pr.x, y: pr.y, t: TOAD.delay, target: -1 });
}

/**
 * Chronobomb: hops over pillars to each landing spot. Lands next to an enemy (or the
 * orb), on a pillar or with no bounces left: bursts. Otherwise it bounces on, shorter.
 */
function clockTick(s: GameState, pr: Projectile, ev: GameEvent[]): boolean {
  pr.x += pr.vx;
  pr.y += pr.vy;
  pr.age++;
  if (Math.sqrt(pr.x * pr.x + pr.y * pr.y) > s.arenaR - pr.r) {
    clockBurst(s, pr, ev);
    return false;
  }
  if (pr.age < pr.life) return true;
  const reach = CLOCK.r + PLAYER_R;
  const foeNear = enemiesOf(s, s.players[pr.owner]).some((foe) => {
    const dx = foe.x - pr.x;
    const dy = foe.y - pr.y;
    return foe.hp > 0 && !untargetable(foe) && dx * dx + dy * dy < reach * reach;
  });
  const orbR = CLOCK.r + ORB_R;
  const orbNear = s.orb.active && pr.x * pr.x + pr.y * pr.y < orbR * orbR;
  if (foeNear || orbNear || pr.bounces === 0 || hitsPillar(s, pr.x, pr.y, pr.r)) {
    clockBurst(s, pr, ev);
    return false;
  }
  pr.bounces--;
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
  pr.life = Math.max(1, Math.round(Math.max(CLOCK.minHop, sp * pr.life * CLOCK.hop) / sp));
  pr.age = 0;
  ev.push({ type: 'bounce', owner: pr.owner, x: pr.x, y: pr.y });
  return true;
}

function clockBurst(s: GameState, pr: Projectile, ev: GameEvent[]) {
  const owner = s.players[pr.owner];
  ev.push({ type: 'clockBurst', owner: pr.owner, x: pr.x, y: pr.y });
  for (const foe of areaHit(s, owner, pr.x, pr.y, CLOCK.r, pr.dmg, PROJ.clock.energy, 0, 'clock', ev)) {
    foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, PROJ.clock.slowMul) : PROJ.clock.slowMul;
    foe.slowT = Math.max(foe.slowT, PROJ.clock.slowT);
    resonate(owner, foe, ev);
  }
}

function updateZones(s: GameState, ev: GameEvent[]) {
  const left = [];
  for (const z of s.zones) {
    z.t--;
    if (z.kind === 'rain' && z.t <= RAIN.ticks) {
      const owner = s.players[z.owner];
      const first = z.t === RAIN.ticks;
      if (first || z.t % RAIN.every === 0) {
        ev.push({ type: 'rain', owner: z.owner, x: z.x, y: z.y, first });
        areaHit(s, owner, z.x, z.y, RAIN.r, first ? RAIN.dmg : RAIN.pulse, 0, 0, 'rain', ev);
      }
      // Standing in the rain slows; the slow lingers a moment after stepping out.
      for (const foe of enemiesOf(s, owner)) {
        const dx = foe.x - z.x;
        const dy = foe.y - z.y;
        const reach = RAIN.r + PLAYER_R;
        if (dx * dx + dy * dy < reach * reach && !untargetable(foe) && foe.hp > 0) {
          foe.slowMul = foe.slowT > 0 ? Math.min(foe.slowMul, RAIN.slow) : RAIN.slow;
          foe.slowT = Math.max(foe.slowT, 10);
        }
      }
    }
    if ((z.kind === 'pulse' || z.kind === 'toad') && z.target >= 0) {
      const t = s.players[z.target];
      if (t.out) z.target = -1;
      else {
        z.x = t.x;
        z.y = t.y;
      }
    }
    if (z.t === 0 && z.kind === 'converge') {
      ev.push({ type: 'converge', owner: z.owner, x: z.x, y: z.y });
      for (const foe of areaHit(s, s.players[z.owner], z.x, z.y, CONVERGE.r, CONVERGE.dmg, 0, 0, 'converge', ev)) stun(foe, CONVERGE.stun, ev);
    }
    if (z.kind === 'marsh') {
      // Allies wade through it faster, enemies slower (lingering a moment after stepping out).
      const owner = s.players[z.owner];
      const reach = MARSH.r + PLAYER_R;
      for (const q of s.players) {
        const dx = q.x - z.x;
        const dy = q.y - z.y;
        if (q.out || q.hp <= 0 || airborne(q) || dx * dx + dy * dy >= reach * reach) continue;
        if (q.team === owner.team) q.hasteT = Math.max(q.hasteT, 10);
        else if (!untargetable(q)) {
          q.slowMul = q.slowT > 0 ? Math.min(q.slowMul, MARSH.slow) : MARSH.slow;
          q.slowT = Math.max(q.slowT, 10);
        }
      }
    }
    if (z.t === 0 && z.kind === 'toad') {
      ev.push({ type: 'toad', owner: z.owner, x: z.x, y: z.y });
      const owner = s.players[z.owner];
      for (const foe of enemiesOf(s, owner)) {
        let dx = foe.x - z.x;
        let dy = foe.y - z.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < TOAD.inner + PLAYER_R) {
          if (hit(owner, foe, TOAD.dmg, 0, 'toad', foe.x, foe.y, ev)) stun(foe, TOAD.stun, ev);
        } else if (d < TOAD.r + PLAYER_R && hit(owner, foe, TOAD.edge, 0, 'toad', foe.x, foe.y, ev)) {
          if (d < 0.0001) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          knockback(foe, dx / d, dy / d, TOAD.kb);
        }
      }
      if (s.orb.active && Math.sqrt(z.x * z.x + z.y * z.y) < TOAD.r + ORB_R) damageOrb(s, z.owner, TOAD.dmg, 0, 0, ev);
    }
    if (z.t === 0 && z.kind === 'pulse') {
      ev.push({ type: 'pulse', owner: z.owner, x: z.x, y: z.y });
      areaHit(s, s.players[z.owner], z.x, z.y, PULSE.r, PULSE.dmg, 0, PULSE.kb, 'pulse', ev);
    }
    if (z.t > 0) left.push(z);
  }
  s.zones = left;
}

/**
 * Healing pickups: a pair near the edge, mirrored left/right so neither side is closer.
 * The first player to step on one (in id order) heals their whole team around it.
 */
function updatePickups(s: GameState, ev: GameEvent[]) {
  // The shrinking arena swallows the ones near the edge.
  const lim = s.arenaR - PICKUP.r;
  s.pickups = s.pickups.filter((pk) => pk.x * pk.x + pk.y * pk.y < lim * lim);
  if (s.pickups.length < PICKUP.max && --s.pickupT <= 0) {
    spawnPickup(s, ev);
    s.pickupT = PICKUP.every;
  }
  const reach = PLAYER_R + PICKUP.r;
  s.pickups = s.pickups.filter((pk) => {
    const taker = s.players.find((p) => {
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      return !p.out && p.hp > 0 && p.pickT === 0 && !airborne(p) && dx * dx + dy * dy < reach * reach;
    });
    if (!taker) return true;
    taker.pickT = PICKUP.lockout;
    ev.push({ type: 'pickup', player: taker.id, x: pk.x, y: pk.y });
    const area = PICKUP.area + PLAYER_R;
    for (const ally of s.players) {
      const dx = ally.x - pk.x;
      const dy = ally.y - pk.y;
      if (ally.team === taker.team && dx * dx + dy * dy < area * area) heal(ally, PICKUP.heal, ev);
    }
    return false;
  });
}

/**
 * Put a pickup at a random spot on the map, clear of pillars, walls and the river, and well away
 * from every champion still in the round (the frame number is the dice, so every peer agrees).
 * If no spot is far enough, the one farthest from the champions wins.
 */
function spawnPickup(s: GameState, ev: GameEvent[]) {
  const lim = s.arenaR - PICKUP.inset;
  const river = MAPS[s.map].river;
  let h = Math.imul(s.frame + 0x9e3779b9, 2246822519) >>> 0;
  const rnd = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return (h / 4294967296) * 2 - 1;
  };
  let best: { x: number; y: number } | null = null;
  let bestD = -1;
  for (let tries = 0; tries < 40; tries++) {
    const x = rnd() * lim;
    const y = rnd() * lim;
    if (x * x + y * y > lim * lim || hitsPillar(s, x, y, PICKUP.r + PLAYER_R)) continue;
    if (river && Math.abs(x) < river.half + PLAYER_R + PICKUP.r) continue;
    if (s.pickups.some((pk) => (pk.x - x) * (pk.x - x) + (pk.y - y) * (pk.y - y) < PICKUP.apart * PICKUP.apart)) continue;
    // Distance to the nearest champion.
    let near = Infinity;
    for (const p of s.players) {
      if (p.out) continue;
      near = Math.min(near, Math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)));
    }
    if (near >= PICKUP.away) {
      best = { x, y };
      break;
    }
    if (near > bestD) {
      bestD = near;
      best = { x, y };
    }
  }
  if (!best) return;
  s.pickups.push({ id: s.nextId++, x: best.x, y: best.y });
  ev.push({ type: 'pickupSpawn', x: best.x, y: best.y });
}

function updateMeteors(s: GameState, ev: GameEvent[]) {
  const pending = [];
  for (const m of s.meteors) {
    if (--m.t > 0) {
      pending.push(m);
      continue;
    }
    ev.push({ type: 'meteor', owner: m.owner, x: m.x, y: m.y });
    const owner = s.players[m.owner];
    for (const target of enemiesOf(s, owner)) {
      let dx = target.x - m.x;
      let dy = target.y - m.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < METEOR.r + PLAYER_R && hit(owner, target, METEOR.dmg, 0, 'meteor', target.x, target.y, ev)) {
        if (d < 0.0001) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        knockback(target, dx / d, dy / d, METEOR.kb);
      }
    }
    if (s.orb.active && Math.sqrt(m.x * m.x + m.y * m.y) < METEOR.r + ORB_R) damageOrb(s, m.owner, METEOR.dmg, 0, 0, ev);
  }
  s.meteors = pending;
}
