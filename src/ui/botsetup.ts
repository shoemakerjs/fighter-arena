import type { Difficulty } from '../input/bot';
import { CHAMPIONS } from '../sim/constants';
import { Dropdown } from './dropdown';
import { ROSTER, rosterThumb } from './roster';

export interface BotSetupHooks {
  onStart(): void;
  onBack(): void;
}

const $ = (id: string) => document.getElementById(id)!;

const RANDOM = '-1';
const RANDOM_THUMB = 'background: #2c2a30; display: grid; place-items: center;';

/** Figma "Bot settings": pick the bot's champion and difficulty, then start. */
export class BotSetup {
  private champ: Dropdown;
  private diff: Dropdown;

  constructor(hooks: BotSetupHooks) {
    this.champ = new Dropdown(
      $('bot-champ'),
      [
        { value: RANDOM, label: 'Random', thumb: RANDOM_THUMB, thumbText: '?' },
        ...ROSTER.map((r, i) => ({
          value: String(i),
          label: r.hero,
          thumb: rosterThumb(r),
        })),
      ],
      RANDOM,
    );
    this.diff = new Dropdown(
      $('bot-difficulty'),
      [
        { value: 'easy', label: 'Easy' },
        { value: 'normal', label: 'Normal' },
        { value: 'hard', label: 'Hard' },
      ],
      'normal',
    );
    $('start-matchup').addEventListener('click', () => hooks.onStart());
    $('setup-back').addEventListener('click', () => hooks.onBack());
  }

  /** The bot's champion for the next match (a random one if "Random" is picked). */
  pickChampion(): number {
    const v = Number(this.champ.value);
    return v < 0 ? Math.floor(Math.random() * CHAMPIONS.length) : v;
  }

  get difficulty(): Difficulty {
    return this.diff.value as Difficulty;
  }

  open() {
    $('bot-setup').classList.remove('hidden');
  }

  close() {
    $('bot-setup').classList.add('hidden');
  }
}
