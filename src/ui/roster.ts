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
}

export const ROSTER: RosterEntry[] = [
  { hero: 'Perie', category: 'Mage', art: './art/mage.webp', flip: false, portrait: '74% 9%' },
  { hero: 'Bogo Boga', category: 'Close combat', art: './art/warrior.webp', flip: false, portrait: '62% 3%' },
  { hero: 'Shade', category: 'Assassin', art: './art/assassin.webp', flip: true, portrait: '22% 4%' },
];
