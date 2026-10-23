import type { AbilityId } from '../sim/constants';
import type { HitKind } from '../sim/types';

export const COLORS = {
  bg: '#07090d',
  floorIn: '#232a3b',
  floorOut: '#151a26',
  grid: 'rgba(150, 180, 230, 0.07)',
  rim: '#323c52',
  pillarTop: '#3d465c',
  pillarSide: '#232938',
  players: ['#3be8c8', '#ff4f6d'],
  blast: '#ffb547',
  frost: '#8fd8ff',
  meteor: '#ff7a33',
  steel: '#d7deea',
  earth: '#f0a948',
  shadow: '#b388ff',
  poison: '#7dff6a',
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
  return COLORS.players[owner];
}
