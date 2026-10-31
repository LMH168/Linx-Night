import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from './game';
import { useRoomStore } from '../../stores/room';

function seed() {
  const room = useRoomStore();
  room.publicState = {
    roomId: 'room-real',
    hostPlayerId: 'player-1',
    gameId: 'game-1',
    controllerEpoch: 1,
    controllerPhase: 'ready',
    preparing: false,
    phase: 'VOTE',
    version: 4,
    round: 1,
    currentSeatId: null,
    submittedVoteRound: 1,
    submittedVoteSeatIds: ['P2'],
    seats: [
      { seatId: 'P1', displayName: '真人', playerType: 'human', controlSource: 'human', alive: true },
      { seatId: 'P2', displayName: '灵矽一号', playerType: 'ai', controlSource: 'linx', alive: true },
      { seatId: 'P3', displayName: '出局者', playerType: 'ai', controlSource: 'linx', alive: false },
    ],
    controllers: [], hostController: null, speeches: [{ speechId: 's1', round: 1, seatId: 'P1', text: '公开发言' }],
    voteResolutions: [{ resolutionId: 'v1', round: 1, entries: [{ seatId: 'P1', votes: 2 }], totalVotes: 2, maxVotes: 2, leaders: ['P1'], eliminatedSeatId: 'P1' }],
    events: [], hostPlaybackEnabled: false, hostPlaybackBlocked: false,
  };
  room.privateState = {
    roomId: 'room-real', playerId: 'player-1', seatId: 'P1', role: 'seer', camp: 'good', alive: true,
    skills: {}, seerResults: [{ targetSeatId: 'P2', result: 'werewolf' }], currentTurn: null,
    hunterAction: null, lastWords: null, requiredAction: null,
  };
  return useGameStore();
}

describe('real game store adapter', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('maps public and private server state without inventing roles or phases', () => {
    const store = seed();
    expect(store.roomId).toBe('room-real');
    expect(store.phase).toBe('VOTE');
    expect(store.publicSeats).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'P1', name: '真人', isSelf: true, alive: true }),
      expect.objectContaining({ id: 'P3', name: '出局者', alive: false }),
    ]));
    expect(store.selfRole).toBe('seer');
    expect(store.seerChecks[0]).toMatchObject({ targetSeatId: 'P2', result: 'wolf' });
    expect(store.voteTally[0]).toEqual({ seatId: 'P1', votes: 2 });
  });

  it('keeps private identity out of public seat projections', () => {
    const store = seed();
    expect(store.publicSeats.find(seat => seat.id === 'P1')).not.toHaveProperty('role');
    expect(store.publicSeats.find(seat => seat.id === 'P2')).not.toHaveProperty('camp');
    expect(store.revealedSeats.find(seat => seat.id === 'P1')?.role).toBeUndefined();
  });
});
