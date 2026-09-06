import { CARD_BY_ID, CARDS, type Card, type Stat, statValue } from './cards';

export type Player = {
  id: string;
  name: string;
  seat: number;
  cards: string[];
  score: number;
};

export type BattlePlay = { cardId: string; tactic: Stat };
export type BattleRecord = {
  round: number;
  plays: { playerId: string; cardId: string; tactic: Stat; value: number }[];
  winnerId: string;
  runnerUpId?: string;
};

export type PracticeState = {
  version: 1;
  seed: number;
  phase: 'draft' | 'battle' | 'result';
  draftRound: number;
  battleRound: number;
  available: string[];
  players: Player[];
  draftSelections: Record<string, string>;
  battleSelections: Record<string, BattlePlay>;
  records: BattleRecord[];
  notice: string;
};

export const LOCAL_PLAYER_ID = 'you';
const PLAYER_NAMES = ['You', 'Moss', 'Brick', 'Thimble'];

export function seededOrder<T>(values: T[], seed: number): T[] {
  const copy = [...values];
  let value = seed >>> 0;
  const random = () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function createPractice(seed = 619_280): PracticeState {
  return {
    version: 1,
    seed,
    phase: 'draft',
    draftRound: 1,
    battleRound: 1,
    available: seededOrder(CARDS.map((card) => card.id), seed),
    players: PLAYER_NAMES.map((name, seat) => ({ id: seat === 0 ? LOCAL_PLAYER_ID : `bot-${seat}`, name, seat, cards: [], score: 0 })),
    draftSelections: {},
    battleSelections: {},
    records: [],
    notice: 'Choose one shared card. Practice opponents lock after you do.',
  };
}

export function draftOffers(state: PracticeState): Card[] {
  return seededOrder(state.available, state.seed + state.draftRound * 73).slice(0, 6).map((id) => CARD_BY_ID.get(id)!);
}

function draftPriority(players: Player[], seed: number, round: number): Player[] {
  const start = (seed + round - 1) % players.length;
  return [...players.slice(start), ...players.slice(0, start)];
}

function botDraftChoice(state: PracticeState, player: Player): string {
  const offers = draftOffers(state);
  const ordered = seededOrder(offers, state.seed + player.seat * 31 + state.draftRound * 7);
  const preferred = ['advance', 'brace', 'feint'][(player.seat + state.draftRound - 1) % 3] as Stat;
  return [...ordered].sort((a, b) => b[preferred] - a[preferred])[0].id;
}

export function lockPracticeDraft(state: PracticeState, cardId: string): PracticeState {
  if (state.phase !== 'draft' || state.draftSelections[LOCAL_PLAYER_ID] || !draftOffers(state).some((card) => card.id === cardId)) return state;
  const selections: Record<string, string> = { ...state.draftSelections, [LOCAL_PLAYER_ID]: cardId };
  for (const player of state.players.slice(1)) selections[player.id] = botDraftChoice(state, player);
  const remaining = new Set(state.available);
  const players = state.players.map((player) => ({ ...player, cards: [...player.cards] }));
  const messages: string[] = [];
  for (const player of draftPriority(players, state.seed, state.draftRound)) {
    const requested = selections[player.id];
    const fallback = draftOffers({ ...state, available: [...remaining] }).find((card) => remaining.has(card.id))?.id;
    const allocated = remaining.has(requested) ? requested : fallback!;
    remaining.delete(allocated);
    player.cards.push(allocated);
    messages.push(`${player.name} took ${CARD_BY_ID.get(allocated)?.name}.`);
  }
  if (state.draftRound === 3) {
    return { ...state, phase: 'battle', players, available: [...remaining], draftSelections: {}, notice: `Draft complete. ${messages.join(' ')}` };
  }
  return {
    ...state,
    players,
    available: [...remaining],
    draftRound: state.draftRound + 1,
    draftSelections: {},
    notice: `${messages.join(' ')} Choose from the next shared row.`,
  };
}

function botBattleChoice(state: PracticeState, player: Player): BattlePlay {
  const tactic = ['advance', 'brace', 'feint'][(player.seat + state.battleRound - 1) % 3] as Stat;
  const cardId = [...player.cards].sort((a, b) => statValue(b, tactic) - statValue(a, tactic))[0];
  return { cardId, tactic };
}

export function lockPracticeBattle(state: PracticeState, play: BattlePlay): PracticeState {
  const you = state.players[0];
  if (state.phase !== 'battle' || state.battleSelections[LOCAL_PLAYER_ID] || !you.cards.includes(play.cardId)) return state;
  const selections: Record<string, BattlePlay> = { ...state.battleSelections, [LOCAL_PLAYER_ID]: play };
  for (const player of state.players.slice(1)) selections[player.id] = botBattleChoice(state, player);
  const priority = draftPriority(state.players, state.seed + 19, state.battleRound);
  const rank = new Map(priority.map((player, index) => [player.id, index]));
  const plays = state.players.map((player) => {
    const selected = selections[player.id];
    return { playerId: player.id, cardId: selected.cardId, tactic: selected.tactic, value: statValue(selected.cardId, selected.tactic) };
  }).sort((a, b) => b.value - a.value || (rank.get(a.playerId)! - rank.get(b.playerId)!));
  const winnerId = plays[0].playerId;
  const runnerUpId = plays[1]?.playerId;
  const players = state.players.map((player) => ({
    ...player,
    cards: player.cards.filter((id) => id !== selections[player.id].cardId),
    score: player.score + (player.id === winnerId ? 2 : player.id === runnerUpId ? 1 : 0),
  }));
  const record: BattleRecord = { round: state.battleRound, plays, winnerId, runnerUpId };
  const winner = players.find((player) => player.id === winnerId)!;
  if (state.battleRound === 3) {
    return { ...state, phase: 'result', players, battleSelections: {}, records: [...state.records, record], notice: `${winner.name} won battle 3. The sheet is complete.` };
  }
  return {
    ...state,
    players,
    battleRound: state.battleRound + 1,
    battleSelections: {},
    records: [...state.records, record],
    notice: `${winner.name} won battle ${state.battleRound}. Choose a card and tactic for battle ${state.battleRound + 1}.`,
  };
}

export function ranking(players: Player[], seed: number): Player[] {
  const order = new Map(draftPriority(players, seed + 41, 3).map((player, index) => [player.id, index]));
  return [...players].sort((a, b) => b.score - a.score || (order.get(a.id)! - order.get(b.id)!));
}
