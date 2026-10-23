/** Presentation data per champion (index matches CHAMPIONS). Gameplay lives in sim/constants. */
export interface RosterEntry {
  /** Hero name shown in menus and the HUD. */
  hero: string;
  /** Roster group on the champion select screen. */
  category: string;
  /** Key art, relative to the page. */
  art: string;
  /** Mirror the art so the figure stands on the right side of the screen. */
  flip: boolean;
  /** background-position that frames the face in a 110 px portrait. */
  portrait: string;
  /** A line of flavor text for the champion select screen. */
  lore: string;
}

export const ROSTER: RosterEntry[] = [
  {
    hero: 'Perrie',
    category: 'Mage',
    art: './art/mage.webp',
    flip: false,
    portrait: '74% 9%',
    lore: 'An elven witch of the moonlit ruins. She bends starlight into bolts and falling stars, and keeps every foe at the end of her staff.',
  },
  {
    hero: 'Bogo Boga',
    category: 'Close combat',
    art: './art/warrior.webp',
    flip: false,
    portrait: '62% 3%',
    lore: 'An orc berserker from the red wastes. He hooks his prey, leaps into the fight and keeps swinging until nothing is left standing.',
  },
  {
    hero: 'Shade',
    category: 'Assassin',
    art: './art/assassin.webp',
    flip: true,
    portrait: '22% 4%',
    lore: 'A hooded killer from the harbor alleys. It marks its target, vanishes into smoke and returns only to finish the job.',
  },
];
