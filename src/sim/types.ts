import type { AbilityId } from './constants';

export interface Vec {
  x: number;
  y: number;
}

/** Button bits carried in Input.buttons. */
export const BTN = {
  M1: 1,
  M2: 2,
  SPACE: 4,
  Q: 8,
  E: 16,
  R: 32,
} as const;

/**
 * Everything one player contributes to a tick. Kept small and integer-only so it
 * can later be sent over the network as-is.
 */
export interface Input {
  /** Movement axis, -1 | 0 | 1. */
  mx: number;
  my: number;
  /** Aim point in world coordinates (rounded to integers). */
  ax: number;
  ay: number;
  buttons: number;
}

export type ProjKind = 'bolt' | 'blast' | 'frost' | 'hook' | 'dagger' | 'mark' | 'poison' | 'arrow' | 'longshot' | 'sonic' | 'snare' | 'crescent';
export type HitKind = ProjKind | 'meteor' | 'slash' | 'leap' | 'cry' | 'whirl' | 'rift' | 'execute' | 'rain' | 'katana' | 'tempest' | 'blade' | 'soul' | 'fate';

export interface Cast {
  /** Ability slot (see SLOT). */
  ability: number;
  t: number;
}

export interface Player {
  id: number;
  /** Training dummy: stands still, can't die (see DUMMY). */
  dummy: boolean;
  /** Training only: ticks since this player last took damage. */
  restT: number;
  /** Index into CHAMPIONS. */
  champ: number;
  x: number;
  y: number;
  /** External velocity (knockback), decays every tick. */
  vx: number;
  vy: number;
  /** Facing / aim direction, unit vector. */
  fx: number;
  fy: number;
  hp: number;
  energy: number;
  cooldowns: number[];
  cast: Cast | null;
  /** Buffered ability press (index) or -1. */
  buffer: number;
  bufferT: number;
  prevButtons: number;
  dashT: number;
  dashX: number;
  dashY: number;
  /**
   * 0 = ground dash, 1 = leap (airborne: can't be hit, damages on landing),
   * 2 = execute (can't be hit, passes through), 3 = sweeping blade (passes through, cuts once).
   */
  dashKind: number;
  /** Execute / sweeping blade already connected during this dash (0/1). */
  dashHit: number;
  whirlT: number;
  /** Marked by the enemy assassin: the next hit pops it for bonus damage. */
  markT: number;
  stealthT: number;
  /** Just attacked out of stealth: the next hit within these ticks is an ambush (SMOKE.ambush). */
  ambushT: number;
  poisonT: number;
  /** Rooted by a snare: can't walk or use mobility. */
  rootT: number;
  /** Hit by a sonic arrow: visible to the enemy through the fog. */
  revealT: number;
  /** After a vault: the next Arrow is instant and hits harder. */
  quickT: number;
  /** Stunned: can't move, cast or use anything. */
  stunT: number;
  /** Samurai: Deflect active (ticks left). */
  deflectT: number;
  /** Samurai: Steel Tempest stacks and the ticks until they expire. */
  stacks: number;
  stackT: number;
  /** Samurai: Soul Unbound active (ticks left), where the body waits, and damage dealt meanwhile. */
  soulT: number;
  soulX: number;
  soulY: number;
  soulDmg: number;
  counterT: number;
  slowT: number;
  slowMul: number;
  hasteT: number;
  hitT: number;
}

export interface Projectile {
  id: number;
  owner: number;
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  /** Damage and knockback on hit (fixed per kind, except a drawn longshot or a quick arrow). */
  dmg: number;
  kb: number;
}

/** Lingering area on the floor: an archer's arrow rain or sonic sensor. */
export interface Zone {
  id: number;
  owner: number;
  kind: 'rain' | 'sonic';
  x: number;
  y: number;
  /** Ticks left. Rain is still falling while t > RAIN.ticks. */
  t: number;
}

export interface Meteor {
  id: number;
  owner: number;
  x: number;
  y: number;
  t: number;
}

export interface Orb {
  active: boolean;
  hp: number;
  /** Ticks until (re)spawn while inactive. */
  timer: number;
}

export type Phase = 'countdown' | 'fight' | 'roundEnd' | 'matchEnd';

export interface GameState {
  frame: number;
  /** Training: player 1 is a dummy, nobody dies, no fog, orb, sudden death or countdown. */
  training: boolean;
  /** Champion picked for each player slot. */
  champs: number[];
  phase: Phase;
  phaseT: number;
  round: number;
  roundFrame: number;
  score: number[];
  /** Winner of the last finished round, -1 for a draw. */
  lastRoundWinner: number;
  arenaR: number;
  players: Player[];
  projectiles: Projectile[];
  meteors: Meteor[];
  zones: Zone[];
  orb: Orb;
  nextId: number;
}

/** Side effects of a tick, consumed by rendering/audio. Not part of the state. */
export type GameEvent =
  | { type: 'cast'; player: number; ability: AbilityId }
  | { type: 'release'; player: number; ability: AbilityId; x: number; y: number }
  | { type: 'hit'; target: number; source: number; dmg: number; x: number; y: number; kind: HitKind }
  | { type: 'block'; player: number; x: number; y: number }
  | { type: 'impact'; x: number; y: number; kind: ProjKind; owner: number }
  | { type: 'meteor'; owner: number; x: number; y: number }
  | { type: 'orbSpawn' }
  | { type: 'orbHit'; x: number; y: number }
  | { type: 'orbBreak'; player: number; x: number; y: number }
  | { type: 'dash'; player: number; x: number; y: number }
  | { type: 'leap'; player: number; x: number; y: number }
  | { type: 'land'; player: number; x: number; y: number }
  | { type: 'swing'; player: number; x: number; y: number; fx: number; fy: number; reach: number }
  | { type: 'nova'; player: number; x: number; y: number }
  | { type: 'whirl'; player: number; x: number; y: number }
  | { type: 'rift'; player: number; x: number; y: number; fx: number; fy: number }
  | { type: 'blink'; player: number; x0: number; y0: number; x: number; y: number }
  | { type: 'stealth'; player: number; x: number; y: number }
  | { type: 'reveal'; player: number; x: number; y: number }
  | { type: 'markPop'; player: number; x: number; y: number }
  /** A hit boosted by attacking out of stealth; `player` is the one hit. */
  | { type: 'ambush'; player: number; x: number; y: number }
  | { type: 'execute'; player: number; x: number; y: number; lethal: boolean }
  | { type: 'counter'; player: number }
  | { type: 'vault'; player: number; x: number; y: number }
  /** Arrow rain: `first` is the landing volley, the rest are lingering pulses. */
  | { type: 'rain'; owner: number; x: number; y: number; first: boolean }
  | { type: 'sensor'; owner: number; x: number; y: number }
  | { type: 'root'; player: number; x: number; y: number }
  | { type: 'stun'; player: number; x: number; y: number }
  | { type: 'thrust'; player: number; x: number; y: number; fx: number; fy: number }
  /** A deflected projectile turning around at (x, y). */
  | { type: 'deflect'; player: number; x: number; y: number }
  | { type: 'soul'; player: number; x: number; y: number }
  | { type: 'soulReturn'; player: number; x0: number; y0: number; x: number; y: number }
  | { type: 'fate'; player: number; x0: number; y0: number; x: number; y: number }
  | { type: 'ko'; player: number; x: number; y: number }
  | { type: 'fight' }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; winner: number }
  | { type: 'matchEnd'; winner: number }
  | { type: 'suddenDeath' };
