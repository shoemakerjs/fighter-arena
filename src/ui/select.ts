import SimpleBar from 'simplebar';
import 'simplebar/dist/simplebar.css';
import { CHAMPIONS } from '../sim/constants';
import { abilityIcon } from '../render/hud';
import { ROSTER } from './roster';
import { release, roughen, tornFrame, tornSquare } from './rough';

/** `browse` is the Characters page from the home nav: look around, no picking. `training` has no enemy. */
export type SelectMode = 'bot' | 'online' | 'browse' | 'training';

export interface SelectHooks {
  /** The player locked in this champion. */
  onLock(champ: number): void;
  onBack(): void;
}

/** Seconds to pick online before the current choice is locked automatically. */
const PICK_SECONDS = 30;
const KEYS = ['LMB', 'RMB / F', 'Space', 'Q', 'E', 'R'];
/** Each drawn key sits a little askew. */
const TILTS = [-2, 1.5, -1, 2.5, -1.5, 1];

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

/** Someone else in the match: an ally gets a card under yours, an enemy only a pick indicator. */
export interface SeatCard {
  label: string;
  /** Their champion when it's known (a bot set up with one); null shows `status` instead. */
  champ: number | null;
  enemy: boolean;
  locked: boolean;
  /** Shown in place of a champion: "Picking…", "Random"… */
  status?: string;
}

/** Filter bar icons per roster category (24px, stroked in currentColor). */
const CATEGORY_ICONS: Record<string, string> = {
  All: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  Mage: '<path d="M5 20 15 10"/><path d="m16 3 1.3 3.2L20.5 7.5l-3.2 1.3L16 12l-1.3-3.2L11.5 7.5l3.2-1.3z"/>',
  'Close combat': '<path d="M4 4l11 11M15 15l-2 2M15 15l2-2M17 17l3 3"/><path d="M20 4 9 15M9 15l2 2M9 15l-2-2M7 17l-3 3"/>',
  Assassin: '<path d="M18 3c-2 5-5 9-9 12l-1.5-1.5C11 10 14 7 18 3z"/><path d="M6 13l5 5M8.5 15.5 5 19"/>',
  Marksman: '<path d="M6 3c7 2 11 8 9 15"/><path d="M6 3l9 15"/><path d="M4 20l15-15M19 5h-4M19 5v4"/>',
};
const iconSvg = (paths: string) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Fill a status chip with the spinner (waiting) or the green check (done). */
export function setStatusChip(chip: HTMLElement, done: boolean, title?: string) {
  chip.classList.toggle('ok', done);
  chip.classList.toggle('waiting', !done);
  chip.innerHTML = done ? CHECK : SPINNER;
  if (title) chip.title = title;
}

/**
 * Champion select: the players as cards on the left, the roster (filtered by type) and
 * Lock in in the middle, the picked champion's kit on the right. Shared by bot, online
 * and training play; the Characters page browses it without picking.
 */
export class ChampionSelect {
  champ = 0;
  mode: SelectMode = 'bot';
  locked = false;
  private others: SeatCard[] = [];
  private filter = 'All';
  private deadline = 0;
  private ticker = 0;
  /** Champion the kit and backdrop show (they only redraw, and animate, when it changes). */
  private shown = -1;
  /** Your card flashes into color on the render right after Lock in. */
  private flash = false;
  private embers = new Embers($('select-embers') as HTMLCanvasElement);
  /** Width / height of each key art, once loaded (to frame it on the Characters page). */
  private aspects = new Map<string, number>();

  constructor(private hooks: SelectHooks) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7cc7ff';
    const root = document.documentElement.style;
    // The picked portrait's torn accent frame (the image is the 110px square plus 8px each side).
    root.setProperty('--ring', `url(${tornFrame(110, 8, 5, 8, accent)})`);
    // Skill icon boxes: square, the edges only a little torn.
    root.setProperty('--torn-soft', `url(${tornSquare(48, 9, 0.75, 3)})`);
    this.buildFilter();
    this.buildRoster();
    // Custom scrollbar for the roster: barely there until you scroll (see style.css).
    new SimpleBar($('roster'), { autoHide: false });
    $('lock-in').addEventListener('click', () => this.lockIn());
    $('select-back').addEventListener('click', () => this.hooks.onBack());
    window.addEventListener('resize', () => this.isOpen && this.placeBackdrop());
  }

  /** `others`: everyone else in the match (allies as cards under yours, enemies as pick indicators). */
  open(mode: SelectMode, champ: number, others: SeatCard[] = []) {
    this.mode = mode;
    this.champ = champ;
    this.locked = false;
    this.others = others;
    this.shown = -1;
    $('select').classList.remove('hidden');
    this.embers.start();
    $('select').classList.toggle('browse', mode === 'browse');
    $('select').classList.toggle('training', mode === 'training');
    $('select-title').textContent = mode === 'browse' ? 'Characters' : 'Select your character';
    $('select-back').textContent = mode === 'browse' ? 'Back' : 'Exit';
    // Online the countdown takes the title's place.
    $('select-title').classList.toggle('hidden', mode === 'online');
    $('select-timer').classList.toggle('hidden', mode !== 'online');
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
    this.embers.stop();
    $('select').classList.add('hidden');
  }

  get isOpen() {
    return !$('select').classList.contains('hidden');
  }

  /** Online: the other players changed (someone joined, left or locked in). */
  setOthers(others: SeatCard[]) {
    this.others = others;
    if (this.isOpen) this.renderSeats();
  }

  private lockIn() {
    if (this.locked) return;
    this.locked = true;
    this.flash = true;
    clearInterval(this.ticker);
    this.render();
    this.hooks.onLock(this.champ);
  }

  private tick() {
    const left = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000));
    const timer = $('select-timer');
    timer.textContent = `${left}s`;
    timer.classList.toggle('low', left <= 5);
    if (left === 0) this.lockIn();
  }

  private buildFilter() {
    const categories = ['All', ...new Set(ROSTER.map((r) => r.category))];
    $('roster-filter').innerHTML = categories
      .map((c) => `<button class="filter-btn brush" data-category="${c}" title="${c}" aria-label="${c}">${iconSvg(CATEGORY_ICONS[c] ?? '<circle cx="12" cy="12" r="7"/>')}</button>`)
      .join('');
    for (const b of $('roster-filter').querySelectorAll<HTMLButtonElement>('.filter-btn')) {
      b.addEventListener('click', () => {
        this.filter = b.dataset.category!;
        this.renderRoster();
      });
    }
  }

  private buildRoster() {
    const tile = (r: (typeof ROSTER)[number], i: number) => `
        <button class="champ-tile" data-champ="${i}" data-category="${r.category}" title="${r.hero}" style="--i: ${i}">
          <span class="portrait-wrap">
            <span class="portrait${r.flip ? ' flip' : ''}" style="background-image: url(${r.art}); background-position: ${r.portrait}"></span>
            <span class="ring"></span>
          </span>
          <span class="champ-name">${r.hero}</span>
        </button>`;
    $('roster').innerHTML = `<div class="roster-grid">${ROSTER.map(tile).join('')}</div>`;
    for (const t of document.querySelectorAll<HTMLButtonElement>('.champ-tile')) {
      t.addEventListener('click', () => {
        if (this.locked) return;
        this.champ = Number(t.dataset.champ);
        this.render();
      });
    }
  }

  private render() {
    this.renderRoster();
    this.renderSeats();
    if (this.shown !== this.champ) {
      this.shown = this.champ;
      this.renderInfo();
      this.renderBackdrop();
    }
    const lock = $('lock-in') as HTMLButtonElement;
    lock.disabled = this.locked;
    lock.classList.toggle('locked', this.locked);
    lock.textContent = this.locked ? 'Locked' : 'Lock in';
  }

  private renderRoster() {
    for (const b of document.querySelectorAll<HTMLElement>('.filter-btn')) b.classList.toggle('active', b.dataset.category === this.filter);
    for (const t of document.querySelectorAll<HTMLElement>('.champ-tile')) {
      t.classList.toggle('active', Number(t.dataset.champ) === this.champ);
      t.classList.toggle('locked', this.locked);
      t.classList.toggle('hidden', this.filter !== 'All' && t.dataset.category !== this.filter);
    }
    // Next frame, once SimpleBar has sized the scroll area of a screen that may have just been shown.
    requestAnimationFrame(() => document.querySelector('.champ-tile.active:not(.hidden)')?.scrollIntoView({ block: 'nearest' }));
  }

  /**
   * Your card on top (the champion you're looking at), then your allies'; the enemies'
   * picks stay hidden, so they only get an indicator each in the top bar.
   */
  private renderSeats() {
    const you: SeatCard = { label: 'You', champ: this.champ, enemy: false, locked: this.locked };
    // The Characters page has no cards: the art itself stands in that column (see placeBackdrop).
    const cards = this.mode === 'browse' ? [] : [you, ...this.others.filter((o) => !o.enemy)];
    const el = $('select-seats');
    release(el);
    el.innerHTML = cards.map(seatHtml).join('');
    if (this.flash) el.querySelector('.seat')?.classList.add('flash');
    this.flash = false;
    for (const card of el.querySelectorAll<HTMLElement>('.seat')) roughen(card);

    const picks = $('enemy-picks');
    release(picks);
    picks.innerHTML = '';
    for (const o of this.others.filter((e) => e.enemy)) {
      const chip = document.createElement('span');
      chip.className = 'status-chip rough';
      setStatusChip(chip, o.locked, `${o.label}: ${o.locked ? 'locked in' : 'picking…'}`);
      picks.append(chip);
      roughen(chip);
    }
  }

  /** The picked champion's art behind it all (dimmed, except on the Characters page); the last one fades out. */
  private renderBackdrop() {
    const r = ROSTER[this.champ];
    const wrap = $('select-backdrop');
    for (const old of wrap.children) {
      old.classList.add('out');
      setTimeout(() => old.remove(), 700);
    }
    const bg = document.createElement('div');
    bg.className = 'select-backdrop';
    bg.style.backgroundImage = `url(${r.art})`;
    bg.style.setProperty('--flip', r.flip ? '-1' : '1');
    wrap.append(bg);
    this.placeBackdrop();
  }

  /**
   * Behind the whole screen the art just centers on the figure. On the Characters page it
   * stands bright in the left column instead of a card, so slide it until the figure
   * (ROSTER focus) sits in the middle of that column.
   */
  private placeBackdrop() {
    const bg = $('select-backdrop').lastElementChild as HTMLElement | null;
    if (!bg) return;
    const r = ROSTER[this.champ];
    const aspect = this.aspects.get(r.art);
    const col = $('select-seats').getBoundingClientRect();
    if (this.mode !== 'browse' || !col.width || aspect === undefined) {
      bg.style.backgroundPosition = `${Math.round(r.focus * 100)}% 30%`;
      if (aspect === undefined) {
        const img = new Image();
        img.onload = () => {
          this.aspects.set(r.art, img.naturalWidth / img.naturalHeight);
          if (this.isOpen) this.placeBackdrop();
        };
        img.src = r.art;
      }
      return;
    }
    const W = bg.offsetWidth;
    const imgW = Math.max(W, bg.offsetHeight * aspect);
    // The column's middle in the art box's own coordinates (mirrored art counts from the right).
    const target = col.left + col.width / 2 - ($('select-backdrop').getBoundingClientRect().left + bg.offsetLeft);
    const offset = (r.flip ? W - target : target) - r.focus * imgW;
    bg.style.backgroundPosition = `${Math.min(0, Math.max(W - imgW, offset))}px ${r.artY ?? 'center'}`;
  }

  private renderInfo() {
    const r = ROSTER[this.champ];
    const c = CHAMPIONS[this.champ];
    const role = c.role[0].toUpperCase() + c.role.slice(1);
    release($('champ-info'));
    $('champ-info').innerHTML = `
      <div class="info-head">
        <h2 class="display hero">${r.hero}</h2>
        <p class="role">${role} · ${c.hp} HP</p>
      </div>
      <span class="hero-stroke brush"></span>
      <p class="lore">${r.lore}</p>
      <div class="kit">
        ${c.abilities
          .map(
            (a, i) => `
        <div class="skill" style="--i: ${i}">
          <span class="skill-icon" data-slot="${i}"></span>
          <div class="skill-text">
            <div class="skill-top"><b>${a.name}</b><span class="key keycap" style="--tilt: ${TILTS[i]}deg">${KEYS[i]}</span></div>
            <p>${a.desc}</p>
          </div>
        </div>`,
          )
          .join('')}
      </div>`;
    for (const slot of $('champ-info').querySelectorAll<HTMLElement>('.skill-icon')) {
      slot.append(abilityIcon(c.abilities[Number(slot.dataset.slot)].id, 40, '#ffffff'));
    }
    for (const el of $('champ-info').querySelectorAll<HTMLElement>('.rough, .brush')) roughen(el);
  }
}

/** Embers and dust drifting up through champion select (only animates while it's open). */
class Embers {
  private parts: { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; cool: boolean; seed: number }[] = [];
  private raf = 0;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {}

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame(Math.min(0.05, (now - this.last) / 1000), now / 1000);
      this.last = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(dt: number, t: number) {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // About one a frame until there are enough for the screen's size.
    const want = Math.round((w * h) / 26000);
    if (this.parts.length < want && Math.random() < 0.6) {
      const max = 4 + Math.random() * 6;
      this.parts.push({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 14,
        vy: -(18 + Math.random() * 42),
        r: 0.6 + Math.random() * 1.9,
        life: max,
        max,
        cool: Math.random() < 0.22,
        seed: Math.random() * 100,
      });
    }
    g.globalCompositeOperation = 'lighter';
    this.parts = this.parts.filter((p) => {
      p.life -= dt;
      p.x += (p.vx + Math.sin(t * 1.3 + p.seed) * 12) * dt;
      p.y += p.vy * dt;
      if (p.life <= 0 || p.y < -10) return false;
      const k = p.life / p.max;
      // Fade in, glow, flicker, fade out.
      const a = Math.min(1, (1 - k) * 5) * k * (0.55 + 0.45 * Math.sin(t * 9 + p.seed * 3));
      g.fillStyle = p.cool ? `rgba(124, 199, 255, ${a * 0.8})` : `rgba(255, ${150 + Math.round(60 * k)}, 90, ${a})`;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.cool ? `rgba(124, 199, 255, ${a * 0.12})` : `rgba(255, 140, 60, ${a * 0.14})`;
      g.beginPath();
      g.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
      g.fill();
      return true;
    });
  }
}

function seatHtml(c: SeatCard): string {
  const r = c.champ !== null ? ROSTER[c.champ] : null;
  const art = r
    ? `<img class="seat-art${r.flip ? ' flip' : ''}" src="${r.art}" alt="" style="object-position: ${Math.round(r.focus * 100)}% 25%">`
    : '<span class="seat-art empty"></span>';
  return `
      <div class="seat rough${c.locked ? ' locked' : ''}">
        ${art}
        <div class="seat-text">
          <span class="display seat-name">${r ? r.hero : (c.status ?? 'Picking…')}</span>
          <span class="seat-label">${c.label}</span>
        </div>
      </div>`;
}
