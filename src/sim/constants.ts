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
export const SLOT_KEYS = ['LPM', 'PPM', 'SPACJA', 'Q', 'E', 'R'];
export const SLOT_BUTTONS = [BTN.M1, BTN.M2, BTN.SPACE, BTN.Q, BTN.E, BTN.R];

export type AbilityId =
  | 'bolt' | 'blast' | 'dash' | 'counter' | 'frost' | 'meteor'
  | 'slash' | 'hook' | 'leap' | 'cry' | 'whirl' | 'rift'
  | 'dagger' | 'mark' | 'blink' | 'smoke' | 'poison' | 'execute';

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

export const CHAMP = { MAGE: 0, WARRIOR: 1, ASSASSIN: 2 } as const;

export const CHAMPIONS: ChampionDef[] = [
  {
    name: 'Mag',
    role: 'dystans i kontrola',
    hp: 150,
    speed: 3.1,
    abilities: [
      { id: 'bolt', name: 'Iskra', desc: 'podstawowy pocisk, przytrzymaj', cooldown: 4, cast: 14, castSlow: 0.6, energyCost: 0 },
      { id: 'blast', name: 'Wybuch', desc: 'odrzuca i przerywa rzucanie', cooldown: 300, cast: 32, castSlow: 0.35, energyCost: 0 },
      { id: 'dash', name: 'Zryw', desc: 'doskok do kursora, anuluje rzucanie', cooldown: 360, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'counter', name: 'Kontra', desc: 'blokuje trafienie, daje energię i przyspieszenie', cooldown: 480, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'frost', name: 'Szron', desc: 'spowalnia przeciwnika', cooldown: 420, cast: 18, castSlow: 0.5, energyCost: 0 },
      { id: 'meteor', name: 'Meteor', desc: 'obszar z opóźnieniem, 100 energii', cooldown: 60, cast: 20, castSlow: 0.3, energyCost: 100 },
    ],
  },
  {
    name: 'Wojownik',
    role: 'walka wręcz i inicjacja',
    hp: 175,
    speed: 3.4,
    abilities: [
      { id: 'slash', name: 'Cięcie', desc: 'cios toporem przed sobą, przytrzymaj', cooldown: 6, cast: 12, castSlow: 0.5, energyCost: 0 },
      { id: 'hook', name: 'Łańcuch', desc: 'przyciąga trafionego przeciwnika', cooldown: 360, cast: 20, castSlow: 0.4, energyCost: 0 },
      { id: 'leap', name: 'Skok', desc: 'skok do kursora; w powietrzu nietrafialny', cooldown: 420, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'cry', name: 'Okrzyk', desc: 'odpycha wszystko wokół, przerywa rzucanie', cooldown: 480, cast: 6, castSlow: 0.2, energyCost: 0 },
      { id: 'whirl', name: 'Wir', desc: 'wirujesz, raniąc wszystko obok', cooldown: 540, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'rift', name: 'Rozłam', desc: 'fala uderzeniowa w linii, 100 energii', cooldown: 60, cast: 24, castSlow: 0.2, energyCost: 100 },
    ],
  },
  {
    name: 'Cień',
    role: 'zabójca: znaki, niewidzialność, egzekucja',
    hp: 125,
    speed: 3.4,
    abilities: [
      { id: 'dagger', name: 'Sztylet', desc: 'szybkie rzuty na krótki dystans, przytrzymaj', cooldown: 8, cast: 8, castSlow: 0.7, energyCost: 0 },
      { id: 'mark', name: 'Znak', desc: 'naznacza wroga; następne trafienie zadaje +10', cooldown: 300, cast: 16, castSlow: 0.5, energyCost: 0 },
      { id: 'blink', name: 'Krok cienia', desc: 'natychmiastowa teleportacja do kursora', cooldown: 420, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'smoke', name: 'Zasłona', desc: 'niewidzialność i przyspieszenie na 2 s; atak ją zdejmuje', cooldown: 540, cast: 0, castSlow: 1, energyCost: 0 },
      { id: 'poison', name: 'Jad', desc: 'zatruty sztylet: obrażenia przez 2 s', cooldown: 420, cast: 12, castSlow: 0.6, energyCost: 0 },
      { id: 'execute', name: 'Egzekucja', desc: 'przenika przez wroga; x2 obrażeń poniżej 25% HP, 100 energii', cooldown: 60, cast: 10, castSlow: 0.3, energyCost: 100 },
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
  bolt: { speed: 13, r: 9, range: 580, dmg: 8, energy: 8, kb: 0, slowMul: 1, slowT: 0 },
  blast: { speed: 10, r: 16, range: 620, dmg: 20, energy: 12, kb: 11, slowMul: 1, slowT: 0 },
  frost: { speed: 11, r: 12, range: 520, dmg: 10, energy: 10, kb: 0, slowMul: 0.5, slowT: 100 },
  hook: { speed: 15, r: 10, range: 470, dmg: 12, energy: 10, kb: -22, slowMul: 1, slowT: 0 },
  dagger: { speed: 14, r: 7, range: 300, dmg: 5, energy: 7, kb: 0, slowMul: 1, slowT: 0 },
  mark: { speed: 14, r: 11, range: 500, dmg: 6, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
  poison: { speed: 15, r: 9, range: 420, dmg: 4, energy: 10, kb: 0, slowMul: 1, slowT: 0 },
};

// Mage
export const DASH = { ticks: 12, speed: 16 };
export const COUNTER = { ticks: 48, slow: 0.4, energy: 20, haste: 70 };
export const METEOR = { range: 480, delay: 54, r: 115, dmg: 32, kb: 12 };

// Warrior
/** Hits when the target's center is within 2*PLAYER_R + reach and in front (dot >= minDot). */
export const SLASH = { reach: 52, minDot: 0.45, dmg: 9, energy: 10 };
export const LEAP = { ticks: 22, range: 280, r: 85, dmg: 14, energy: 10, kb: 6 };
export const CRY = { r: 125, dmg: 8, kb: 13, energy: 8 };
export const WHIRL = { ticks: 60, every: 12, r: 82, dmg: 4, energy: 4, speed: 0.9 };
export const RIFT = { len: 360, half: 42, dmg: 30, kb: 11 };

// Assassin
export const MARK = { ticks: 180, bonus: 10 };
export const BLINK = { range: 230 };
export const SMOKE = { ticks: 120, speed: 1.3 };
export const POISON = { ticks: 120, every: 20, dmg: 2 };
/** Dash through the target; double damage if it's at or below `threshold` of max HP. */
export const EXECUTE = { ticks: 14, range: 260, dmg: 16, threshold: 0.25 };
