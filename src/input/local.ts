import { BTN, type Input, type Vec } from '../sim/types';

const KEY_BUTTONS: Record<string, number> = {
  Space: BTN.SPACE,
  KeyQ: BTN.Q,
  KeyE: BTN.E,
  KeyR: BTN.R,
  KeyF: BTN.M2,
};

/** Keyboard + mouse → Input. Uses physical key codes, so WASD works on any layout. */
export class LocalInput {
  private keys = new Set<string>();
  private mouse = 0;
  /** Presses since the last read, so a tap shorter than one tick still counts. */
  private latched = 0;
  screenX = 0;
  screenY = 0;
  hasPointer = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private toWorld: (sx: number, sy: number) => Vec,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.code in KEY_BUTTONS || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat && KEY_BUTTONS[e.code]) this.latched |= KEY_BUTTONS[e.code];
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());

    canvas.addEventListener('pointermove', (e) => this.track(e));
    canvas.addEventListener('pointerdown', (e) => {
      this.track(e);
      const bit = e.button === 0 ? BTN.M1 : e.button === 2 ? BTN.M2 : 0;
      this.mouse |= bit;
      this.latched |= bit;
    });
    window.addEventListener('pointerup', (e) => {
      const bit = e.button === 0 ? BTN.M1 : e.button === 2 ? BTN.M2 : 0;
      this.mouse &= ~bit;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private track(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.screenX = e.clientX - rect.left;
    this.screenY = e.clientY - rect.top;
    this.hasPointer = true;
  }

  clear() {
    this.keys.clear();
    this.mouse = 0;
    this.latched = 0;
  }

  read(): Input {
    const k = this.keys;
    const right = k.has('KeyD') || k.has('ArrowRight');
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const down = k.has('KeyS') || k.has('ArrowDown');
    const up = k.has('KeyW') || k.has('ArrowUp');

    let buttons = this.mouse | this.latched;
    for (const code in KEY_BUTTONS) if (k.has(code)) buttons |= KEY_BUTTONS[code];
    this.latched = 0;

    const aim = this.toWorld(this.screenX, this.screenY);
    return {
      mx: (right ? 1 : 0) - (left ? 1 : 0),
      my: (down ? 1 : 0) - (up ? 1 : 0),
      ax: Math.round(aim.x),
      ay: Math.round(aim.y),
      buttons,
    };
  }
}
