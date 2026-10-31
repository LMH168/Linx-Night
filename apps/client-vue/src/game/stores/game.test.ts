import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from './game';

describe('nine-player game store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('never exposes roles through the public seat view', () => {
    const store = useGameStore();
    for (const seat of store.publicSeats) {
      expect(seat).not.toHaveProperty('role');
      expect(seat).not.toHaveProperty('camp');
    }
    expect(store.selfRole).toBe('seer');
    expect(store.selfMeta.name).toBe('预言家');
  });

  it('only gives wolf teammates to the wolf viewpoint', () => {
    const store = useGameStore();
    expect(store.wolfTeammates).toEqual([]);
    store.applyScene('wolf');
    store.selectSeat('P2');
    expect(store.selectedSeatId).toBe('P3');
    store.selectSeat('P9');
    expect(store.selectedSeatId).toBe('P3');
    expect(store.selfRole).toBe('werewolf');
    expect(store.wolfTeammates.map(member => member.id)).toEqual(['P2', 'P6', 'P9']);
    expect(store.publicSeats.every(seat => !('role' in seat))).toBe(true);
  });

  it('enforces the guard no-repeat target and keeps the vote private', () => {
    const store = useGameStore();
    store.applyScene('guard');
    store.selectSeat('P1');
    expect(store.selectedSeatId).toBe('P3');
    store.selectSeat('P3');
    expect(store.selectedSeatId).toBe('P3');
    expect(store.guardLastTarget).toBe('P1');

    store.applyScene('vote');
    store.selectSeat('P2');
    expect(store.selectedSeatId).toBe(null);
    store.selectSeat('P6');
    store.confirmAction();
    expect(store.phase).toBe('VOTE');
    expect(store.submittedVoteSeatId).toBe('P6');
    store.setPhase('RESULT');
    expect(store.phase).toBe('RESULT');
    expect(store.winner).toBe('good');
    expect(store.aliveCount).toBe(5);
    expect(store.revealedSeats.filter(seat => !seat.alive).map(seat => seat.id)).toEqual(['P2', 'P4', 'P6', 'P9']);
  });

  it('reveals roles only in the settlement view model', () => {
    const store = useGameStore();
    const roles = store.revealedSeats.map(seat => seat.role);
    expect(roles).toEqual(['villager', 'werewolf', 'villager', 'villager', 'witch', 'werewolf', 'seer', 'guard', 'werewolf']);
    expect(store.publicSeats.some(seat => 'role' in seat)).toBe(false);
  });
});
