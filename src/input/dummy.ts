import { PILLARS, PLAYER_R, PROJ } from '../sim/constants';
import { BTN, type GameState, type Input } from '../sim/types';

export type DummyMove = 'still' | 'flee' | 'chase';

/** How close a chasing dummy comes: just short of bumping into you. */
const CHASE_STOP = 2 * PLAYER_R + 40;
/** Ticks between the dummy's shots. */
const SHOT_EVERY = 90;

/**
 * Drives the training dummy (player 1) from the training settings: stand in the
 * middle, run away or chase, and optionally shoot a Spark at you now and then.
 */
export class DummyController {
  move: DummyMove = 'still';
  shoot = false;
  private shotT = SHOT_EVERY;

  think(s: GameState): Input {
    const me = s.players[1];
    const foe = s.players[0];
    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    let wx = 0;
    let wy = 0;

    if (this.move === 'still') {
      // Walk back to the middle after being pushed or pulled away.
      const home = Math.hypot(me.x, me.y);
      if (home > 6) {
        wx = -me.x / home;
        wy = -me.y / home;
      }
    } else if (this.move === 'chase') {
      if (d > CHASE_STOP) {
        wx = dx / d;
        wy = dy / d;
      }
    } else {
      wx = -dx / d;
      wy = -dy / d;
      // Near the wall, slide along it instead of pressing into it.
      const r = Math.hypot(me.x, me.y);
      if (r > s.arenaR - 110) {
        const tx = -me.y / r;
        const ty = me.x / r;
        const side = tx * wx + ty * wy >= 0 ? 1 : -1;
        wx = tx * side * 1.2 - (me.x / r) * 0.6;
        wy = ty * side * 1.2 - (me.y / r) * 0.6;
      }
    }

    // Slide around pillars instead of getting stuck on them.
    if (wx !== 0 || wy !== 0) {
      for (const pl of PILLARS) {
        const pd = Math.hypot(me.x - pl.x, me.y - pl.y);
        if (pd < pl.r + PLAYER_R + 30) {
          wx += ((me.x - pl.x) / pd) * 0.8;
          wy += ((me.y - pl.y) / pd) * 0.8;
        }
      }
    }

    let buttons = 0;
    if (this.shoot && --this.shotT <= 0 && d < PROJ.bolt.range - 20) {
      buttons |= BTN.M1;
      this.shotT = SHOT_EVERY;
    }

    return {
      mx: Math.abs(wx) > 0.3 ? Math.sign(wx) : 0,
      my: Math.abs(wy) > 0.3 ? Math.sign(wy) : 0,
      ax: Math.round(foe.x),
      ay: Math.round(foe.y),
      buttons,
    };
  }
}
