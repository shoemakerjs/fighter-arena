/**
 * Rollback netcode on top of the deterministic simulation.
 *
 * Every player slot has an input stream. Each tick we simulate immediately with the
 * inputs we produce ourselves (delayed by a couple of frames) and a *prediction*
 * of everyone else's (their last known input). When a real input for an already
 * simulated frame arrives and differs from the prediction, we restore the
 * snapshot of that frame and re-simulate up to the present. Every peer therefore
 * converges on exactly the same state.
 *
 * Topology is a star: guests talk only to the host, which relays every input to
 * everyone else and also produces the inputs of bot-filled slots. The host is the
 * clock everyone syncs to and the authority on a desync.
 */
import { cloneState, createMatch, step } from '../sim/step';
import type { GameEvent, GameState, Input } from '../sim/types';

/** Our input is applied this many frames after it's read (hides most rollbacks). */
const INPUT_DELAY = 2;
/** Never predict further ahead than this; beyond it we wait for the others. */
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

/** Produces a slot's input from the state (the host's bots). */
export interface InputSource {
  think(s: GameState): Input;
}

export interface SessionCallbacks {
  /** An input we produced (ours, or one of the host's bots) for `slot` at `frame`. */
  sendInput(slot: number, frame: number, input: Input): void;
  /** Guest only: our state hash at a frame everyone has confirmed. */
  sendHash(frame: number, hash: number): void;
  /** Host only: our state before `frame`, for the guest in `slot` to adopt. */
  sendSync(slot: number, frame: number, state: GameState): void;
  onDesync(frame: number): void;
}

export interface SessionSetup {
  /** Our own slot. */
  localId: number;
  /** One champion per slot (2 = 1v1, 4 = 2v2). */
  champs: number[];
  /** The host's slot. */
  hostSlot: number;
  /** Slots played by people (the others are bots run by the host). */
  humans: number[];
  /** Host only: the bots of the empty slots. */
  bots?: Map<number, InputSource>;
}

export class RollbackSession {
  /** Number of frames simulated so far; `state` is the state after them. */
  frame = 0;
  state: GameState;
  readonly localId: number;
  readonly isHost: boolean;
  private readonly hostSlot: number;
  private readonly humans: number[];
  private readonly bots: Map<number, InputSource>;
  /** State before simulating frame f (so snapshots[f + 1] is the state after f). */
  private snapshots = new Map<number, GameState>();
  /** Known inputs per slot, by frame. */
  private inputs: Map<number, Input>[];
  /** Latest input heard per slot, used to predict the frames not heard yet. */
  private lastKnown: Input[];
  /** Highest frame received per slot (minus the input delay ≈ their current frame). */
  private heardFrame: number[];
  /** Per slot, its advantage over us as it last reported it (time sync). */
  private reportedAdv: number[];
  /** Predictions used, keyed frame * 8 + slot. */
  private predicted = new Map<number, Input>();
  /** Highest frame for which every slot's input is known. */
  private confirmed: number;
  private rollbackFrom = Infinity;
  private myHashes = new Map<number, number>();
  /** Host: hashes the guests reported, keyed frame * 8 + slot. */
  private theirHashes = new Map<number, number>();
  private synced = new Set<number>();
  rollbacks = 0;
  /** Times we (a guest) adopted the host's state after a desync. */
  resyncs = 0;

  constructor(
    setup: SessionSetup,
    private cb: SessionCallbacks,
  ) {
    this.localId = setup.localId;
    this.hostSlot = setup.hostSlot;
    this.isHost = setup.localId === setup.hostSlot;
    this.humans = setup.humans;
    this.bots = this.isHost ? (setup.bots ?? new Map()) : new Map();
    const n = setup.champs.length;
    this.state = createMatch(setup.champs);
    this.inputs = Array.from({ length: n }, () => new Map<number, Input>());
    this.lastKnown = Array.from({ length: n }, () => NO_INPUT);
    this.heardFrame = Array.from({ length: n }, () => -1);
    this.reportedAdv = Array.from({ length: n }, () => 0);
    // The first INPUT_DELAY frames have no input from anyone.
    for (let f = 0; f < INPUT_DELAY; f++) for (const m of this.inputs) m.set(f, NO_INPUT);
    this.confirmed = INPUT_DELAY - 1;
  }

  /** State one frame back, for render interpolation. */
  get prev(): GameState {
    return this.snapshots.get(this.frame - 1) ?? this.state;
  }

  /** Slots whose inputs we produce: our own, plus the bots if we host. */
  private ownsSlot(slot: number): boolean {
    return slot === this.localId || this.bots.has(slot);
  }

  /** How far we run ahead of `slot` (positive = we're ahead). */
  advantageVs(slot: number): number {
    return this.frame - (this.heardFrame[slot] + 1);
  }

  /**
   * True when we're ahead and should skip a tick so the others can catch up. Guests
   * keep pace with the host; the host keeps pace with every guest.
   */
  shouldWait(): boolean {
    if (this.frame - this.confirmed > MAX_ROLLBACK) return true;
    const peers = this.isHost ? this.humans.filter((s) => s !== this.localId) : [this.hostSlot];
    return peers.some((s) => (this.advantageVs(s) - this.reportedAdv[s]) / 2 >= 1.5);
  }

  /** Time sync: `slot` says it runs `adv` frames ahead of us. */
  onRemoteAdvantage(slot: number, adv: number) {
    this.reportedAdv[slot] = adv;
  }

  onRemoteInput(slot: number, frame: number, input: Input) {
    if (this.ownsSlot(slot)) return;
    const known = this.inputs[slot];
    if (frame > this.heardFrame[slot] + INPUT_DELAY) {
      this.heardFrame[slot] = frame - INPUT_DELAY;
      this.lastKnown[slot] = input;
    }
    if (known.has(frame)) return;
    known.set(frame, input);
    while (this.inputs.every((m) => m.has(this.confirmed + 1))) this.confirmed++;
    if (frame < this.frame) {
      const guess = this.predicted.get(frame * 8 + slot);
      if (!guess || !sameInput(guess, input)) this.rollbackFrom = Math.min(this.rollbackFrom, frame);
    }
  }

  /** Host: a guest's state hash. */
  onRemoteHash(slot: number, frame: number, hash: number) {
    this.theirHashes.set(frame * 8 + slot, hash);
    this.checkHash(slot, frame);
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
    this.produce(this.localId, target, input);
    // The host thinks for the bots on the state it has now (predictions included);
    // whatever they decide is final and sent to everyone like a player's input.
    for (const [slot, bot] of this.bots) this.produce(slot, target, bot.think(this.state));

    const events = this.simulate(this.frame);
    this.prune();
    this.hashConfirmed();
    return events;
  }

  private produce(slot: number, frame: number, input: Input) {
    this.inputs[slot].set(frame, input);
    this.heardFrame[slot] = frame - INPUT_DELAY;
    this.lastKnown[slot] = input;
    this.cb.sendInput(slot, frame, input);
    while (this.inputs.every((m) => m.has(this.confirmed + 1))) this.confirmed++;
  }

  private simulate(f: number): GameEvent[] {
    this.snapshots.set(f, cloneState(this.state));
    const frameInputs = this.inputs.map((known, slot) => {
      const input = known.get(f);
      if (input) {
        this.predicted.delete(f * 8 + slot);
        return input;
      }
      const guess = this.lastKnown[slot];
      this.predicted.set(f * 8 + slot, guess);
      return guess;
    });
    const events = step(this.state, frameInputs);
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
    for (const k of this.predicted.keys()) if (Math.floor(k / 8) <= this.confirmed) this.predicted.delete(k);
    for (const m of this.inputs) for (const k of m.keys()) if (k < keep - 4) m.delete(k);
  }

  /** Hash the state at frames nobody can change any more; guests report theirs to the host. */
  private hashConfirmed() {
    const f = Math.floor((this.confirmed + 1) / HASH_EVERY) * HASH_EVERY;
    if (f <= 0 || this.myHashes.has(f) || f > this.frame) return;
    const snap = f === this.frame ? this.state : this.snapshots.get(f);
    if (!snap) return;
    const h = hashState(snap);
    this.myHashes.set(f, h);
    if (this.isHost) for (const slot of this.humans) this.checkHash(slot, f);
    else this.cb.sendHash(f, h);
  }

  /** Host: compare a guest's hash with ours; on a mismatch hand that guest our state. */
  private checkHash(slot: number, frame: number) {
    const a = this.myHashes.get(frame);
    const b = this.theirHashes.get(frame * 8 + slot);
    if (a === undefined || b === undefined || a === b) return;
    this.cb.onDesync(frame);
    const snap = frame === this.frame ? this.state : this.snapshots.get(frame);
    const key = frame * 8 + slot;
    if (snap && !this.synced.has(key)) {
      this.synced.add(key);
      this.cb.sendSync(slot, frame, snap);
    }
  }
}
