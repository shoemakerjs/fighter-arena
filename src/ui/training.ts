import { DummyController, type DummyMove } from '../input/dummy';
import { CHAMPIONS } from '../sim/constants';
import { Dropdown } from './dropdown';
import { ROSTER, rosterThumb } from './roster';
import { abilityList } from './select';

export interface TrainingHooks {
  /** Switch the player's champion (restarts the training match). */
  onChampion(champ: number): void;
  onExit(): void;
}

const $ = (id: string) => document.getElementById(id)!;

/** Drop focus after using a control, so Space / Q / E go to the game, not the button. */
const release = () => (document.activeElement as HTMLElement | null)?.blur();

/** Training overlay: exit, the current champion's skills, and the dummy settings. */
export class TrainingPanel {
  /** Controls the dummy; the settings below change it live. */
  readonly dummy = new DummyController();
  private champ: Dropdown;

  constructor(hooks: TrainingHooks) {
    this.champ = new Dropdown(
      $('training-champ'),
      ROSTER.map((r, i) => ({ value: String(i), label: r.hero, thumb: rosterThumb(r) })),
      '0',
      (v) => {
        release();
        hooks.onChampion(Number(v));
      },
      true,
    );
    for (const btn of $('training-move').querySelectorAll<HTMLButtonElement>('button')) {
      btn.addEventListener('click', () => {
        this.dummy.move = btn.dataset.move as DummyMove;
        for (const b of $('training-move').querySelectorAll('button')) b.classList.toggle('active', b === btn);
        release();
      });
    }
    const shoot = $('training-shoot') as HTMLInputElement;
    shoot.addEventListener('change', () => {
      this.dummy.shoot = shoot.checked;
      release();
    });
    $('training-exit').addEventListener('click', () => {
      release();
      hooks.onExit();
    });
  }

  /** Show the overlay for this champion (settings are kept between sessions). */
  open(champ: number) {
    this.champ.set(String(champ));
    const r = ROSTER[champ];
    const c = CHAMPIONS[champ];
    $('training-skills').innerHTML = `
      <p class="role">${c.role[0].toUpperCase() + c.role.slice(1)} · ${c.hp} HP</p>
      <h2 class="display hero">${r.hero}</h2>
      <div class="abilities">${abilityList(champ)}</div>`;
    $('training-ui').classList.remove('hidden');
  }

  close() {
    $('training-ui').classList.add('hidden');
  }
}
