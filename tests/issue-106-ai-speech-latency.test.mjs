import assert from 'node:assert/strict';
import { LinxTurnRuntime } from '../apps/scheduler/src/linx-runtime.mjs';
import { createRoom, addPlayer, fillAiSeats, beginControllerPreparation, completeTurn } from '../packages/domain/src/model.mjs';
import { submitSpeech } from '../packages/domain/src/engine.mjs';

const room = createRoom({ hostPlayerId: 'host' });
addPlayer(room, { playerId: 'host', displayName: '房主' });
fillAiSeats(room);
beginControllerPreparation(room, { aiSeatIds: ['P2', 'P3'] });
room.preparing = false;
room.requireActionLease = true;
room.phase = 'SPEECH';
room.currentSeatId = 'P2';
room.hostPlaybackBlocked = true;
for (const seat of room.seats) {
  seat.role = 'villager'; seat.camp = 'good';
  if (seat.seatId === 'P2' || seat.seatId === 'P3') seat.controlSource = 'linx';
  else if (seat.playerId) seat.controlSource = 'human';
}
for (const controller of room.controllers) controller.status = 'ready';

let connects = 0;
let sends = 0;
const manager = {
  async ensureConnected(current, seat) {
    const controller = current.controllers.find(item => item.seatId === seat.seatId);
    if (controller.status === 'ready' && controller.sessionId) return;
    connects += 1;
    controller.status = 'ready';
    controller.sessionId = `session-${seat.seatId}`;
  },
  async sendTurn(current, seat) {
    sends += 1;
    const turn = current.turns.find(item => item.status === 'active' && item.seatId === seat.seatId);
    submitSpeech(current, seat.seatId, `AI ${seat.seatId} 发言`, `speech-${sends}`);
    completeTurn(current, turn.turnId);
  },
  async releaseSeat() { throw new Error('healthy sessions must remain open between turns'); },
};

const runtime = new LinxTurnRuntime({ manager, timeoutMs: 100 });
await runtime.tick(room);
await runtime.tick(room);

assert.equal(sends, 2);
assert.equal(connects, 2, 'each AI seat connects once and reuses its session on later turns');
assert.equal(room.speeches.length, 2);
assert.equal(room.currentSeatId, 'P4');
assert.equal(room.hostPlaybackBlocked, true, 'host playback state remains observable');
console.log('Issue #106: consecutive AI speech ignores host playback gate and reuses healthy sessions');
