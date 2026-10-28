/** Presentation data per champion (index matches CHAMPIONS). Gameplay lives in sim/constants. */
export interface RosterEntry {
  /** Hero name shown in menus and the HUD. */
  hero: string;
  /** Roster group on the champion select screen; champions sharing one sit in the same row. */
  category: string;
  /** Key art, relative to the page (./art/placeholder.svg until a painting exists). */
  art: string;
  /** Mirror the art so the figure stands on the right side of the screen. */
  flip: boolean;
  /** background-position that frames the face in a 110 px portrait. */
  portrait: string;
  /** A line of flavor text for the champion select screen. */
  lore: string;
  /** Push the select-screen art right so the figure clears the dark left side. */
  artShift?: string;
  /** Where the figure stands in the art, 0 (left edge) to 1 (right edge), before any flip. */
  focus: number;
  /** Vertical background-position of the select-screen art (default center); 'top' when the head is near the top edge. */
  artY?: string;
}

/** Inline style for a small round thumbnail of a champion's face (dropdowns). */
export function rosterThumb(r: RosterEntry): string {
  return `background-image: url(${r.art}); background-size: 560% auto; background-position: ${r.portrait};${r.flip ? ' transform: scaleX(-1);' : ''}`;
}

/** Key art URL, versioned per build so a repainted file isn't served stale from the browser cache. */
function art(file: string): string {
  return `./art/${file}?v=${__BUILD__}`;
}

export const ROSTER: RosterEntry[] = [
  {
    hero: 'Perrie',
    category: 'Mage',
    art: art('mage.webp'),
    flip: false,
    portrait: '74% 9%',
    focus: 0.67,
    lore: 'An elven witch of the moonlit ruins. She bends starlight into bolts and falling stars, and keeps every foe at the end of her staff.',
  },
  {
    hero: 'Bogo Boga',
    category: 'Close combat',
    art: art('warrior.webp'),
    flip: false,
    portrait: '62% 3%',
    artShift: '16vw',
    focus: 0.6,
    lore: 'An orc berserker from the red wastes. He hooks his prey, leaps into the fight and keeps swinging until nothing is left standing.',
  },
  {
    hero: 'Shade',
    category: 'Assassin',
    art: art('assassin.webp'),
    flip: true,
    portrait: '22% 4%',
    focus: 0.37,
    lore: 'A hooded killer from the harbor alleys. It marks its target, vanishes into smoke and returns only to finish the job.',
  },
  {
    hero: 'Elianis',
    category: 'Marksman',
    art: art('archer.webp'),
    flip: true,
    portrait: '45% 20%',
    focus: 0.46,
    lore: 'A wood elf from the deep groves. He hunts from the treeline, pins his prey with vines and lets the sky rain arrows on whoever is still standing.',
  },
  {
    hero: 'Sozuki',
    category: 'Close combat',
    art: art('samurai.webp'),
    flip: true,
    portrait: '38% 12%',
    focus: 0.34,
    lore: 'A wandering swordswoman from the land in the east. Her blade turns arrows aside, cuts through her foes before they can react, and her spirit strikes twice.',
  },
  {
    hero: 'Romulus',
    category: 'Mage',
    art: art('vampire.webp'),
    flip: true,
    portrait: '47% 0%',
    focus: 0.47,
    artY: 'top',
    lore: 'A lone high vampire who never leaves his castle. Mourning his wife without end, he kills everyone who comes close, in a rage that never cools.',
  },
  {
    hero: 'Rustic',
    category: 'Assassin',
    art: art('rustic.webp'),
    flip: true,
    portrait: '61% 35%',
    artShift: '10vw',
    focus: 0.6,
    lore: 'A kobold miner who dug up crystals that turn old tunnels into gateways to other moments. Armed with chronobombs and a clock fused to his helmet, Rustic steals treasures before they are found and settles grudges history forgot.',
  },
  {
    hero: 'Lotan',
    category: 'Assassin',
    art: art('lotan.webp'),
    flip: true,
    portrait: '35% 12%',
    focus: 0.36,
    lore: 'A frog spearman from the glowing mushroom swamps, sworn to the great toad that sleeps beneath them. It slips under the water, perches out of reach on its own spear, and calls the ancestor up to swallow whoever trespasses.',
  },
];
