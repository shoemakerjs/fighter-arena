import SimpleBar from 'simplebar';
import 'simplebar/dist/simplebar.css';
import { CHAMPIONS } from '../sim/constants';
import { ROSTER } from './roster';
import { brushRing } from './rough';

/** `browse` is the Characters page from the home nav: look around, no picking. `training` has no enemy. */
export type SelectMode = 'bot' | 'online' | 'browse' | 'training';
export type EnemyState = 'waiting' | 'locked';

export interface SelectHooks {
  /** The player locked in this champion. */
  onLock(champ: number): void;
  onBack(): void;
}

/** Seconds to pick online before the current choice is locked automatically. */
const PICK_SECONDS = 30;
const KEYS = ['LMB', 'RMB / F', 'Space', 'Q', 'E', 'R'];

/** One row per ability: name, what it does, its key (also used by the training overlay). */
export function abilityList(champ: number): string {
  return CHAMPIONS[champ].abilities.map((a, i) => `<div class="ability"><span class="what"><b>${a.name}</b> — ${a.desc}</span><span class="key">${KEYS[i]}</span></div>`).join('');
}

const SPINNER = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12ZM3.06809 12C3.06809 16.933 7.06704 20.9319 12 20.9319C16.933 20.9319 20.9319 16.933 20.9319 12C20.9319 7.06704 16.933 3.06809 12 3.06809C7.06704 3.06809 3.06809 7.06704 3.06809 12Z" fill="#363432"/>
  <path d="M24 12C24 10.4241 23.6896 8.86371 23.0866 7.4078C22.4835 5.95189 21.5996 4.62902 20.4853 3.51472C19.371 2.40042 18.0481 1.5165 16.5922 0.913445C15.1363 0.310389 13.5759 0 12 0L12 3.1026C13.1684 3.1026 14.3254 3.33274 15.4049 3.77987C16.4844 4.22701 17.4652 4.88239 18.2914 5.70859C19.1176 6.53479 19.773 7.51563 20.2201 8.59511C20.6673 9.67459 20.8974 10.8316 20.8974 12H24Z" fill="#7CC7FF"/>
</svg>`;
const CHECK = `<svg width="24" height="24" viewBox="-2 -2 24 24" fill="none" aria-hidden="true">
  <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="#4AAB19"/>
</svg>`;

const $ = (id: string) => document.getElementById(id)!;

/** Fill a status chip with the spinner (waiting) or the green check (done). */
export function setStatusChip(chip: HTMLElement, done: boolean, title?: string) {
  chip.classList.toggle('ok', done);
  chip.classList.toggle('waiting', !done);
  chip.innerHTML = done ? CHECK : SPINNER;
  if (title) chip.title = title;
}

/** Champion select screen (Figma "Select your character"), shared by bot and online play. */
export class ChampionSelect {
  champ = 0;
  mode: SelectMode = 'bot';
  locked = false;
  private deadline = 0;
  private ticker = 0;
  /** Width / height of each key art, once loaded. */
  private aspects = new Map<string, number>();

  constructor(private hooks: SelectHooks) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7cc7ff';
    document.documentElement.style.setProperty('--ring', `url(${brushRing(110, 24, 10, 12, accent)})`);
    this.buildRoster();
    // Custom scrollbar for the roster column; its thumb is brush-painted like the buttons (see rough.ts).
    new SimpleBar($('roster'), { autoHide: false });
    for (const thumb of $('roster').querySelectorAll('.simplebar-scrollbar')) thumb.classList.add('brush');
    $('lock-in').addEventListener('click', () => this.lockIn());
    $('select-back').addEventListener('click', () => this.hooks.onBack());
    window.addEventListener('resize', () => this.isOpen && this.frameArt());
  }

  open(mode: SelectMode, champ: number) {
    this.mode = mode;
    this.champ = champ;
    this.locked = false;
    $('select').classList.remove('hidden');
    $('select').classList.toggle('browse', mode === 'browse');
    $('select').classList.toggle('training', mode === 'training');
    $('select-title').textContent = mode === 'browse' ? 'Characters' : 'Select your character';
    $('select-timer').classList.toggle('hidden', mode !== 'online');
    this.setEnemy(mode === 'bot' ? 'locked' : 'waiting');
    clearInterval(this.ticker);
    if (mode === 'online') {
      this.deadline = performance.now() + PICK_SECONDS * 1000;
      this.ticker = window.setInterval(() => this.tick(), 250);
      this.tick();
    }
    this.render();
  }

  close() {
    clearInterval(this.ticker);
    $('select').classList.add('hidden');
  }

  get isOpen() {
    return !$('select').classList.contains('hidden');
  }

  setEnemy(state: EnemyState) {
    setStatusChip($('enemy-status'), state === 'locked', state === 'locked' ? 'Locked in' : 'Picking…');
  }

  private lockIn() {
    if (this.locked) return;
    this.locked = true;
    clearInterval(this.ticker);
    this.render();
    this.hooks.onLock(this.champ);
  }

  /**
   * The art covers the screen anchored to the right. On narrow or portrait screens
   * that crops the figure away (under the dark left side, or off the right edge for
   * mirrored art), so slide the image just enough to bring the figure (ROSTER
   * focus) into the visible part.
   */
  private frameArt() {
    const r = ROSTER[this.champ];
    const aspect = this.aspects.get(r.art);
    if (aspect === undefined) {
      const img = new Image();
      img.onload = () => {
        this.aspects.set(r.art, img.naturalWidth / img.naturalHeight);
        if (ROSTER[this.champ] === r) this.frameArt();
      };
      img.src = r.art;
      return;
    }
    const art = $('select-art');
    const W = art.clientWidth;
    const H = art.clientHeight;
    if (!W || !H) return;
    const left = art.getBoundingClientRect().left;
    const imgW = Math.max(W, H * aspect);
    const flip = r.flip ? -1 : 1;
    // Screen x (inside the art box) of the figure for a given image offset.
    const figureAt = (offset: number) => {
      const x = offset + r.focus * imgW;
      return r.flip ? W - x : x;
    };
    // Visible area starts right of the roster and the darkest part of the shade.
    const rosterRight = $('roster').getBoundingClientRect().right - left;
    const freeLeft = Math.max(rosterRight, window.innerWidth * 0.3 - left);
    // Keep the figure inside this band; wide screens already are, so they don't move.
    const free = W - freeLeft;
    const lo = freeLeft + free * 0.35;
    const hi = W - free * 0.15;
    let offset = W - imgW;
    const fx = figureAt(offset);
    const target = Math.max(lo, Math.min(hi, fx));
    offset = Math.min(0, Math.max(W - imgW, offset + flip * (target - fx)));
    art.style.backgroundPosition = `${offset}px ${r.artY ?? 'center'}`;
  }

  private tick() {
    const left = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000));
    const timer = $('select-timer');
    timer.textContent = `${left}s`;
    timer.classList.toggle('low', left <= 5);
    if (left === 0) this.lockIn();
  }

  private buildRoster() {
    // One group per category, in roster order; its champions share a row.
    const groups = new Map<string, number[]>();
    ROSTER.forEach((r, i) => groups.set(r.category, [...(groups.get(r.category) ?? []), i]));
    const tile = (i: number) => {
      const r = ROSTER[i];
      return `
          <button class="champ-tile" data-champ="${i}">
            <span class="portrait-wrap">
              <span class="portrait${r.flip ? ' flip' : ''}" style="background-image: url(${r.art}); background-position: ${r.portrait}"></span>
              <span class="ring"></span>
            </span>
            <span class="champ-name">${r.hero}</span>
          </button>`;
    };
    $('roster').innerHTML = [...groups]
      .map(
        ([category, champs]) => `
      <div class="roster-group">
        <span class="roster-label">${category}</span>
        <div class="roster-row">${champs.map(tile).join('')}
        </div>
      </div>`,
      )
      .join('');
    for (const tile of document.querySelectorAll<HTMLButtonElement>('.champ-tile')) {
      tile.addEventListener('click', () => {
        if (this.locked) return;
        this.champ = Number(tile.dataset.champ);
        this.render();
      });
    }
  }

  private render() {
    const r = ROSTER[this.champ];
    const c = CHAMPIONS[this.champ];
    const art = $('select-art');
    art.style.backgroundImage = `url(${r.art})`;
    art.style.left = r.artShift ?? '0';
    art.classList.toggle('flip', r.flip);
    this.frameArt();
    for (const tile of document.querySelectorAll<HTMLElement>('.champ-tile')) {
      tile.classList.toggle('active', Number(tile.dataset.champ) === this.champ);
      tile.classList.toggle('locked', this.locked);
    }
    // Bring the picked champion (with its category label) into view. Next frame, once
    // SimpleBar has sized the scroll area of a screen that may have just been shown.
    requestAnimationFrame(() => document.querySelector('.champ-tile.active')?.closest('.roster-group')?.scrollIntoView({ block: 'nearest' }));
    const role = c.role[0].toUpperCase() + c.role.slice(1);
    $('champ-info').innerHTML = `
      <p class="role">${role} · ${c.hp} HP</p>
      <h2 class="display hero">${r.hero}</h2>
      <p class="lore">${r.lore}</p>
      <div class="abilities">
        ${abilityList(this.champ)}
      </div>`;
    const lock = $('lock-in') as HTMLButtonElement;
    lock.disabled = this.locked;
    lock.textContent = this.locked ? 'Locked' : 'Lock in';
  }
}
