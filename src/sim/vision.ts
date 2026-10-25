/**
 * Fog of war. Pure functions of the state: they never change it, so they can be
 * used by the renderer, the HUD and the bot alike.
 */
import { MAPS, PLAYER_R, SONIC, VISION_R, type Pillar } from './constants';
import type { GameState, Player } from './types';

/**
 * Where to walk from (x, y) to reach (tx, ty) on foot: straight there, or, with the river
 * in between, to the near end of the best bridge (still inside the arena), then over it.
 */
export function walkTarget(s: GameState, x: number, y: number, tx: number, ty: number): { x: number; y: number } {
  const river = MAPS[s.map].river;
  const side = x >= 0 ? 1 : -1;
  if (!river || (tx >= 0 ? 1 : -1) === side) return { x: tx, y: ty };
  const bank = river.half + PLAYER_R / 2;
  let best: { y: number; half: number } | null = null;
  let bestCost = Infinity;
  for (const b of river.bridges) {
    if (Math.hypot(bank + 30, b.y) > s.arenaR - PLAYER_R - 10) continue;
    const cost = Math.abs(y - b.y) + Math.abs(ty - b.y);
    if (cost < bestCost) {
      bestCost = cost;
      best = b;
    }
  }
  if (!best) return { x: tx, y: ty };
  // Lined up with the bridge: walk over it to the far end; otherwise go to its near end first.
  const aligned = Math.abs(y - best.y) < best.half * 0.6;
  return { x: (aligned ? -side : side) * (bank + 30), y: best.y };
}

/** Pillars and walls of the map being played. */
export function solidsOf(s: GameState): Pillar[] {
  return MAPS[s.map].solids;
}

/** True if none of `solids` blocks the straight line between the two points. */
export function lineClear(x0: number, y0: number, x1: number, y1: number, solids: Pillar[]): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  for (const pl of solids) {
    let t = len2 > 0 ? ((pl.x - x0) * dx + (pl.y - y0) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x0 + dx * t - pl.x;
    const cy = y0 + dy * t - pl.y;
    if (cx * cx + cy * cy < pl.r * pl.r) return false;
  }
  return true;
}

/** Can `viewer` see the floor point (x, y)? */
export function pointVisible(viewer: Player, x: number, y: number, solids: Pillar[]): boolean {
  const dx = x - viewer.x;
  const dy = y - viewer.y;
  if (dx * dx + dy * dy > VISION_R * VISION_R) return false;
  return lineClear(viewer.x, viewer.y, x, y, solids);
}

/** Can anyone on `viewerId`'s team see the floor point (x, y)? Teams share vision. */
export function teamSees(s: GameState, viewerId: number, x: number, y: number): boolean {
  const team = s.players[viewerId].team;
  const solids = solidsOf(s);
  for (const p of s.players) {
    // The knocked out stop scouting (the viewer still sees around itself).
    if (p.team !== team || (p.out && p.id !== viewerId)) continue;
    if (pointVisible(p, x, y, solids)) return true;
  }
  return false;
}

/** Can player `viewerId` see player `targetId` right now? */
export function canSee(s: GameState, viewerId: number, targetId: number): boolean {
  if (viewerId === targetId || s.training) return true;
  const target = s.players[targetId];
  if (target.team === s.players[viewerId].team) return true;
  if (target.stealthT > 0) return false;
  // Sonic arrows see through the fog (not through stealth).
  if (target.revealT > 0 || sensed(s, viewerId, target.x, target.y)) return true;
  return teamSees(s, viewerId, target.x, target.y);
}

/** Inside a sonic sensor of `viewerId`'s team? */
export function sensed(s: GameState, viewerId: number, x: number, y: number): boolean {
  const team = s.players[viewerId].team;
  for (const z of s.zones) {
    if (z.kind !== 'sonic' || s.players[z.owner].team !== team) continue;
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy < SONIC.r * SONIC.r) return true;
  }
  return false;
}
