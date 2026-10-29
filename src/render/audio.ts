export type SfxName = 'bolt' | 'blast' | 'frost' | 'meteorCast' | 'hit' | 'bigHit' | 'block' | 'boom' | 'dash' | 'counter' | 'orb' | 'ko' | 'tick' | 'fight' | 'impact' | 'slash' | 'hook' | 'whirl' | 'perrieBlast' | 'rusticRewind';

/**
 * Recorded sounds in public/sound, loaded on unlock. `fallback` is the synth sound
 * played until the file has loaded (or if it can't be).
 */
const SAMPLES: Partial<Record<SfxName, { url: string; gain: number; fallback: SfxName }>> = {
  perrieBlast: { url: './sound/perrie/blast.m4a', gain: 0.7, fallback: 'blast' },
  rusticRewind: { url: './sound/rustic/rewind.m4a', gain: 0.7, fallback: 'counter' },
};

/** Tiny Web Audio synth (every sound generated), plus the few recorded samples above. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private samples = new Map<SfxName, AudioBuffer>();
  private lastPlayed = new Map<SfxName, number>();
  private volume = 1;
  muted = false;

  /** Effects volume, 0..1 (the Settings slider). */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = 0.32 * this.volume;
  }

  /** Must be called from a user gesture before the first sound. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32 * this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.loadSamples(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private loadSamples(ctx: AudioContext) {
    for (const [name, s] of Object.entries(SAMPLES) as [SfxName, { url: string }][]) {
      fetch(s.url)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => this.samples.set(name, buf))
        .catch((err) => console.warn(`Sound ${s.url} failed to load`, err));
    }
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.03) return;
    this.lastPlayed.set(name, now);

    const sample = SAMPLES[name];
    if (sample) {
      const buf = this.samples.get(name);
      if (!buf) return this.play(sample.fallback);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = sample.gain;
      src.connect(g).connect(this.master!);
      src.start();
      return;
    }

    switch (name) {
      case 'bolt':
        this.tone(880, 1320, 0.07, 'triangle', 0.14);
        break;
      case 'blast':
        this.tone(220, 90, 0.25, 'sawtooth', 0.16);
        this.noise(0.18, 0.18, 900);
        break;
      case 'frost':
        this.tone(1400, 700, 0.18, 'sine', 0.14);
        this.tone(2100, 1100, 0.14, 'sine', 0.06);
        break;
      case 'meteorCast':
        this.tone(160, 520, 0.35, 'sawtooth', 0.1);
        break;
      case 'hit':
        this.noise(0.07, 0.3, 2400);
        this.tone(320, 180, 0.08, 'square', 0.08);
        break;
      case 'bigHit':
        this.noise(0.16, 0.45, 1400);
        this.tone(140, 60, 0.2, 'square', 0.16);
        break;
      case 'block':
        this.tone(1200, 1800, 0.12, 'triangle', 0.18);
        this.tone(1800, 2400, 0.2, 'sine', 0.1);
        break;
      case 'boom':
        this.noise(0.5, 0.6, 500);
        this.tone(90, 35, 0.5, 'sine', 0.4);
        break;
      case 'dash':
        this.noise(0.16, 0.22, 3000, 600);
        break;
      case 'counter':
        this.tone(600, 900, 0.1, 'triangle', 0.1);
        break;
      case 'orb':
        this.tone(660, 990, 0.12, 'sine', 0.16);
        this.tone(990, 1320, 0.22, 'sine', 0.12, 0.08);
        break;
      case 'ko':
        this.noise(0.7, 0.5, 700);
        this.tone(200, 40, 0.8, 'sawtooth', 0.22);
        break;
      case 'tick':
        this.tone(660, 660, 0.08, 'square', 0.08);
        break;
      case 'fight':
        this.tone(440, 880, 0.25, 'square', 0.12);
        this.tone(660, 1320, 0.3, 'triangle', 0.1, 0.05);
        break;
      case 'impact':
        this.noise(0.05, 0.08, 1800);
        break;
      case 'slash':
        this.noise(0.12, 0.25, 4200, 900);
        break;
      case 'hook':
        this.tone(300, 900, 0.16, 'square', 0.08);
        this.noise(0.1, 0.12, 5000, 2000);
        break;
      case 'whirl':
        this.noise(0.14, 0.18, 2600, 1200);
        this.tone(220, 330, 0.12, 'triangle', 0.06);
        break;
    }
  }

  private tone(from: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, freqTo = freq) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
