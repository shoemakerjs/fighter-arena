export interface DropdownOption {
  value: string;
  label: string;
  /** Optional 32 px thumbnail: inline style, and text drawn inside it. */
  thumb?: string;
  thumbText?: string;
}

const ARROW = `<svg class="dd-arrow" width="12" height="8" viewBox="0 0 12 7.41" aria-hidden="true"><path d="M1.41 0L6 4.58L10.59 0L12 1.41L6 7.41L0 1.41L1.41 0Z" fill="#5A5A5A"/></svg>`;

/** Figma dropdown: 48 px field, 12 px radius, #5a5a5a border, thumbnail + label + chevron. */
export class Dropdown {
  value: string;
  private open = false;
  private button: HTMLButtonElement;
  private menu: HTMLDivElement;

  constructor(
    root: HTMLElement,
    private options: DropdownOption[],
    initial: string,
    private onChange: (value: string) => void = () => {},
  ) {
    this.value = initial;
    root.classList.add('dropdown');
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'dd-field';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.menu = document.createElement('div');
    this.menu.className = 'dd-menu hidden';
    this.menu.setAttribute('role', 'listbox');
    root.append(this.button, this.menu);

    this.button.addEventListener('click', () => this.toggle(!this.open));
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !root.contains(e.target as Node)) this.toggle(false);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.toggle(false);
    });
    this.render();
  }

  set(value: string) {
    this.value = value;
    this.render();
  }

  private toggle(open: boolean) {
    this.open = open;
    this.menu.classList.toggle('hidden', !open);
    this.button.setAttribute('aria-expanded', String(open));
  }

  private item(o: DropdownOption) {
    const thumb = o.thumb !== undefined ? `<span class="dd-thumb" style="${o.thumb}">${o.thumbText ?? ''}</span>` : '';
    return `${thumb}<span class="dd-label">${o.label}</span>`;
  }

  private render() {
    const current = this.options.find((o) => o.value === this.value) ?? this.options[0];
    this.button.innerHTML = `<span class="dd-value">${this.item(current)}</span>${ARROW}`;
    this.menu.innerHTML = this.options
      .map((o) => `<button type="button" role="option" class="dd-option${o.value === current.value ? ' active' : ''}" data-value="${o.value}">${this.item(o)}</button>`)
      .join('');
    for (const btn of this.menu.querySelectorAll<HTMLButtonElement>('.dd-option')) {
      btn.addEventListener('click', () => {
        this.set(btn.dataset.value!);
        this.toggle(false);
        this.onChange(this.value);
      });
    }
  }
}
