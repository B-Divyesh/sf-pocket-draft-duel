import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/cards';
import { createPractice, draftOffers, lockPracticeBattle, lockPracticeDraft, ranking } from '../src/game';

describe('practice game rules', () => {
  it('plays a deterministic draft through a single result', () => {
    let state = createPractice(17);
    for (let round = 0; round < 3; round += 1) state = lockPracticeDraft(state, draftOffers(state)[0].id);
    expect(state.phase).toBe('battle');
    expect(state.players.every((player) => player.cards.length === 3)).toBe(true);
    for (let round = 0; round < 3; round += 1) {
      state = lockPracticeBattle(state, { cardId: state.players[0].cards[0], tactic: 'advance' });
    }
    expect(state.phase).toBe('result');
    expect(state.records).toHaveLength(3);
    expect(ranking(state.players, state.seed)[0].score).toBeGreaterThanOrEqual(3);
  });

  it('keeps all allocated draft cards unique when choices collide', () => {
    let state = createPractice(29);
    for (let round = 0; round < 3; round += 1) state = lockPracticeDraft(state, draftOffers(state)[0].id);
    const cards = state.players.flatMap((player) => player.cards);
    expect(new Set(cards).size).toBe(cards.length);
  });

  it('@claim:fixed-card-set uses exactly 18 fixed cards in a practice draft', () => {
    expect(CARDS).toHaveLength(18);
    expect(new Set(CARDS.map((card) => card.id)).size).toBe(18);
  });
});
