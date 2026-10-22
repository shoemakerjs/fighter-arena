import type { GameState, Player, Vec } from '../sim/types';
import type { Fx } from './fx';

/** Screen space reserved for the HUD above and below the arena. */
export const HUD_TOP = 66;
export const HUD_BOTTOM = 104;

export interface DrawOptions {
  /** Player whose HUD is shown, or null for the attract mode behind the menu. */
  localId: number | null;
  /** Mouse position in CSS pixels. */
  cursor: Vec | null;
}

/** Draws the game world. The HUD is drawn separately on top (see Hud). */
export interface WorldView {
  resize(w: number, h: number, dpr: number): void;
  screenToWorld(sx: number, sy: number): Vec;
  /** World point (sim x/y plus height above the floor) → CSS pixels. */
  worldToScreen(x: number, y: number, h: number): Vec;
  render(prev: GameState, cur: GameState, alpha: number, fx: Fx, dt: number, opts: DrawOptions): void;
}

export function lerpPlayer(a: Player, b: Player, t: number): Player {
  // A teleport (new round) shouldn't be smeared across a frame.
  if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) return b;
  return { ...b, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.round(Math.max(0, Math.min(255, v)));
  });
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}
