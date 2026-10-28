import { BTN, type ProjKind } from './types';

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

// Arena
export const ARENA_R = 528;
export const ARENA_MIN_R = 242;
export const SUDDEN_DEATH_AT = 60 * TICK_RATE;
export const ARENA_SHRINK = 0.3;
/** 2v2: partners spawn this far either side of their team's spawn. */
export const TEAM_SPREAD = 70;
export const SPAWNS = [
  { x: -352, y: 0 },
  { x: 352, y: 0 },
];

export interface Pillar {
  x: number;
  y: number;
  r: number;
}

/** A straight wall from (x0, y0) to (x1, y1), `r` thick on each side. */
export interface Wall {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}

/**
 * A river down the middle (|x| < half) that can't be walked or pushed into, only crossed
 * on its bridges (|y - bridge.y| < bridge.half) or by dashing, leaping or blinking over.
 * Projectiles and sight pass over it.
 */
export interface River {
  half: number;
  bridges: { y: number; half: number }[];
}

export interface MapDef {
  name: string;
  /** How the renderer dresses it: elven ruins, a castle courtyard, a crystal mine or a grove. */
  theme: 'ruins' | 'castle' | 'mine' | 'grove';
  river: River | null;
  pillars: Pillar[];
  walls: Wall[];
  /** What movement, projectiles and sight test against: the pillars plus every wall as a row of overlapping circles. */
  solids: Pillar[];
}

function makeMap(name: string, theme: MapDef['theme'], pillars: Pillar[], walls: Wall[], river: River | null = null): MapDef {
  const solids = pillars.slice();
  for (const w of walls) {
    const dx = w.x1 - w.x0;
    const dy = w.y1 - w.y0;
    // Circles a radius apart overlap, so no line of sight slips between them.
    const n = Math.ceil(Math.sqrt(dx * dx + dy * dy) / w.r);
    for (let i = 0; i <= n; i++) solids.push({ x: w.x0 + (dx * i) / n, y: w.y0 + (dy * i) / n, r: w.r });
  }
  return { name, theme, river, pillars, walls, solids };
}

/** One L-shaped wall per corner of the courtyard, opening onto the outer ring. */
function courtyardWalls(): Wall[] {
  const walls: Wall[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      walls.push({ x0: sx * 250, y0: sy * 150, x1: sx * 340, y1: sy * 150, r: 18 });
      walls.push({ x0: sx * 250, y0: sy * 150, x1: sx * 250, y1: sy * 280, r: 18 });
    }
  }
  return walls;
}

/** Mirror points into all four quadrants (each map is symmetric both ways). */
function mirrored(pillars: Pillar[]): Pillar[] {
  const out: Pillar[] = [];
  for (const p of pillars) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if ((p.x === 0 && sx < 0) || (p.y === 0 && sy < 0)) continue;
      out.push({ x: p.x * sx, y: p.y * sy, r: p.r });
    }
  }
  return out;
}

/** Index = GameState.map. Every map is mirrored left/right so neither spawn is favored. */
export const MAPS: MapDef[] = [
  // Overgrown elven ruins split by a river: bridges in the middle (with the orb) and near
  // either end. Its banks are 2 * (half + PLAYER_R / 2) = 90 apart, under the shortest hop
  // in the game (Time Skip, 125), so every champion can jump it.
  makeMap(
    'Moonlit Ruins',
    'ruins',
    [
      { x: -193, y: -193, r: 42 },
      { x: 193, y: -193, r: 42 },
      { x: -193, y: 193, r: 42 },
      { x: 193, y: 193, r: 42 },
    ],
    [],
    { half: 34, bridges: [{ y: 0, half: 48 }, { y: -330, half: 40 }, { y: 330, half: 40 }] },
  ),
  // Castle courtyard: an open cross of avenues, corner nooks behind the walls, two statues.
  makeMap(
    'Courtyard',
    'castle',
    [
      { x: 0, y: -260, r: 30 },
      { x: 0, y: 260, r: 30 },
    ],
    courtyardWalls(),
  ),
  // Crystal mine: two rock ridges split it into three lanes, open by the orb; crystals give cover on the flanks.
  makeMap(
    'Crystal Mine',
    'mine',
    mirrored([
      { x: 0, y: 330, r: 30 },
      { x: 330, y: 280, r: 18 },
    ]),
    [-1, 1].flatMap((sy) => [-1, 1].map((sx) => ({ x0: sx * 80, y0: sy * 140, x1: sx * 240, y1: sy * 140, r: 22 }))),
  ),
  // Whispering grove: trees all around a clearing with the orb; short sight lines, ambush ground.
  makeMap(
    'Whispering Grove',
    'grove',
    mirrored([
      { x: 150, y: 120, r: 26 },
      { x: 230, y: 250, r: 30 },
      { x: 0, y: 190, r: 26 },
      { x: 0, y: 420, r: 22 },
      { x: 300, y: 380, r: 18 },
    ]),
    [],
  ),
];

// Fog of war: you see within this radius, pillars block line of sight.
export const VISION_R = 430;

// Champions (shared)
export const PLAYER_R = 22;
export const MAX_ENERGY = 100;
export const KB_DECAY = 0.86;
export const HASTE_MUL = 1.35;
export const BUFFER_TICKS = 12;

// Match flow
export const ROUNDS_TO_WIN = 3;
export const COUNTDOWN_TICKS = 150;
export const ROUND_END_TICKS = 150;

// Center orb
export const ORB_R = 24;
export const ORB_HP = 30;
export const ORB_HEAL = 20;
export const ORB_ENERGY = 25;
export const ORB_SPAWN_AT = 10 * TICK_RATE;
export const ORB_RESPAWN = 20 * TICK_RATE;

/**
 * Healing pickups: at most `max` lie on the map. The first appears `first` ticks into a round,
 * then another `every` ticks after, whenever fewer than `max` are left, at a random spot at
 * least `away` from every champion (and `apart` from the other pickup), `inset` inside the edge.
 * Stepping on one heals everyone on your team within `area` by `heal`; afterwards you can't
 * take another for `lockout` ticks.
 */
export const PICKUP = { first: 15 * TICK_RATE, every: 12 * TICK_RATE, max: 2, r: 16, area: 110, heal: 18, lockout: 4 * TICK_RATE, inset: 60, away: 260, apart: 200 };

// Abilities — every champion has six, one per slot.
export const SLOT = {
  M1: 0,
  M2: 1,
  SPACE: 2,
  Q: 3,
  E: 4,
  R: 5,
} as const;
export const SLOT_KEYS = ['LMB', 'RMB', 'SPACE', 'Q', 'E', 'R'];
export const SLOT_BUTTONS = [BTN.M1, BTN.M2, BTN.SPACE, BTN.Q, BTN.E, BTN.R];

export type AbilityId =
  | 'bolt' | 'blast' | 'dash' | 'counter' | 'frost' | 'meteor'
  | 'slash' | 'hook' | 'leap' | 'cry' | 'whirl' | 'rift'
  | 'dagger' | 'mark' | 'blink' | 'smoke' | 'poison' | 'execute'
  | 'arrow' | 'longshot' | 'vault' | 'sonic' | 'snare' | 'rain'
  | 'katana' | 'tempest' | 'blade' | 'deflect' | 'soul' | 'fate'
  | 'bloodbolt' | 'transfusion' | 'step' | 'tides' | 'drain' | 'swarm'
  | 'chrono' | 'clock' | 'flicker' | 'converge' | 'recall' | 'pulse'
  | 'jab' | 'tongue' | 'lily' | 'submerge' | 'marsh' | 'toad';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  desc: string;
  cooldown: number;
  /** Windup ticks before the ability goes off (0 = instant). */
  cast: number;
  /** Movement multiplier while casting. */
  castSlow: number;
  energyCost: number;
}

export interface ChampionDef {
  name: string;
  role: string;
  hp: number;
  speed: number;
  abilities: AbilityDef[];
}

export const CHAMP = { MAGE: 0, WARRIOR: 1, ASSASSIN: 2, ARCHER: 3, SAMURAI: 4, BLOOD: 5, CHRONO: 6, FROG: 7 } as const;

export const CHAMPIONS: ChampionDef[] = [
  {
    name: 'Mage',
    role: 'ranged control',
    hp: 150,
    speed: 3.1,
    abilities: [
      { id: 'bolt', name: 'Spark', desc: 'basic bolt, hold to keep firing', cooldown: 8, cast: 14, castSlow: 0.6, energyCost: 0 },
      { id: 'blast', name: 'Blast', desc: 'knocks back and interrupts casts', cooldown: 300, cast: 32, castSlow: 0.35, energyCost: 0 },
      { id: 'dash', name: 'Dash', desc: 'dash toward the cursor, cancels your cast', cooldown: 360, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'counter', name: 'Counter', desc: 'blocks a hit, grants energy and haste', cooldown: 480, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'frost', name: 'Frost', desc: 'slows the enemy', cooldown: 420, cast: 18, castSlow: 0.5, energyCost: 0 },
      { id: 'meteor', name: 'Meteor', desc: 'delayed area strike, 100 energy', cooldown: 60, cast: 20, castSlow: 0.3, energyCost: 100 },
    ],
  },
  {
    name: 'Warrior',
    role: 'melee and engage',
    hp: 175,
    speed: 3.4,
    abilities: [
      { id: 'slash', name: 'Cleave', desc: 'axe swing in front of you, hold to keep swinging', cooldown: 6, cast: 12, castSlow: 0.5, energyCost: 0 },
      { id: 'hook', name: 'Chain', desc: 'hook that pulls the enemy in', cooldown: 360, cast: 20, castSlow: 0.4, energyCost: 0 },
      { id: 'leap', name: 'Leap', desc: 'jump to the cursor, slowing where you land; untargetable in the air', cooldown: 420, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'cry', name: 'War Cry', desc: 'pulls the enemy in close, interrupts casts', cooldown: 480, cast: 6, castSlow: 0.2, energyCost: 0 },
      { id: 'whirl', name: 'Whirl', desc: 'spin, hitting everything around you', cooldown: 540, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'rift', name: 'Rift', desc: 'shockwave in a line, 100 energy', cooldown: 60, cast: 24, castSlow: 0.2, energyCost: 100 },
    ],
  },
  {
    name: 'Assassin',
    role: 'marks, stealth and executes',
    hp: 125,
    speed: 3.4,
    abilities: [
      { id: 'dagger', name: 'Dagger', desc: 'quick knife stab in front of you, hold to keep stabbing', cooldown: 6, cast: 8, castSlow: 0.7, energyCost: 0 },
      { id: 'mark', name: 'Mark', desc: 'marks the enemy; your next hit deals +10', cooldown: 300, cast: 16, castSlow: 0.5, energyCost: 0 },
      { id: 'blink', name: 'Shadow Step', desc: 'instant teleport to the cursor', cooldown: 420, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'smoke', name: 'Veil', desc: 'stealth and haste for 3 s; attacking reveals you, and that first hit deals +50%', cooldown: 540, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'poison', name: 'Venom', desc: 'coat your knives: your next 3 stabs within 5 s poison the enemy for 2 s', cooldown: 420, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'execute', name: 'Execute', desc: 'dash through the enemy; finishes it off under 30% HP, 100 energy', cooldown: 60, cast: 10, castSlow: 0.3, energyCost: 100 },
    ],
  },
  {
    name: 'Archer',
    role: 'long range and zoning',
    hp: 145,
    speed: 3.2,
    abilities: [
      { id: 'arrow', name: 'Arrow', desc: 'fast arrow, hold to keep firing', cooldown: 4, cast: 16, castSlow: 0.6, energyCost: 0 },
      // Charged: `cast` is the full draw; releasing the button early fires a weaker shot.
      { id: 'longshot', name: 'Longshot', desc: 'hold to draw; a full draw hits harder, flies further and knocks back', cooldown: 300, cast: 60, castSlow: 0.45, energyCost: 0 },
      { id: 'vault', name: 'Vault', desc: 'leap away from the cursor, slowing a close enemy; next Arrow is instant and stronger', cooldown: 300, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'sonic', name: 'Sonic Arrow', desc: 'reveals the enemy it hits, or the area where it lands', cooldown: 420, cast: 12, castSlow: 0.6, energyCost: 0 },
      { id: 'snare', name: 'Snare', desc: 'vine arrow that roots the enemy in place', cooldown: 420, cast: 18, castSlow: 0.5, energyCost: 0 },
      { id: 'rain', name: 'Arrow Rain', desc: 'volley on an area that keeps hurting and slowing, 100 energy', cooldown: 60, cast: 20, castSlow: 0.3, energyCost: 100 },
    ],
  },
  {
    name: 'Samurai',
    role: 'mobile duelist',
    hp: 150,
    speed: 3.4,
    abilities: [
      { id: 'katana', name: 'Katana', desc: 'quick wide-reaching slash, hold to keep slashing', cooldown: 5, cast: 10, castSlow: 0.55, energyCost: 0 },
      { id: 'tempest', name: 'Steel Tempest', desc: 'thrust in a line; two hits charge the next one into a flying crescent cut that stuns', cooldown: 150, cast: 10, castSlow: 0.5, energyCost: 0 },
      { id: 'blade', name: 'Sweeping Blade', desc: 'dash toward the cursor, cutting through the enemy', cooldown: 300, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'deflect', name: 'Deflect', desc: 'for 3 s your sword sends projectiles hitting you from the front back at the shooter; no attacking meanwhile', cooldown: 720, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'soul', name: 'Soul Unbound', desc: 'dash out as a spirit; snap back after 2.5 s (or press again), echoing part of your damage', cooldown: 600, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'fate', name: 'Fate Sealed', desc: 'blink forward in a line, pulling the enemy along and stunning it, 100 energy', cooldown: 60, cast: 24, castSlow: 0.2, energyCost: 100 },
    ],
  },
  {
    name: 'Blood Mage',
    role: 'drain and sustain',
    hp: 150,
    speed: 3.1,
    abilities: [
      { id: 'bloodbolt', name: 'Blood Bolt', desc: 'bolt that heals you a little when it hits, hold to keep firing', cooldown: 8, cast: 16, castSlow: 0.6, energyCost: 0 },
      { id: 'transfusion', name: 'Transfusion', desc: 'drains the enemy and heals you, but a miss costs you 8 HP; every third one is empowered', cooldown: 240, cast: 12, castSlow: 0.6, energyCost: 0 },
      { id: 'step', name: 'Crimson Step', desc: 'dash toward the cursor; enemies you pass through bleed for 2 s, healing you', cooldown: 360, cast: 0, castSlow: 1, energyCost: 0 },
      // Charged: `cast` is the full gathering; letting go early bursts weaker.
      { id: 'tides', name: 'Tides of Blood', desc: 'hold to gather blood, release to burst around you and slow; costs 6 HP', cooldown: 300, cast: 60, castSlow: 0.5, energyCost: 0 },
      { id: 'drain', name: 'Exsanguinate', desc: 'tether the nearest enemy and drain it for up to 2 s while it stays close; a pillar between you breaks it', cooldown: 480, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'swarm', name: 'Night Swarm', desc: 'scatter into bats and fly toward the cursor, untargetable; enemies you pass through take damage and are slowed, healing you, 100 energy', cooldown: 60, cast: 0, castSlow: 1, energyCost: 100 },
    ],
  },
  {
    name: 'Time Kobold',
    role: 'rewind and skirmish',
    hp: 130,
    speed: 3.5,
    abilities: [
      { id: 'chrono', name: 'Chrono Pick', desc: 'pickaxe swing, hold to keep swinging; every third hit in a row on one enemy cracks time: bonus damage, slows it and hastes you', cooldown: 5, cast: 9, castSlow: 0.6, energyCost: 0 },
      { id: 'clock', name: 'Chronobomb', desc: 'lob a ticking bomb at the cursor that bounces on twice; it bursts when it lands next to an enemy (or at the last bounce), slowing time around it', cooldown: 270, cast: 14, castSlow: 0.5, energyCost: 0 },
      // The cooldown is only a short lockout between blinks; charges do the limiting.
      { id: 'flicker', name: 'Time Skip', desc: 'short blink where you are moving (or aiming), two charges', cooldown: 12, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'converge', name: 'Cave-In', desc: 'mark an area; after 1.5 s time caves in on it, stunning enemies inside', cooldown: 600, cast: 10, castSlow: 0.5, energyCost: 0 },
      { id: 'recall', name: 'Rewind', desc: 'jump back to where you were 3 s ago, regaining a third of the HP you lost since', cooldown: 720, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'pulse', name: 'Blasting Charge', desc: 'throw a charge that sticks to the first enemy it hits (or lands) and blows up after 1 s, 100 energy', cooldown: 60, cast: 12, castSlow: 0.4, energyCost: 100 },
    ],
  },
  {
    name: 'Swamp Frog',
    role: 'slippery skirmisher',
    hp: 140,
    speed: 3.5,
    abilities: [
      { id: 'jab', name: 'Spear Jab', desc: 'quick narrow spear thrust, hold to keep jabbing', cooldown: 5, cast: 9, castSlow: 0.6, energyCost: 0 },
      { id: 'tongue', name: 'Tongue Snap', desc: 'short tongue lash; a hit yanks you to the enemy, slows it, and your next Jab hits harder', cooldown: 240, cast: 10, castSlow: 0.5, energyCost: 0 },
      { id: 'lily', name: 'Lily Leap', desc: 'hop to the cursor, untargetable in the air, and dive under on landing: unseen for 1.5 s (attacking reveals you)', cooldown: 480, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'submerge', name: 'Submerge', desc: 'sink into a pool of swamp water, untargetable, then burst out near the cursor (or press again), hitting and slowing where you land', cooldown: 420, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'marsh', name: 'Marsh Pool', desc: 'a pool of swamp water for 3 s: you and allies in it are faster, enemies slower', cooldown: 480, cast: 8, castSlow: 0.5, energyCost: 0 },
      { id: 'toad', name: 'Ancestor Toad', desc: 'throw a lotus bait that sticks to the first enemy it hits (or lands); 1 s later the great toad bursts up under it, swallowing and stunning enemies in the middle and throwing out the rest, 100 energy', cooldown: 60, cast: 14, castSlow: 0.4, energyCost: 100 },
    ],
  },
];

export interface ProjDef {
  speed: number;
  r: number;
  range: number;
  dmg: number;
  /** Energy granted to the attacker on hit. */
  energy: number;
  /** Knockback impulse along the flight direction; negative pulls towards the caster. Any knockback interrupts casts. */
  kb: number;
  slowMul: number;
  slowT: number;
}

export const PROJ: Record<ProjKind, ProjDef> = {
  bolt: { speed: 13, r: 9, range: 480, dmg: 8, energy: 8, kb: 0, slowMul: 1, slowT: 0 },
  blast: { speed: 10, r: 16, range: 620, dmg: 20, energy: 12, kb: 11, slowMul: 1, slowT: 0 },
  frost: { speed: 11, r: 12, range: 520, dmg: 10, energy: 10, kb: 0, slowMul: 0.5, slowT: 100 },
  hook: { speed: 15, r: 10, range: 470, dmg: 12, energy: 10, kb: -22, slowMul: 1, slowT: 0 },
  mark: { speed: 14, r: 11, range: 500, dmg: 6, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  arrow: { speed: 15, r: 7, range: 600, dmg: 6, energy: 8, kb: 0, slowMul: 1, slowT: 0 },
  // Base values for a minimal draw; LONGSHOT scales them up to a full draw.
  longshot: { speed: 15, r: 8, range: 460, dmg: 10, energy: 12, kb: 0, slowMul: 1, slowT: 0 },
  sonic: { speed: 16, r: 8, range: 640, dmg: 5, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  snare: { speed: 13, r: 11, range: 480, dmg: 8, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  // Steel Tempest with two stacks becomes a flying crescent cut.
  crescent: { speed: 12, r: 22, range: 440, dmg: 10, energy: 12, kb: 0, slowMul: 1, slowT: 0 },
  bloodbolt: { speed: 12, r: 9, range: 440, dmg: 7, energy: 8, kb: 0, slowMul: 1, slowT: 0 },
  transfusion: { speed: 15, r: 11, range: 420, dmg: 13, energy: 12, kb: 0, slowMul: 1, slowT: 0 },
  // Lobbed at the cursor (up to `range`) over pillars, then bounces on (CLOCK); its burst slows.
  clock: { speed: 10, r: 11, range: 380, dmg: 12, energy: 8, kb: 0, slowMul: 0.6, slowT: 45 },
  // Deals nothing itself: it sticks and bursts (PULSE).
  pulse: { speed: 11, r: 10, range: 300, dmg: 0, energy: 0, kb: 0, slowMul: 1, slowT: 0 },
  // Lotus bait: deals nothing itself; it sticks (or lands) and the toad bursts up under it (TOAD).
  toad: { speed: 12, r: 10, range: 380, dmg: 0, energy: 0, kb: 0, slowMul: 1, slowT: 0 },
  // A hit yanks the frog to the target (TONGUE).
  tongue: { speed: 17, r: 9, range: 240, dmg: 6, energy: 10, kb: 0, slowMul: 0.65, slowT: 40 },
};

// Mage
export const DASH = { ticks: 12, speed: 16 };
export const COUNTER = { ticks: 48, slow: 0.4, energy: 20, haste: 70 };
export const METEOR = { range: 480, delay: 54, r: 115, dmg: 32, kb: 12 };

// Warrior
/** Hits when the target's center is within 2*PLAYER_R + reach and in front (dot >= minDot). */
export const SLASH = { reach: 52, minDot: 0.45, dmg: 9, energy: 10 };
/** Landing hits everything within `r` and slows it (slowMul for slowT ticks). */
export const LEAP = { ticks: 22, range: 280, r: 85, dmg: 14, energy: 10, slowMul: 0.6, slowT: 50 };
/** Pulls an enemy within `r` towards the warrior, stopping `stop` from his center. */
export const CRY = { r: 150, dmg: 8, stop: 56, energy: 8 };
export const WHIRL = { ticks: 60, every: 12, r: 82, dmg: 4, energy: 4, speed: 0.9 };
export const RIFT = { len: 360, half: 42, dmg: 30, kb: 11 };

// Assassin
export const MARK = { ticks: 180, bonus: 10 };
export const BLINK = { range: 230 };
/** Stealth; attacking out of it makes the first hit within `window` ticks deal `ambush` times damage. */
export const SMOKE = { ticks: 180, speed: 1.3, ambush: 1.5, window: 45 };
export const POISON = { ticks: 120, every: 20, dmg: 2 };
/** Dash through the target for `dmg`; at or below `threshold` of max HP it kills outright. */
export const EXECUTE = { ticks: 14, range: 260, dmg: 16, threshold: 0.3 };
/** Dagger: a knife stab hitting enemies within reach in front (like SLASH). */
export const STAB = { reach: 34, minDot: 0.4, dmg: 8, energy: 9 };
/** Venom: the next `charges` stabs within `ticks` poison the enemy (POISON). */
export const VENOM = { charges: 3, ticks: 300 };

// Archer
/** Draw at least `minDraw` ticks; a full draw adds these on top of PROJ.longshot. */
export const LONGSHOT = { minDraw: 14, dmg: 16, speed: 8, range: 340, kb: 9 };
/**
 * Jumps away from the aim; an enemy within `r` of the take-off is slowed, and the
 * next Arrow within `quick` ticks is instant with `bonus` damage.
 */
export const VAULT = { ticks: 12, speed: 15, r: 110, slowMul: 0.5, slowT: 70, quick: 90, bonus: 5 };
/** A hit reveals the target for `reveal` ticks; a miss leaves a sensor of radius `r` for `ticks`. */
export const SONIC = { reveal: 240, r: 240, ticks: 300 };
export const SNARE = { root: 75 };
/** Lands `delay` after release for `dmg`, then lingers `ticks`, pulsing every `every` and slowing. */
export const RAIN = { range: 520, delay: 36, r: 120, dmg: 20, ticks: 120, every: 20, pulse: 3, slow: 0.55 };

// Samurai
/** Like SLASH but reaching further and narrower. */
export const KATANA = { reach: 64, minDot: 0.55, dmg: 7, energy: 9 };
/** Line thrust; a hit adds a stack (max `max`) that lasts `window` ticks; full stacks fire a crescent cut that stuns. */
export const TEMPEST = { len: 165, half: 20, dmg: 9, energy: 10, max: 2, window: 360, stun: 40 };
/** Dash toward the aim that passes through the enemy, cutting it once. */
export const BLADE = { ticks: 12, speed: 15, dmg: 7, energy: 8 };
/** For `ticks`, enemy projectiles reaching her from the front (facing dot < `minDot`) fly back at the shooter. */
export const DEFLECT = { ticks: 180, minDot: 0, energy: 10 };
/** Spirit dash; after `ticks` (or a recast) snap back to the start and echo `echo` of the damage dealt meanwhile. */
export const SOUL = { ticks: 150, dashTicks: 10, speed: 16, echo: 0.3 };
/** Blink up to `range` along the aim; an enemy in the line is pulled to the end and stunned. */
export const FATE = { range: 320, half: 40, dmg: 18, stun: 45 };

// Training
/** Training: nobody dies, and after `rest` ticks without damage a player heals up. The dummy has `hp`. */
export const DUMMY = { hp: 1000, rest: 150 };

// Blood mage
/** Blood Bolt heals this much on a hit. */
export const BLOODBOLT = { heal: 2 };
/** Transfusion heals `heal` on a hit and costs `missCost` HP on a miss; every `every`th cast is empowered by `boost` (damage and heal). */
export const TRANSFUSION = { heal: 9, missCost: 8, every: 3, boost: 1.6 };
/** Crimson Step: a dash through enemies; each one passed through bleeds (BLEED). */
export const STEP = { ticks: 10, speed: 17 };
/** Bleeding: `dmg` every `every` ticks for `ticks`, each tick healing whoever caused it. */
export const BLEED = { ticks: 120, every: 20, dmg: 2 };
/** Gather at least `minDraw`; bursts within `r` for `dmg` (+`bonus` at a full gathering) and slows. Costs `cost` HP. */
export const TIDES = { minDraw: 12, r: 135, dmg: 10, bonus: 14, slowMul: 0.6, slowT: 60, cost: 6 };
/**
 * Tether the nearest enemy in sight within `range` for up to `ticks`; every `every` ticks deals
 * `dmg` and heals `heal`. Moving at `speed`. A pillar between the two breaks it.
 */
export const DRAIN = { ticks: 120, range: 300, every: 15, dmg: 5, heal: 4, energy: 4, speed: 0.6 };
/**
 * Night Swarm: fly up to `range` toward the cursor over `ticks` as bats, untargetable. Every enemy
 * passed through takes `dmg`, is slowed to `slowMul` for `slowT` and heals you `heal`.
 */
export const SWARM = { range: 260, ticks: 20, dmg: 10, heal: 5, slowMul: 0.75, slowT: 45 };

// Time kobold
/**
 * Like KATANA but shorter. `hits` hits in a row on one enemy (each within `window` of the last,
 * from Chrono Pick or Chronobomb) resonate: +`bonus`, a slow, and haste for the attacker.
 */
export const CHRONO = { reach: 48, minDot: 0.5, dmg: 6, energy: 9, hits: 3, window: 150, bonus: 12, slowMul: 0.65, slowT: 50, haste: 60 };
/**
 * Chronobomb: `bounces` bounces, each hop `hop` times the last (at least `minHop`). It bursts
 * within `r` when it lands next to an enemy (or the orb), on a pillar or the wall, or at the last landing.
 */
export const CLOCK = { bounces: 2, hop: 0.45, minHop: 40, r: 75 };
/** Blink `range` along your movement (or the aim when standing); `charges` charges, each back after `recharge`. */
export const FLICKER = { range: 125, charges: 2, recharge: 250 };
/** A field of radius `r` up to `range` away; after `delay` it stuns enemies inside for `stun` and deals `dmg`. */
export const CONVERGE = { range: 420, r: 90, delay: 90, stun: 50, dmg: 6 };
/** Back to where you were `ticks` ago (positions sampled every `every`), regaining `heal` of the HP lost since. */
export const RECALL = { ticks: 180, every: 6, heal: 0.35 };
/** Sticks to the first enemy hit (or lies where it stops) and bursts `fuse` later within `r`. */
export const PULSE = { fuse: 60, r: 90, dmg: 30, kb: 6 };

// Swamp frog
/** Thrust in a narrow line; after a Tongue Snap hit (within TONGUE.window) the next one deals `bonus` more. */
export const JAB = { len: 84, half: 20, dmg: 8, energy: 7, bonus: 7 };
/** On a hit the frog dashes to `gap` short of the target over `ticks`; the next Jab within `window` is empowered. */
export const TONGUE = { ticks: 8, gap: 2 * PLAYER_R + 6, window: 90 };
/** A hop toward the cursor, untargetable in the air; on landing the frog dives under, unseen for `dive` ticks. */
export const LILY = { ticks: 16, range: 200, dive: 90 };
/**
 * Under the water for `ticks` (untargetable, can't move or attack), then leaping out up to
 * `range` toward the cursor over `jump` ticks; the landing hits within `r` and slows.
 */
export const SUBMERGE = { ticks: 45, range: 170, jump: 12, r: 72, dmg: 12, energy: 10, slowMul: 0.6, slowT: 50 };
/** A pool up to `range` away lasting `ticks`: allies inside are hasted, enemies slowed to `slow`. */
export const MARSH = { range: 260, r: 100, ticks: 180, slow: 0.65 };
/**
 * The bait sticks to the first enemy hit (or lies where it stops); `delay` later the toad bursts up
 * under it: within `inner` it deals `dmg` and stuns; out to `r`, `edge` and a throw outward.
 */
export const TOAD = { delay: 60, r: 110, inner: 55, dmg: 24, stun: 40, edge: 16, kb: 10 };
