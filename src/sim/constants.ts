import { BTN, type ProjKind } from './types';

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

// Arena
export const ARENA_R = 528;
export const ARENA_MIN_R = 242;
export const SUDDEN_DEATH_AT = 60 * TICK_RATE;
export const ARENA_SHRINK = 0.3;
export const SPAWNS = [
  { x: -352, y: 0 },
  { x: 352, y: 0 },
];
export const PILLARS = [
  { x: -193, y: -193, r: 42 },
  { x: 193, y: -193, r: 42 },
  { x: -193, y: 193, r: 42 },
  { x: 193, y: 193, r: 42 },
  { x: 0, y: -330, r: 36 },
  { x: 0, y: 330, r: 36 },
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
  | 'katana' | 'tempest' | 'blade' | 'deflect' | 'soul' | 'fate';

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

export const CHAMP = { MAGE: 0, WARRIOR: 1, ASSASSIN: 2, ARCHER: 3, SAMURAI: 4 } as const;

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
      { id: 'dagger', name: 'Dagger', desc: 'quick short-range throws, hold to keep throwing', cooldown: 8, cast: 8, castSlow: 0.7, energyCost: 0 },
      { id: 'mark', name: 'Mark', desc: 'marks the enemy; your next hit deals +10', cooldown: 300, cast: 16, castSlow: 0.5, energyCost: 0 },
      { id: 'blink', name: 'Shadow Step', desc: 'instant teleport to the cursor', cooldown: 420, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'smoke', name: 'Veil', desc: 'stealth and haste for 3 s; attacking reveals you, and that first hit deals +50%', cooldown: 540, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'poison', name: 'Venom', desc: 'poisoned dagger: damage over 2 s', cooldown: 420, cast: 12, castSlow: 0.6, energyCost: 0 },
      { id: 'execute', name: 'Execute', desc: 'dash through the enemy; double damage under 35% HP, 100 energy', cooldown: 60, cast: 10, castSlow: 0.3, energyCost: 100 },
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
  dagger: { speed: 14, r: 7, range: 300, dmg: 5, energy: 7, kb: 0, slowMul: 1, slowT: 0 },
  mark: { speed: 14, r: 11, range: 500, dmg: 6, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  poison: { speed: 15, r: 9, range: 420, dmg: 4, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  arrow: { speed: 15, r: 7, range: 600, dmg: 6, energy: 8, kb: 0, slowMul: 1, slowT: 0 },
  // Base values for a minimal draw; LONGSHOT scales them up to a full draw.
  longshot: { speed: 15, r: 8, range: 460, dmg: 10, energy: 12, kb: 0, slowMul: 1, slowT: 0 },
  sonic: { speed: 16, r: 8, range: 640, dmg: 5, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  snare: { speed: 13, r: 11, range: 480, dmg: 8, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  // Steel Tempest with two stacks becomes a flying crescent cut.
  crescent: { speed: 12, r: 22, range: 440, dmg: 10, energy: 12, kb: 0, slowMul: 1, slowT: 0 },
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
/** Dash through the target; double damage if it's at or below `threshold` of max HP. */
export const EXECUTE = { ticks: 14, range: 260, dmg: 16, threshold: 0.35 };

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
export const RAIN = { range: 520, delay: 36, r: 120, dmg: 12, ticks: 120, every: 20, pulse: 3, slow: 0.55 };

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
