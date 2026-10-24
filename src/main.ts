import './style.css';
import { Bot } from './input/bot';
import { LocalInput } from './input/local';
import { Sfx } from './render/audio';
import { Fx, PLAYER_NAMES } from './render/fx';
import { Hud } from './render/hud';
import type { WorldView } from './render/view';
import { World2D } from './render/world2d';
import { World3D } from './render/world3d';
import { Lobby } from './net/lobby';
import type { RollbackSession } from './net/rollback';
import { CHAMPIONS, TICK_MS } from './sim/constants';
import { cloneState, createMatch, step } from './sim/step';
import type { GameState, Input } from './sim/types';
import { BotSetup } from './ui/botsetup';
import { roughenCards } from './ui/rough';
import { Settings } from './ui/settings';
import { TrainingPanel } from './ui/training';
import { ChampionSelect } from './ui/select';

/** home → (select | online) → play ⇄ pause → end. Menus run a bot match in the background. */
type Mode = 'home' | 'select' | 'setup' | 'settings' | 'online' | 'play' | 'pause' | 'end';

/** Which player slot this browser controls (the guest of an online match is 1). */
let localId = 0;

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
const ui = { home: $('home'), pause: $('pause'), end: $('end'), hint: $('hint-bar') };

let mode: Mode = 'home';
let myChamp = 0;
let state: GameState = createMatch();
let prev: GameState = cloneState(state);
/** Anything that produces a player's input from the state (a bot, the idle dummy). */
interface Controller {
  think(s: GameState): Input;
}

/** Who controls each player slot: a bot or the dummy, or null for the local human. */
let controllers: (Controller | null)[] = [];
let seed = 1;
let endTimer = 0;
/** Online match in progress (null when playing the bot). */
let session: RollbackSession | null = null;

function newMatch(ctrl: (Controller | null)[], champs: number[], training = false) {
  state = createMatch(champs, training);
  prev = cloneState(state);
  controllers = ctrl;
  session = null;
  localId = 0;
  setNames('YOU', 'BOT');
  fx.reset();
  clearTimeout(endTimer);
}

function setNames(a: string, b: string) {
  PLAYER_NAMES[0] = a;
  PLAYER_NAMES[1] = b;
}

/** Bots fight behind the menus. */
function startAttract(next: Mode) {
  newMatch([new Bot(0, 'hard', seed++), new Bot(1, 'hard', seed++)], [randomChamp(), randomChamp()]);
  fx.silent = true;
  setMode(next);
}

/** Back to the mode cards, optionally with a message (e.g. why the lobby closed). */
function goHome(note?: string) {
  select.close();
  botSetup.close();
  settings.close();
  training.close();
  $('menu-note').textContent = note ?? '';
  $('menu-note').classList.toggle('hidden', !note);
  startAttract('home');
}

const select = new ChampionSelect({
  onLock(champ) {
    myChamp = champ;
    if (select.mode === 'bot') startMatch();
    else if (select.mode === 'training') startTraining();
    else lobby.lockIn(champ);
  },
  onBack() {
    if (select.mode === 'browse' || select.mode === 'training') goHome();
    else if (lobby.active) lobby.leave();
    else openBotSetup();
  },
});

const settings = new Settings(sfx, { onBack: () => goHome() });

/** Home nav: the roster with every kit, nothing to pick. */
function openCharacters() {
  $('menu-note').classList.add('hidden');
  select.open('browse', myChamp);
  setMode('select');
}

function openSettings() {
  $('menu-note').classList.add('hidden');
  settings.open();
  setMode('settings');
}

/** Vs bot, first step: choose the bot's champion and difficulty. */
const botSetup = new BotSetup({
  onStart: () => openBotSelect(),
  onBack: () => goHome(),
});

function openBotSetup() {
  sfx.unlock();
  $('menu-note').classList.add('hidden');
  select.close();
  botSetup.open();
  setMode('setup');
}

/** Vs bot, second step: pick and lock in your champion to start. */
function openBotSelect() {
  botSetup.close();
  select.open('bot', myChamp);
  setMode('select');
}

// ------------------------------------------------------------------ online 1v1

const lobby = new Lobby(select, {
  onStart(s) {
    sfx.unlock();
    session = s;
    controllers = [];
    localId = s.localId;
    setNames(localId === 0 ? 'YOU' : 'RIVAL', localId === 0 ? 'RIVAL' : 'YOU');
    state = s.state;
    prev = s.prev;
    fx.reset();
    fx.silent = false;
    clearTimeout(endTimer);
    endShown = false;
    input.clear();
    setMode('play');
  },
  onBack() {
    startAttract('online');
  },
  onExit(reason) {
    goHome(reason);
  },
});

function openLobby(code?: string) {
  sfx.unlock();
  $('menu-note').classList.add('hidden');
  if (code) void lobby.join(code, myChamp);
  else void lobby.host(myChamp);
  startAttract('online');
}

let endShown = false;

/** Match against the bot with the last locked-in champion and the bot settings. */
function startMatch() {
  sfx.unlock();
  select.close();
  botSetup.close();
  newMatch([null, new Bot(1, botSetup.difficulty, seed++)], [myChamp, botSetup.pickChampion()]);
  fx.silent = false;
  input.clear();
  setMode('play');
}

/** Training: pick a champion, then hit the dummy in the middle as long as you like. */
function openTraining() {
  sfx.unlock();
  $('menu-note').classList.add('hidden');
  select.open('training', myChamp);
  setMode('select');
}

const training = new TrainingPanel({
  onChampion(champ) {
    myChamp = champ;
    startTraining();
  },
  onExit: () => goHome(),
});

/** (Re)start training with the current champion; the dummy is driven by the training settings. */
function startTraining() {
  sfx.unlock();
  select.close();
  newMatch([null, training.dummy], [myChamp, 0], true);
  setNames('YOU', 'DUMMY');
  fx.silent = false;
  input.clear();
  training.open(myChamp);
  setMode('play');
}

function randomChamp() {
  return Math.floor(Math.random() * CHAMPIONS.length);
}

function setMode(m: Mode) {
  mode = m;
  ui.home.classList.toggle('hidden', m !== 'home');
  ui.pause.classList.toggle('hidden', m !== 'pause');
  ui.end.classList.toggle('hidden', m !== 'end');
  ui.hint.classList.toggle('hidden', m !== 'play');
  // The training overlay only shows while playing (not over the pause screen).
  $('training-ui').classList.toggle('hidden', !(m === 'play' && state.training));
  canvas.classList.toggle('playing', m === 'play');
  // A focused (now hidden) button would otherwise eat the Space key.
  (document.activeElement as HTMLElement | null)?.blur();
}

function showEnd(winner: number) {
  const title = $('end-title');
  title.textContent = winner === localId ? 'Victory' : 'Defeat';
  title.className = winner === localId ? 'win' : 'lose';
  $('end-score').textContent = localId === 0 ? `${state.score[0]} : ${state.score[1]}` : `${state.score[1]} : ${state.score[0]}`;
  $('rematch').textContent = session ? 'Back to lobby' : 'Rematch';
  setMode('end');
}

function tick() {
  if (session) {
    // Online: the rollback session owns the state; skip a tick when we run ahead.
    if (session.shouldWait()) return;
    const events = session.tick(input.read());
    state = session.state;
    prev = session.prev;
    fx.handle(events, state, localId);
    if (state.phase === 'matchEnd' && !endShown && mode === 'play') {
      endShown = true;
      const winner = state.score[0] > state.score[1] ? 0 : 1;
      endTimer = window.setTimeout(() => showEnd(winner), 700);
    }
    return;
  }

  const inputs: Input[] = controllers.map((c) => (c ? c.think(state) : input.read()));
  prev = cloneState(state);
  const events = step(state, inputs);
  fx.handle(events, state, inMenus() ? null : localId);

  for (const e of events) {
    if (e.type !== 'matchEnd') continue;
    if (inMenus()) {
      startAttract(mode);
    } else {
      endTimer = window.setTimeout(() => {
        if (mode === 'play') showEnd(e.winner);
      }, 700);
    }
  }
}

function inMenus() {
  return mode === 'home' || mode === 'select' || mode === 'setup' || mode === 'settings' || mode === 'online';
}

let acc = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(now - last, 250);
  last = now;

  if (mode !== 'pause' || session) {
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
  const alpha = mode === 'pause' && !session ? 1 : acc / TICK_MS;
  const opts = {
    localId: inMenus() ? null : localId,
    cursor: mode === 'play' && input.hasPointer ? { x: input.screenX, y: input.screenY } : null,
  };
  view.render(prev, state, alpha, fx, dt, opts);
  hud.draw(prev, state, alpha, fx, dt, opts, view);
}

// ------------------------------------------------------------------ UI wiring

$('play').addEventListener('click', openBotSetup);
$('play-training').addEventListener('click', openTraining);
$('play-online').addEventListener('click', () => openLobby());
$('nav-characters').addEventListener('click', openCharacters);
$('nav-settings').addEventListener('click', openSettings);
$('rematch').addEventListener('click', () => {
  if (!session) return startMatch();
  lobby.backToLobby();
  startAttract('online');
});
$('resume').addEventListener('click', () => setMode('play'));
$('quit').addEventListener('click', () => (session ? lobby.leave() : goHome()));
$('to-menu').addEventListener('click', () => (session ? lobby.leave() : goHome()));

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    // Online the match can't stop; the pause screen just offers a way out.
    if (mode === 'play') setMode('pause');
    else if (mode === 'pause') setMode('play');
    else if (mode === 'settings' || (mode === 'select' && select.mode === 'browse')) goHome();
  } else if (e.code === 'KeyM') {
    sfx.muted = !sfx.muted;
    $('sound-state').textContent = sfx.muted ? 'off' : 'on';
  } else if (e.code === 'Enter' && mode === 'end' && !session) {
    startMatch();
  }
});

if (import.meta.env.DEV) {
  // Debug handle for poking at the running game from the console.
  Object.assign(window, {
    __arena: {
      get state() { return state; },
      get mode() { return mode; },
      get session() { return session; },
      lobby,
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

roughenCards();

const joinCode = new URLSearchParams(location.search).get('lobby');
if (joinCode) openLobby(joinCode);
else startAttract('home');
requestAnimationFrame(frame);
