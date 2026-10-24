/**
 * Rollback netcode on top of the deterministic simulation.
 *
 * Each tick we simulate immediately with our own input (delayed by a couple of
 * frames) and a *prediction* of the opponent's input (their last known one).
 * When their real input for an already simulated frame arrives and differs from
 * the prediction, we restore the snapshot of that frame and re-simulate up to
 * the present. Both peers therefore converge on exactly the same state.
 */
import { cloneState, createMatch, step } from '../sim/step';
import type { GameEvent, GameState, Input } from '../sim/types';

/** Our input is applied this many frames after it's read (hides most rollbacks). */
const INPUT_DELAY = 2;
/** Never predict further ahead than this; beyond it we wait for the opponent. */
const MAX_ROLLBACK = 15;
/** Compare state hashes this often to detect desyncs. */
const HASH_EVERY = 120;
/** Keep snapshots and inputs this many frames back, so a resync from the host can be replayed. */
const RETAIN = 600;

const NO_INPUT: Input = { mx: 0, my: 0, ax: 0, ay: 0, buttons: 0 };

function sameInput(a: Input, b: Input): boolean {
  return a.mx === b.mx && a.my === b.my && a.ax === b.ax && a.ay === b.ay && a.buttons === b.buttons;
}

/** FNV-1a over the JSON of the state — cheap enough every couple of seconds. */
export function hashState(s: GameState): number {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface SessionCallbacks {
  sendInput(frame: number, input: Input, adv: number): void;
  sendHash(frame: number, hash: number): void;
  /** Host only: send our state before `frame` for the guest to adopt. */
  sendSync(frame: number, state: GameState): void;
  onDesync(frame: number): void;
}

export class RollbackSession {
  /** Number of frames simulated so far; `state` is the state after them. */
  frame = 0;
  state: GameState;
  /** State before simulating frame f (so snapshots[f + 1] is the state after f). */
  private snapshots = new Map<number, GameState>();
  private local = new Map<number, Input>();
  private remote = new Map<number, Input>();
  /** The remote input we used for frames we had to predict. */
  private predicted = new Map<number, Input>();
  /** Highest frame for which every remote input up to it is known. */
  private confirmed = -1;
  private lastRemote: Input = NO_INPUT;
  private rollbackFrom = Infinity;
  private remoteAdv = 0;
  private remoteFrame = -1;
  private myHashes = new Map<number, number>();
  private theirHashes = new Map<number, number>();
  private synced = new Set<number>();
  rollbacks = 0;
  /** Times the guest adopted the host's state after a desync. */
  resyncs = 0;

  constructor(
    readonly localId: number,
    champs: number[],
    private cb: SessionCallbacks,
  ) {
    this.state = createMatch(champs);
    // The first INPUT_DELAY frames have no input from anyone.
    for (let f = 0; f < INPUT_DELAY; f++) {
      this.local.set(f, NO_INPUT);
      this.remote.set(f, NO_INPUT);
    }
    this.confirmed = INPUT_DELAY - 1;
  }

  /** State one frame back, for render interpolation. */
  get prev(): GameState {
    return this.snapshots.get(this.frame - 1) ?? this.state;
  }

  /** How far we run ahead of the opponent (positive = we're ahead). */
  get advantage(): number {
    return this.frame - (this.remoteFrame + 1);
  }

  /** True when we're ahead and should skip a tick so the opponent can catch up. */
  shouldWait(): boolean {
    if (this.frame - this.confirmed > MAX_ROLLBACK) return true;
    return (this.advantage - this.remoteAdv) / 2 >= 1.5;
  }

  onRemoteInput(frame: number, input: Input, adv: number) {
    this.remoteAdv = adv;
    this.remoteFrame = Math.max(this.remoteFrame, frame - INPUT_DELAY);
    if (this.remote.has(frame)) return;
    this.remote.set(frame, input);
    while (this.remote.has(this.confirmed + 1)) this.confirmed++;
    if (frame < this.frame) {
      const guess = this.predicted.get(frame);
      if (!guess || !sameInput(guess, input)) this.rollbackFrom = Math.min(this.rollbackFrom, frame);
    }
    if (frame >= this.confirmed) this.lastRemote = this.remote.get(this.confirmed) ?? this.lastRemote;
  }

  onRemoteHash(frame: number, hash: number) {
    this.theirHashes.set(frame, hash);
    this.checkHash(frame);
  }

  /**
   * Guest: the host's state before `frame` after a desync. Adopt it and replay our
   * recorded inputs from there; the host is the authority.
   */
  onRemoteSync(frame: number, state: GameState) {
    if (frame >= this.frame || !this.snapshots.has(frame)) return;
    this.snapshots.set(frame, cloneState(state));
    this.myHashes.set(frame, hashState(state));
    this.rollbackFrom = Math.min(this.rollbackFrom, frame);
    this.resyncs++;
  }

  /** Simulate one frame with our freshly read input. Returns its events. */
  tick(input: Input): GameEvent[] {
    this.resolveRollback();

    const target = this.frame + INPUT_DELAY;
    this.local.set(target, input);
    this.cb.sendInput(target, input, this.advantage);

    const events = this.simulate(this.frame);
    this.prune();
    this.hashConfirmed();
    return events;
  }

  private simulate(f: number): GameEvent[] {
    this.snapshots.set(f, cloneState(this.state));
    const mine = this.local.get(f) ?? NO_INPUT;
    let theirs = this.remote.get(f);
    if (!theirs) {
      theirs = this.lastRemote;
      this.predicted.set(f, theirs);
    } else {
      this.predicted.delete(f);
    }
    const inputs = this.localId === 0 ? [mine, theirs] : [theirs, mine];
    const events = step(this.state, inputs);
    this.frame = f + 1;
    return events;
  }

  private resolveRollback() {
    if (this.rollbackFrom === Infinity) return;
    const from = this.rollbackFrom;
    this.rollbackFrom = Infinity;
    const snap = this.snapshots.get(from);
    if (!snap) return;
    const end = this.frame;
    this.state = cloneState(snap);
    // Re-simulating: the effects of these frames were already shown once.
    for (let f = from; f < end; f++) this.simulate(f);
    this.rollbacks++;
  }

  private prune() {
    const keep = Math.min(this.confirmed, this.frame - RETAIN) - 1;
    for (const k of this.snapshots.keys()) if (k < keep) this.snapshots.delete(k);
    for (const k of this.predicted.keys()) if (k <= this.confirmed) this.predicted.delete(k);
    for (const m of [this.local, this.remote]) for (const k of m.keys()) if (k < keep - 4) m.delete(k);
  }

  /** Hash the state at frames both sides can no longer change. */
  private hashConfirmed() {
    const f = Math.floor((this.confirmed + 1) / HASH_EVERY) * HASH_EVERY;
    if (f <= 0 || this.myHashes.has(f) || f > this.frame) return;
    const snap = f === this.frame ? this.state : this.snapshots.get(f);
    if (!snap) return;
    const h = hashState(snap);
    this.myHashes.set(f, h);
    this.cb.sendHash(f, h);
    this.checkHash(f);
  }

  private checkHash(frame: number) {
    const a = this.myHashes.get(frame);
    const b = this.theirHashes.get(frame);
    if (a === undefined || b === undefined || a === b) return;
    this.cb.onDesync(frame);
    // The host is the authority: hand the guest our state from that frame.
    const snap = frame === this.frame ? this.state : this.snapshots.get(frame);
    if (this.localId === 0 && snap && !this.synced.has(frame)) {
      this.synced.add(frame);
      this.cb.sendSync(frame, snap);
    }
  }
}
