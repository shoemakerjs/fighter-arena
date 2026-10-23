import type { Sfx } from '../render/audio';

export interface SettingsHooks {
  onBack(): void;
}

const $ = (id: string) => document.getElementById(id)!;

const VOLUME_KEY = 'arena.sfxVolume';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the setting just won't survive a reload.
  }
}

/** Settings screen from the home nav. Applies the saved effects volume on startup. */
export class Settings {
  private slider = $('sfx-volume') as HTMLInputElement;

  constructor(
    private sfx: Sfx,
    hooks: SettingsHooks,
  ) {
    const saved = Number(load(VOLUME_KEY));
    const pct = load(VOLUME_KEY) !== null && Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : 100;
    this.slider.value = String(pct);
    this.apply(pct);

    this.slider.addEventListener('input', () => {
      const v = Number(this.slider.value);
      this.apply(v);
      save(VOLUME_KEY, String(v));
      // Let the player hear the new level.
      this.sfx.unlock();
      this.sfx.play('hit');
    });
    $('settings-back').addEventListener('click', () => hooks.onBack());
  }

  open() {
    $('settings').classList.remove('hidden');
  }

  close() {
    $('settings').classList.add('hidden');
  }

  private apply(pct: number) {
    this.sfx.setVolume(pct / 100);
    $('sfx-volume-value').textContent = `${pct}%`;
    // Filled part of the track (see .slider in style.css).
    this.slider.style.setProperty('--fill', `${pct}%`);
  }
}
