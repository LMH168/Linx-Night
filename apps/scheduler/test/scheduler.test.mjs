import assert from 'node:assert/strict';
import { AiScheduler } from '../src/scheduler.mjs';

const room = { roomId: 'scheduler_room', version: 1, seats: [{ seatId: 'P1', playerType: 'human', alive: true }, { seatId: 'P2', playerType: 'ai', alive: true }] };
let calls = 0; const scheduler = new AiScheduler({ timeoutMs: 50, adapter: { isTurn: () => true, play: async () => { calls += 1; return 'played'; } }, defaultAction: async () => 'default' }); scheduler.register(room); const done = await scheduler.tick(room.roomId); assert.equal(done.status, 'completed'); assert.equal(calls, 1);
const timeoutScheduler = new AiScheduler({ timeoutMs: 1, adapter: { isTurn: () => true, play: () => new Promise(() => {}) }, defaultAction: async (_, __, error) => `fallback:${error.message}` }); timeoutScheduler.register(room); const fallback = await timeoutScheduler.tick(room.roomId); assert.equal(fallback.status, 'defaulted'); assert.match(fallback.result, /fallback/); console.log('scheduler tests passed');
const linxRoom = { roomId: 'linx-turn', version: 1, round: 0, phase: 'SPEECH', turns: [], events: [], seats: [{ seatId: 'P2', playerType: 'ai', controlSource: 'linx', alive: true }], controllers: [{ seatId: 'P2', controllerEpoch: 3 }] };
let defaults = 0; const linxScheduler = new AiScheduler({ timeoutMs: 1, adapter: { isTurn: () => true, play: () => new Promise(() => {}) }, defaultAction: async () => { defaults += 1; } }); linxScheduler.register(linxRoom); const waiting = await linxScheduler.tick(linxRoom.roomId); assert.equal(waiting.status, 'waiting'); assert.equal(defaults, 0); assert.equal(linxRoom.turns[0].controllerEpoch, 3); assert.equal(linxRoom.turns[0].status, 'expired');
console.log('linx turns wait without rule fallback');
