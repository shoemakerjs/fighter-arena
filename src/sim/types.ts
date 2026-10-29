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

export type ProjKind = 'bolt' | 'blast' | 'frost' | 'hook' | 'mark' | 'arrow' | 'longshot' | 'sonic' | 'snare' | 'crescent' | 'bloodbolt' | 'transfusion' | 'clock' | 'pulse' | 'tongue' | 'toad' | 'lightning';
export type HitKind = ProjKind | 'meteor' | 'slash' | 'leap' | 'cry' | 'whirl' | 'rift' | 'execute' | 'rain' | 'katana' | 'tempest' | 'blade' | 'soul' | 'fate' | 'bleed' | 'tides' | 'drain' | 'swarm' | 'chrono' | 'resonance' | 'converge' | 'jab' | 'submerge' | 'stab' | 'poison' | 'gore' | 'charge' | 'stomp' | 'thunder' | 'shock';

export interface Cast {
  /** Ability slot (see SLOT). */
  ability: number;
  t: number;
}

export interface Player {
  id: number;
  /** 0 or 1 (= id % 2): players 0 and 2 against 1 and 3. */
  team: number;
  /** Knocked out this round (2v2: the ally plays on). */
  out: boolean;
  /** Training dummy: stands still, can't die (see DUMMY). */
  dummy: boolean;
  /** Training only: ticks since this player last took damage. */
  restT: number;
  /** Index into CHAMPIONS. */
  champ: number;
  /** Body radius: the hitbox and how much room the champion takes (see champR). */
  r: number;
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
   * 2 = execute (can't be hit, passes through), 3 = sweeping blade (passes through, cuts once),
   * 4 = crimson step (passes through, makes each enemy bleed; dashHit is a bitmask by id),
   * 5 = night swarm (can't be hit, passes through, bites each enemy once; dashHit is a bitmask),
   * 6 = lily leap (airborne, no landing hit), 7 = leap out of Submerge (airborne, hits on landing),
   * 8 = bull rush (stops at the first enemy it runs into), 9 = thunderfall (airborne, hits on landing).
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
  /** Shade: Venom stabs left, and the ticks before the coating dries. */
  venom: number;
  venomT: number;
  /** Who applied the poison (credited with its ticks). */
  poisonBy: number;
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
  /** Samurai: Steel Tempest stacks; storm bull: Horn Sweep hits in a row. And the ticks until they expire. */
  stacks: number;
  stackT: number;
  /** Samurai: Soul Unbound active (ticks left), where the body waits, and damage dealt meanwhile. */
  soulT: number;
  soulX: number;
  soulY: number;
  soulDmg: number;
  /** The enemy last hit during Soul Unbound; the echo lands on them. */
  soulTarget: number;
  /** Bleeding from a Crimson Step (ticks left), healing `bleedBy`. */
  bleedT: number;
  bleedBy: number;
  /** Blood mage: draining `drainTarget` (ticks left). */
  drainT: number;
  drainTarget: number;
  /** Transfusions cast this round (every third is empowered). */
  bloodCount: number;
  /** Time kobold: hits in a row on `resoTarget`, and ticks left to land the next one. */
  resoN: number;
  resoT: number;
  resoTarget: number;
  /** Time kobold: Time Skip charges, and ticks until the next one comes back. */
  charges: number;
  chargeT: number;
  /** Time kobold: recent [x, y, hp] samples, oldest first, for Rewind. */
  trail: number[];
  /** Swamp frog: under the water (ticks left): untargetable, can't move or attack. */
  submergeT: number;
  /** Charged by a Ball Lightning: the next Horn Sweep on it zaps. */
  shockT: number;
  /** Storm bull: Thick Hide (ticks left) and the damage taken under it so far. */
  hideT: number;
  hideDmg: number;
  /** Storm bull: Thunderfall's storm (ticks left): every Horn Sweep hit zaps. */
  stormT: number;
  /** Just took a healing pickup: can't take another for these ticks. */
  pickT: number;
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
  /** Chronobomb: bounces left; `life` is the current hop's length and `age` restarts every hop. */
  bounces: number;
}

/** Something on the floor: arrow rain, a sonic sensor, a Cave-In field, a Blasting Charge, a marsh pool or the toad's mark. */
export interface Zone {
  id: number;
  owner: number;
  kind: 'rain' | 'sonic' | 'converge' | 'pulse' | 'marsh' | 'toad';
  x: number;
  y: number;
  /** Ticks left. Rain is still falling while t > RAIN.ticks; a field or a bomb goes off at 0. */
  t: number;
  /** Blasting Charge or lotus bait: the player it's stuck to (it moves with them), -1 if on the floor. */
  target: number;
}

export interface Meteor {
  id: number;
  owner: number;
  x: number;
  y: number;
  t: number;
}

/** A healing pickup lying near the edge of the arena. */
export interface Pickup {
  id: number;
  x: number;
  y: number;
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
  /** Champion picked for each player slot: 2 players (1v1) or 4 (2v2, teams by id % 2). */
  champs: number[];
  /** Index into MAPS. */
  map: number;
  /** A different map every round (off when a map is forced for testing). */
  rotateMaps: boolean;
  phase: Phase;
  phaseT: number;
  round: number;
  roundFrame: number;
  /** Rounds won per team. */
  score: number[];
  /** Winning team of the last finished round, -1 for a draw. */
  lastRoundWinner: number;
  arenaR: number;
  players: Player[];
  projectiles: Projectile[];
  meteors: Meteor[];
  zones: Zone[];
  orb: Orb;
  pickups: Pickup[];
  /** Ticks until the next pickup appears (counts only while fewer than PICKUP.max lie on the map). */
  pickupT: number;
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
  | { type: 'pickupSpawn'; x: number; y: number }
  /** `player` took the pickup at (x, y), healing the area. */
  | { type: 'pickup'; player: number; x: number; y: number }
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
  /** Shade coats its knives (Venom). */
  | { type: 'venom'; player: number; x: number; y: number }
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
  | { type: 'heal'; player: number; amount: number; x: number; y: number }
  /** Tides of Blood bursting with radius r. */
  | { type: 'tides'; player: number; x: number; y: number; power: number }
  /** `player` starts bleeding. */
  | { type: 'bleed'; player: number; x: number; y: number }
  /** A missed Transfusion costs its caster HP. */
  | { type: 'bloodloss'; player: number; amount: number; x: number; y: number }
  /** Time kobold: Time Skip and Rewind jumps. */
  | { type: 'flicker'; player: number; x0: number; y0: number; x: number; y: number }
  | { type: 'recall'; player: number; x0: number; y0: number; x: number; y: number }
  /** Resonance going off on `player`. */
  | { type: 'resonance'; player: number; x: number; y: number }
  | { type: 'converge'; owner: number; x: number; y: number }
  /** A Blasting Charge (or `owner`'s lotus bait) sticking to `player`, and the charge bursting. */
  | { type: 'stick'; player: number; owner: number; x: number; y: number }
  | { type: 'pulse'; owner: number; x: number; y: number }
  /** A Chronobomb bouncing on, and bursting. */
  | { type: 'bounce'; owner: number; x: number; y: number }
  | { type: 'clockBurst'; owner: number; x: number; y: number }
  /** Swamp frog: tongue yank, sinking under the water, surfacing out of it, and the toad bursting up. */
  | { type: 'yank'; player: number; x0: number; y0: number; x: number; y: number }
  | { type: 'submerge'; player: number; x: number; y: number }
  | { type: 'surface'; player: number; x: number; y: number }
  | { type: 'toad'; owner: number; x: number; y: number }
  /** Storm bull: Thick Hide going up, a heavy Horn Sweep, Earthshaker, the Thunderfall landing, and a zap on `player`. */
  | { type: 'hide'; player: number; x: number; y: number }
  | { type: 'heavy'; player: number; x: number; y: number }
  | { type: 'stomp'; player: number; x: number; y: number }
  | { type: 'thunder'; player: number; x: number; y: number }
  | { type: 'shock'; player: number; x: number; y: number }
  /** Romulus scatters into bats (Night Swarm). */
  | { type: 'swarm'; player: number; x: number; y: number }
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
