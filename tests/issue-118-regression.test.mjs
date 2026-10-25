import assert from 'node:assert/strict';
import { LinxTurnRuntime } from '../apps/scheduler/src/linx-runtime.mjs';
import { createRoom, addPlayer } from '../packages/domain/src/model.mjs';

const room = createRoom({ hostPlayerId: 'host' });
for (const [playerId, playerType] of [['host', 'human'], ['ai2', 'ai'], ['ai3', 'ai']]) {
  addPlayer(room, { playerId, displayName: playerId, playerType });
}
room.gameId = 'game-118';
room.phase = 'SPEECH';
room.round = 0;
room.currentSeatId = 'P2';
room.requireActionLease = true;
room.invalidated = false;
room.seats.find(seat => seat.seatId === 'P2').controlSource = 'linx';
room.seats.find(seat => seat.seatId === 'P3').controlSource = 'linx';
room.controllers = [
  { seatId: 'P2', status: 'ready', controllerEpoch: 1, sessionId: 's2' },
  { seatId: 'P3', status: 'ready', controllerEpoch: 1, sessionId: 's3' },
];
room.speechPlayback = { speechId: 'speech-2', seatId: 'P2', status: 'pending' };

let resolveWarmup;
let sent = 0;
let connects = 0;
const runtime = new LinxTurnRuntime({
  manager: {
    ensureConnected: async () => { connects += 1; return new Promise(resolve => { resolveWarmup = resolve; }); },
    sendTurn: async () => { sent += 1; },
  },
});

await runtime.tick(room);
await new Promise(resolve => setImmediate(resolve));
assert.equal(room.speechPrewarm.status, 'connecting');
assert.equal(room.turns.length, 0, '预热不能创建下一席行动租约');
assert.equal(sent, 0, '预热不能发送下一席触发音频');
runtime.tick(room);
await new Promise(resolve => setImmediate(resolve));
assert.equal(connects, 1, '同一上下文不能重复预热');

room.currentSeatId = 'P3';
resolveWarmup();
await new Promise(resolve => setImmediate(resolve));
assert.equal(room.speechPrewarm.status, 'stale', '上下文变化后预热结果必须失效');
assert.equal(room.turns.length, 0);
assert.equal(sent, 0);

console.log('Issue #118 regression: prewarm remains action-free and stale results cannot advance the room');
