/**
 * Fog of war. Pure functions of the state: they never change it, so they can be
 * used by the renderer, the HUD and the bot alike.
 */
import { PILLARS, SONIC, VISION_R } from './constants';
import type { GameState, Player } from './types';

/** True if no pillar blocks the straight line between the two points. */
export function lineClear(x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  for (const pl of PILLARS) {
    let t = len2 > 0 ? ((pl.x - x0) * dx + (pl.y - y0) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x0 + dx * t - pl.x;
    const cy = y0 + dy * t - pl.y;
    if (cx * cx + cy * cy < pl.r * pl.r) return false;
  }
  return true;
}

/** Can `viewer` see the floor point (x, y)? */
export function pointVisible(viewer: Player, x: number, y: number): boolean {
  const dx = x - viewer.x;
  const dy = y - viewer.y;
  if (dx * dx + dy * dy > VISION_R * VISION_R) return false;
  return lineClear(viewer.x, viewer.y, x, y);
}

/** Can player `viewerId` see player `targetId` right now? */
export function canSee(s: GameState, viewerId: number, targetId: number): boolean {
  if (viewerId === targetId) return true;
  const target = s.players[targetId];
  if (target.stealthT > 0) return false;
  // Sonic arrows see through the fog (not through stealth).
  if (target.revealT > 0 || sensed(s, viewerId, target.x, target.y)) return true;
  return pointVisible(s.players[viewerId], target.x, target.y);
}

/** Inside one of `viewerId`'s sonic sensors? */
export function sensed(s: GameState, viewerId: number, x: number, y: number): boolean {
  for (const z of s.zones) {
    if (z.kind !== 'sonic' || z.owner !== viewerId) continue;
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy < SONIC.r * SONIC.r) return true;
  }
  return false;
}
