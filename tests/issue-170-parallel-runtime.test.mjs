import assert from 'node:assert/strict';
import { LinxTurnRuntime } from '../apps/scheduler/src/linx-runtime.mjs';
import { completeTurn, createRoom, createTurn } from '../packages/domain/src/model.mjs';
import { submitVote, wolfTarget } from '../packages/domain/src/engine.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(phase) {
  const room = createRoom({ hostPlayerId: 'human' });
  room.gameId = 'game-parallel'; room.phase = phase; room.requireActionLease = true;
  room.seats.forEach((seat, index) => {
    seat.playerId = index === 0 ? 'human' : `ai-${seat.seatId}`;
    seat.playerType = index === 0 ? 'human' : 'ai';
    seat.controlSource = index === 0 ? 'human' : 'linx';
    seat.role = phase === 'NIGHT_WOLF' && index < 4 ? 'werewolf' : 'villager';
    seat.camp = seat.role === 'werewolf' ? 'werewolf' : 'good';
  });
  room.controllers = room.seats.slice(1, 4).map(seat => ({ seatId: seat.seatId, controllerEpoch: 1, status: 'ready', sessionId: `session-${seat.seatId}` }));
  return room;
}

let inFlight = 0;
let maxInFlight = 0;
const manager = {
  async ensureConnected() {},
  async sendTurn(room, seat) {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    await delay(20);
    const turn = room.turns.find(item => item.status === 'active' && item.seatId === seat.seatId);
    if (room.phase === 'NIGHT_WOLF') wolfTarget(room, seat.seatId, 'P9', `wolf-${seat.seatId}`);
    else submitVote(room, seat.seatId, 'P9', `vote-${seat.seatId}`);
    completeTurn(room, turn.turnId);
    inFlight -= 1;
  },
};

const wolves = fixture('NIGHT_WOLF');
await new LinxTurnRuntime({ manager, timeoutMs: 500 }).tick(wolves);
assert.equal(maxInFlight, 3, '狼人应在同一批次并发行动');
assert.equal(wolves.actions.filter(action => action.actionType === 'wolf_target').length, 3);

inFlight = 0; maxInFlight = 0;
const votes = fixture('VOTE');
await new LinxTurnRuntime({ manager, timeoutMs: 500 }).tick(votes);
assert.equal(maxInFlight, 3, '投票应在同一批次并发提交');
assert.equal(votes.votes.length, 3);
assert.equal(votes.voteResolutions.length, 0, '真人尚未投票时不能提前结算');

const failedVotes = fixture('VOTE');
const failingManager = {
  async ensureConnected() {},
  async sendTurn(room, seat) {
    await delay(10);
    if (seat.seatId === 'P2') throw new Error('simulated AI timeout');
    const turn = room.turns.find(item => item.status === 'active' && item.seatId === seat.seatId);
    submitVote(room, seat.seatId, 'P9', `failed-batch-${seat.seatId}`);
    completeTurn(room, turn.turnId);
  },
};
await new LinxTurnRuntime({ manager: failingManager, timeoutMs: 100 }).tick(failedVotes);
assert.equal(failedVotes.votes.length, 2, '单个 AI 失败时同批其他投票仍应提交');
assert.equal(failedVotes.controllers.find(controller => controller.seatId === 'P2').status, 'failed');

const timedWolf = fixture('NIGHT_WOLF');
timedWolf.seats[0].role = 'villager'; timedWolf.seats[0].camp = 'good';
const timedWolfManager = {
  async ensureConnected() {},
  async sendTurn(room, seat) {
    if (seat.seatId === 'P2') return new Promise(() => {});
    await delay(10);
    const turn = room.turns.find(item => item.status === 'active' && item.seatId === seat.seatId);
    wolfTarget(room, seat.seatId, 'P9', `timeout-wolf-${seat.seatId}`);
    completeTurn(room, turn.turnId);
  },
};
await new LinxTurnRuntime({ manager: timedWolfManager, timeoutMs: 40 }).tick(timedWolf);
assert.equal(timedWolf.actions.filter(action => action.actionType === 'wolf_target').length, 3, '狼人超时应使用已有提案完成安全默认行动');
assert.notEqual(timedWolf.phase, 'NIGHT_WOLF', '狼人超时不能把房间卡在狼人阶段');
assert.equal(timedWolf.controllers.find(controller => controller.seatId === 'P2').status, 'ready', '安全默认行动不应把控制器标记为失败');

console.log('Issue 170 parallel wolf and AI vote batches passed');
