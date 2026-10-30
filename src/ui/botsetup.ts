import type { Difficulty } from '../input/bot';
import { CHAMPIONS } from '../sim/constants';
import { Dropdown } from './dropdown';
import { ROSTER, rosterThumb, type RosterEntry } from './roster';

export interface BotSetupHooks {
  onStart(): void;
  onBack(): void;
}

const $ = (id: string) => document.getElementById(id)!;

const RANDOM = '-1';
const RANDOM_THUMB = 'background: #2c2a30; display: grid; place-items: center;';

export type MatchFormat = '1v1' | '2v2';

/** Random first, then every champion with its face. */
const champOptions = () => [
  { value: RANDOM, label: 'Random', thumb: RANDOM_THUMB, thumbText: '?' },
  ...ROSTER.map((r: RosterEntry, i) => ({ value: String(i), label: r.hero, thumb: rosterThumb(r) })),
];

/** Figma "Bot settings": format, the bots' champions and difficulty, then start. */
export class BotSetup {
  format: MatchFormat = '1v1';
  private champ: Dropdown;
  private champ2: Dropdown;
  private ally: Dropdown;
  private diff: Dropdown;

  constructor(hooks: BotSetupHooks) {
    this.champ = new Dropdown($('bot-champ'), champOptions(), RANDOM);
    this.champ2 = new Dropdown($('bot-champ-2'), champOptions(), RANDOM);
    this.ally = new Dropdown($('bot-ally'), champOptions(), RANDOM);
    for (const btn of $('bot-format').querySelectorAll<HTMLButtonElement>('button')) {
      btn.addEventListener('click', () => this.setFormat(btn.dataset.format as MatchFormat));
    }
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

  private setFormat(format: MatchFormat) {
    this.format = format;
    for (const b of $('bot-format').querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('active', b.dataset.format === format);
    for (const f of document.querySelectorAll('#bot-setup .duo')) f.classList.toggle('hidden', format !== '2v2');
    $('bot-champ-label').textContent = format === '2v2' ? 'First enemy' : 'Bot champion';
    $('bot-setup').classList.toggle('duo-format', format === '2v2');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  /** The (first) enemy bot's champion for the next match (a random one if "Random" is picked). */
  pickChampion(): number {
    return pick(this.champ);
  }

  /** 2v2: the second enemy bot. */
  pickSecondEnemy(): number {
    return pick(this.champ2);
  }

  /** 2v2: your bot ally. */
  pickAlly(): number {
    return pick(this.ally);
  }

  /** The bots' champions as set up, null where it's Random (for the champion select cards). */
  get chosen(): { enemy: number | null; enemy2: number | null; ally: number | null } {
    const known = (d: Dropdown) => (Number(d.value) < 0 ? null : Number(d.value));
    return { enemy: known(this.champ), enemy2: known(this.champ2), ally: known(this.ally) };
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

function pick(d: Dropdown): number {
  const v = Number(d.value);
  return v < 0 ? Math.floor(Math.random() * CHAMPIONS.length) : v;
}
