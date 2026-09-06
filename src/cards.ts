export type Stat = 'advance' | 'brace' | 'feint';

export type Card = {
  id: string;
  name: string;
  icon: IconName;
  advance: number;
  brace: number;
  feint: number;
  note: string;
};

type IconName =
  | 'anchor' | 'anvil' | 'arrow' | 'bell' | 'crown' | 'compass'
  | 'fox' | 'gate' | 'hammer' | 'horn' | 'key' | 'lantern' | 'leaf'
  | 'owl' | 'shield' | 'star' | 'tower' | 'wave';

// These are hand-drawn, geometric ink symbols. They are original product art.
export const CARDS: Card[] = [
  { id: 'anchor', name: 'Anchor', icon: 'anchor', advance: 1, brace: 5, feint: 2, note: 'Holds the line.' },
  { id: 'anvil', name: 'Anvil', icon: 'anvil', advance: 2, brace: 5, feint: 1, note: 'Heavy and steady.' },
  { id: 'arrow', name: 'Arrow', icon: 'arrow', advance: 5, brace: 1, feint: 2, note: 'Fast opening.' },
  { id: 'bell', name: 'Bell', icon: 'bell', advance: 2, brace: 3, feint: 4, note: 'Calls a reversal.' },
  { id: 'crown', name: 'Crown', icon: 'crown', advance: 4, brace: 2, feint: 3, note: 'Claims the centre.' },
  { id: 'compass', name: 'Compass', icon: 'compass', advance: 3, brace: 2, feint: 4, note: 'Finds the gap.' },
  { id: 'fox', name: 'Fox', icon: 'fox', advance: 3, brace: 1, feint: 5, note: 'Never where expected.' },
  { id: 'gate', name: 'Gate', icon: 'gate', advance: 1, brace: 4, feint: 3, note: 'Makes a hard stop.' },
  { id: 'hammer', name: 'Hammer', icon: 'hammer', advance: 5, brace: 2, feint: 1, note: 'Breaks a stalemate.' },
  { id: 'horn', name: 'Horn', icon: 'horn', advance: 4, brace: 1, feint: 3, note: 'Calls the charge.' },
  { id: 'key', name: 'Key', icon: 'key', advance: 2, brace: 2, feint: 5, note: 'Opens a side route.' },
  { id: 'lantern', name: 'Lantern', icon: 'lantern', advance: 2, brace: 3, feint: 4, note: 'Sees through a ruse.' },
  { id: 'leaf', name: 'Leaf', icon: 'leaf', advance: 3, brace: 3, feint: 3, note: 'Fits every plan.' },
  { id: 'owl', name: 'Owl', icon: 'owl', advance: 1, brace: 3, feint: 5, note: 'Waits for the turn.' },
  { id: 'shield', name: 'Shield', icon: 'shield', advance: 1, brace: 5, feint: 2, note: 'Refuses the push.' },
  { id: 'star', name: 'Star', icon: 'star', advance: 4, brace: 3, feint: 1, note: 'A clear signal.' },
  { id: 'tower', name: 'Tower', icon: 'tower', advance: 2, brace: 4, feint: 2, note: 'Keeps the height.' },
  { id: 'wave', name: 'Wave', icon: 'wave', advance: 4, brace: 1, feint: 4, note: 'Changes the ground.' },
];

export const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));

export type DraftSetId = 'marsh' | 'stone' | 'market';

// Paid sets retain the same 18 hand-drawn symbols and rotate every card's
// three values. Each set therefore has the same total strength distribution,
// while asking players to use a different tactical reading of the same sheet.
function rotateValues(card: Card, setId: DraftSetId): Card {
  if (setId === 'marsh') return card;
  const [advance, brace, feint] = setId === 'stone'
    ? [card.brace, card.feint, card.advance]
    : [card.feint, card.advance, card.brace];
  const prefix = setId === 'stone' ? 'Stone' : 'Market';
  const note = setId === 'stone' ? 'Rebalanced for a held line.' : 'Rebalanced for quick turns.';
  return { ...card, name: `${prefix} ${card.name}`, advance, brace, feint, note };
}

export const CARD_SETS: Record<DraftSetId, Card[]> = {
  marsh: CARDS,
  stone: CARDS.map((card) => rotateValues(card, 'stone')),
  market: CARDS.map((card) => rotateValues(card, 'market')),
};

export function cardForSet(setId: string, cardId: string): Card | undefined {
  return (CARD_SETS[setId as DraftSetId] || CARDS).find((card) => card.id === cardId);
}

export const TACTICS: { id: Stat; name: string; short: string; help: string }[] = [
  { id: 'advance', name: 'Advance', short: 'A', help: 'Use the red number.' },
  { id: 'brace', name: 'Brace', short: 'B', help: 'Use the green number.' },
  { id: 'feint', name: 'Feint', short: 'F', help: 'Use the mustard number.' },
];

export function cardIcon(icon: IconName, label: string): string {
  const common = 'viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  const paths: Record<IconName, string> = {
    anchor: '<path d="M32 9v38"/><path d="M22 18h20"/><circle cx="32" cy="10" r="4"/><path d="M15 35c0 11 7 18 17 18s17-7 17-18"/><path d="M13 36l4-5 4 5M43 36l4-5 4 5"/>',
    anvil: '<path d="M10 30h22l7-10h13l-5 10h8v8H38l-5 12H18l4-12H10z"/><path d="M21 50h16"/>',
    arrow: '<path d="M10 32h39"/><path d="m37 18 14 14-14 14"/><path d="M10 22v20"/>',
    bell: '<path d="M17 43h30l-4-7V27a15 15 0 0 0-30 0v9z"/><path d="M27 50h10"/><path d="M32 9v4"/>',
    crown: '<path d="m12 19 12 12 8-18 8 18 12-12-4 31H16z"/><path d="M16 50h32"/>',
    compass: '<circle cx="32" cy="32" r="21"/><path d="m39 25-6 14-8 2 6-14z"/><path d="M32 8v5M32 51v5M8 32h5M51 32h5"/>',
    fox: '<path d="m14 20 12 5 6-12 6 12 12-5-4 30H18z"/><path d="M23 37h1M40 37h1"/><path d="m28 44 4 3 4-3"/>',
    gate: '<path d="M12 52h40M17 52V20h30v32M25 52V32h14v20M12 20h40"/><path d="M21 12h22v8H21z"/>',
    hammer: '<path d="m18 16 22 22"/><path d="m13 21 12-12 18 8-12 12z"/><path d="m36 38 12 12-8 8-12-12"/>',
    horn: '<path d="M13 25c16-6 25-3 36-15v37c-11-12-20-9-36-15z"/><path d="M13 25v7"/><path d="M20 42l-4 12h12"/>',
    key: '<circle cx="23" cy="25" r="10"/><path d="m30 32 20 20"/><path d="m42 44 5-5M47 49l5-5"/>',
    lantern: '<path d="M20 23h24l4 29H16z"/><path d="M25 23v-5a7 7 0 0 1 14 0v5"/><path d="M26 33h12v11H26z"/>',
    leaf: '<path d="M12 49C13 24 27 11 52 11 51 36 38 50 12 49z"/><path d="M14 47 46 17"/><path d="m26 35-1-10M35 26h10"/>',
    owl: '<path d="m16 25 3-14 10 7h6l10-7 3 14v23H16z"/><circle cx="25" cy="33" r="6"/><circle cx="39" cy="33" r="6"/><path d="m29 44 3 3 3-3"/>',
    shield: '<path d="M32 8 51 16v14c0 13-8 21-19 26-11-5-19-13-19-26V16z"/><path d="M32 17v29M21 30h22"/>',
    star: '<path d="m32 9 6 16 17 1-13 11 4 18-14-9-14 9 4-18L9 26l17-1z"/>',
    tower: '<path d="M18 54h28V19H18z"/><path d="M14 19h36l-5-9H19z"/><path d="M26 54V40h12v14M25 29h2M37 29h2"/>',
    wave: '<path d="M8 39c8 0 8-14 16-14s8 14 16 14 8-14 16-14"/><path d="M8 50c8 0 8-14 16-14s8 14 16 14 8-14 16-14"/><path d="M8 28c8 0 8-14 16-14s8 14 16 14 8-14 16-14"/>',
  };
  return `<svg ${common}><title>${label}</title>${paths[icon]}</svg>`;
}

export function statValue(cardId: string, tactic: Stat): number {
  return CARD_BY_ID.get(cardId)?.[tactic] ?? 0;
}
