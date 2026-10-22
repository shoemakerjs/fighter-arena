import './style.css';
import { Bot, type Difficulty } from './input/bot';
import { LocalInput } from './input/local';
import { Sfx } from './render/audio';
import { Fx } from './render/fx';
import { Hud } from './render/hud';
import type { WorldView } from './render/view';
import { World2D } from './render/world2d';
import { World3D } from './render/world3d';
import { CHAMPIONS, TICK_MS } from './sim/constants';
import { cloneState, createMatch, step } from './sim/step';
import type { GameState, Input } from './sim/types';

type Mode = 'menu' | 'play' | 'pause' | 'end';

const LOCAL_ID = 0;

const $ = (id: string) => document.getElementById(id)!;

const worldCanvas = $('world') as HTMLCanvasElement;
const canvas = $('hud') as HTMLCanvasElement;
const view = createView(worldCanvas);
const hud = new Hud(canvas);
const input = new LocalInput(canvas, (x, y) => view.screenToWorld(x, y));
const sfx = new Sfx();
const fx = new Fx(sfx);

/** 3D by default; ?2d gives the flat debug view with exact hitboxes. */
function createView(el: HTMLCanvasElement): WorldView {
  if (!new URLSearchParams(location.search).has('2d')) {
    try {
      return new World3D(el);
    } catch (err) {
      console.warn('WebGL unavailable, falling back to 2D', err);
    }
  }
  return new World2D(el);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.resize(window.innerWidth, window.innerHeight, dpr);
  hud.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', resize);
resize();
const ui = { menu: $('menu'), pause: $('pause'), end: $('end'), hint: $('hint-bar') };

let mode: Mode = 'menu';
let difficulty: Difficulty = 'normal';
let myChamp = 0;
/** -1 = random. */
let botChamp = -1;
let state: GameState = createMatch();
let prev: GameState = cloneState(state);
/** Who controls each player slot: a bot, or null for the local human. */
let controllers: (Bot | null)[] = [];
let seed = 1;
let endTimer = 0;

function newMatch(ctrl: (Bot | null)[], champs: number[]) {
  state = createMatch(champs);
  prev = cloneState(state);
  controllers = ctrl;
  fx.reset();
  clearTimeout(endTimer);
}

function startAttract() {
  newMatch([new Bot(0, 'hard', seed++), new Bot(1, 'hard', seed++)], [randomChamp(), randomChamp()]);
  fx.silent = true;
  setMode('menu');
}

function startMatch() {
  sfx.unlock();
  newMatch([null, new Bot(1, difficulty, seed++)], [myChamp, botChamp < 0 ? randomChamp() : botChamp]);
  fx.silent = false;
  input.clear();
  setMode('play');
}

function randomChamp() {
  return Math.floor(Math.random() * CHAMPIONS.length);
}

/** Menu controls list for the picked champion. */
function renderControls() {
  const c = CHAMPIONS[myChamp];
  $('role').innerHTML = `<b>${c.name}</b> · ${c.role} · ${c.hp} HP`;
  const keys = ['LPM', 'PPM / F', 'Spacja', 'Q', 'E', 'R'];
  $('controls').innerHTML =
    '<div><dt>WASD</dt><dd>ruch</dd></div>' +
    c.abilities.map((a, i) => `<div><dt>${keys[i]}</dt><dd><b>${a.name}</b> — ${a.desc}</dd></div>`).join('');
}

function setMode(m: Mode) {
  mode = m;
  ui.menu.classList.toggle('hidden', m !== 'menu');
  ui.pause.classList.toggle('hidden', m !== 'pause');
  ui.end.classList.toggle('hidden', m !== 'end');
  ui.hint.classList.toggle('hidden', m !== 'play');
  canvas.classList.toggle('playing', m === 'play');
  // A focused (now hidden) button would otherwise eat the Space key.
  (document.activeElement as HTMLElement | null)?.blur();
}

function showEnd(winner: number) {
  const title = $('end-title');
  title.textContent = winner === LOCAL_ID ? 'Zwycięstwo' : 'Porażka';
  title.className = winner === LOCAL_ID ? 'win' : 'lose';
  $('end-score').textContent = `${state.score[0]} : ${state.score[1]}`;
  setMode('end');
}

function tick() {
  const inputs: Input[] = controllers.map((c) => (c ? c.think(state) : input.read()));
  prev = cloneState(state);
  const events = step(state, inputs);
  fx.handle(events, state, mode === 'menu' ? null : LOCAL_ID);

  for (const e of events) {
    if (e.type !== 'matchEnd') continue;
    if (mode === 'menu') {
      startAttract();
    } else {
      endTimer = window.setTimeout(() => {
        if (mode === 'play') showEnd(e.winner);
      }, 700);
    }
  }
}

let acc = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(now - last, 250);
  last = now;

  if (mode !== 'pause') {
    acc += dt;
    while (acc >= TICK_MS) {
      tick();
      acc -= TICK_MS;
    }
    fx.update(dt / 1000);
  }
  draw(dt / 1000);
  requestAnimationFrame(frame);
}

function draw(dt: number) {
  const alpha = mode === 'pause' ? 1 : acc / TICK_MS;
  const opts = {
    localId: mode === 'menu' ? null : LOCAL_ID,
    cursor: mode === 'play' && input.hasPointer ? { x: input.screenX, y: input.screenY } : null,
  };
  view.render(prev, state, alpha, fx, dt, opts);
  hud.draw(prev, state, alpha, fx, dt, opts, view);
}

// ------------------------------------------------------------------ UI wiring

function segmented(id: string, onPick: (value: string) => void) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(`#${id} button`);
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      onPick(btn.dataset.value!);
      for (const b of buttons) b.classList.toggle('active', b === btn);
    });
  }
}
segmented('difficulty', (v) => (difficulty = v as Difficulty));
segmented('champ', (v) => {
  myChamp = Number(v);
  renderControls();
});
segmented('bot-champ', (v) => (botChamp = Number(v)));
renderControls();
$('play').addEventListener('click', startMatch);
$('rematch').addEventListener('click', startMatch);
$('resume').addEventListener('click', () => setMode('play'));
$('quit').addEventListener('click', startAttract);
$('to-menu').addEventListener('click', startAttract);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (mode === 'play') setMode('pause');
    else if (mode === 'pause') setMode('play');
  } else if (e.code === 'KeyM') {
    sfx.muted = !sfx.muted;
    $('sound-state').textContent = sfx.muted ? 'wył.' : 'wł.';
  } else if (e.code === 'Enter' && (mode === 'menu' || mode === 'end')) {
    startMatch();
  }
});

if (import.meta.env.DEV) {
  // Debug handle for poking at the running game from the console.
  Object.assign(window, {
    __arena: {
      get state() { return state; },
      get mode() { return mode; },
      view,
      startMatch,
      /** Run n ticks immediately (rAF is paused in background tabs). */
      advance(n: number) {
        for (let i = 0; i < n; i++) tick();
        fx.update(n / 60);
      },
      /** Draw one frame immediately. */
      draw: () => draw(1 / 60),
    },
  });
}

startAttract();
requestAnimationFrame(frame);
