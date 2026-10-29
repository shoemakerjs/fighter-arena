import type { AbilityId } from '../sim/constants';
import type { HitKind } from '../sim/types';

let viewer = 0;

/** The team the viewer plays on (team = id % 2): colors are drawn relative to it. */
export function setViewerTeam(team: number) {
  viewer = team;
}

export function viewerTeam(): number {
  return viewer;
}

/** A player's color as the viewer sees it: your side is always teal, the enemy always red. */
export function playerColor(id: number): string {
  return COLORS.players[id % 2 === viewer ? 0 : 1];
}

export const COLORS = {
  bg: '#07090d',
  floorIn: '#232a3b',
  floorOut: '#151a26',
  grid: 'rgba(150, 180, 230, 0.07)',
  rim: '#323c52',
  pillarTop: '#3d465c',
  pillarSide: '#232938',
  /** Indexed by player id: teams alternate (2v2: 0 and 2 are teal, 1 and 3 red). In a match use playerColor, which turns them to the viewer. */
  players: ['#3be8c8', '#ff4f6d', '#3be8c8', '#ff4f6d'],
  blast: '#ffb547',
  frost: '#8fd8ff',
  meteor: '#ff7a33',
  steel: '#d7deea',
  earth: '#f0a948',
  shadow: '#b388ff',
  poison: '#7dff6a',
  vine: '#78c84a',
  sonic: '#e6a8ff',
  longshot: '#f2e6a0',
  /** Sozuki's steel: katana cuts, the crescent and the deflect. */
  edge: '#c9d6f2',
  spirit: '#8f8cff',
  /** Rustic's time magic. */
  chrono: '#a8ff4a',
  /** Lotan's bog glow (submerge, marsh, the toad) and its tongue. */
  bog: '#3d9bff',
  tongue: '#ff7aa8',
  /** Kro'aw's storm: Bellow, zaps and Thunderfall. */
  storm: '#7fd4ff',
  /** The blood mage's crimson, and green for heals. */
  crimson: '#d4203f',
  heal: '#5dff8f',
  blood: '#ff2d55',
  energy: '#ffd54a',
  orb: '#ffd166',
  text: '#eef2fb',
  muted: '#8792a8',
  danger: '#ff3b4f',
};

export const FONT = '"Prompt", system-ui, sans-serif';
/** Display face for big HUD text (names, timer, banners), as in the menus. */
export const DISPLAY = '"Pirata One", serif';

/** Signature color of an ability or hit; basic attacks use the owner's team color. */
export function abilityColor(id: AbilityId | HitKind, owner: number): string {
  if (id === 'blast') return COLORS.blast;
  if (id === 'frost') return COLORS.frost;
  if (id === 'meteor') return COLORS.meteor;
  if (id === 'hook') return COLORS.steel;
  if (id === 'rift' || id === 'leap') return COLORS.earth;
  if (id === 'mark' || id === 'blink' || id === 'smoke') return COLORS.shadow;
  if (id === 'poison') return COLORS.poison;
  if (id === 'execute') return COLORS.blood;
  if (id === 'snare' || id === 'rain' || id === 'vault') return COLORS.vine;
  if (id === 'sonic') return COLORS.sonic;
  if (id === 'longshot') return COLORS.longshot;
  if (id === 'tempest' || id === 'crescent' || id === 'blade' || id === 'deflect') return COLORS.edge;
  if (id === 'soul' || id === 'fate') return COLORS.spirit;
  if (id === 'transfusion' || id === 'step' || id === 'bleed' || id === 'tides' || id === 'drain' || id === 'swarm') return COLORS.crimson;
  if (id === 'tongue') return COLORS.tongue;
  if (id === 'lily' || id === 'submerge' || id === 'marsh' || id === 'toad') return COLORS.bog;
  if (id === 'bellow' || id === 'thunder' || id === 'shock' || id === 'stomp' || id === 'charge' || id === 'hide') return COLORS.storm;
  if (id === 'clock' || id === 'flicker' || id === 'converge' || id === 'recall' || id === 'pulse' || id === 'resonance') return COLORS.chrono;
  return playerColor(owner);
}
