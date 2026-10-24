import assert from 'node:assert/strict';
import { createRoom, addPlayer, beginControllerPreparation, updateController, CONTROLLER_STATES, fillAiSeats } from '../../../packages/domain/src/model.mjs';
import { LinxSessionAdapter } from '../src/session-adapter.mjs';

const room = createRoom({ roomId: 'adapter-room', hostPlayerId: 'human' }); addPlayer(room, { playerId: 'human', displayName: '观察员' }); fillAiSeats(room); beginControllerPreparation(room);
const clients = []; const released = []; const bound = [];
const adapter = new LinxSessionAdapter({
  clientFactory: () => { const client = { sessionId: `session-${clients.length + 1}`, async connect() {}, close() {} }; clients.push(client); return client; },
  connectionFor: async controller => ({ profileName: `profile-${controller.seatId}`, agentId: 'agent-1', identity: { deviceId: `device-${controller.seatId}` }, connection: { url: 'wss://unused', token: 'token' } }),
  bind: async value => { bound.push(value); }, release: async value => { released.push(value); }, now: () => '2026-01-01T00:00:00.000Z',
});
await adapter.connect(room, 'P2'); await adapter.connect(room, 'P3'); assert.equal(room.controllers[0].status, CONTROLLER_STATES.READY); assert.equal(room.controllers[1].sessionId, 'session-2'); assert.notEqual(room.controllers[0].sessionId, room.controllers[1].sessionId); assert.equal(bound.length, 2);
const oldEpoch = room.controllers[0].controllerEpoch; await adapter.reconnect(room, 'P2'); assert.ok(room.controllers[0].controllerEpoch > oldEpoch); assert.equal(room.controllers[0].status, CONTROLLER_STATES.READY); assert.equal(released.length, 1);
await adapter.releaseAll(room); assert.ok(room.controllers.every(controller => controller.status === CONTROLLER_STATES.RELEASED)); assert.equal(room.controllers[0].sessionId, null); console.log('session adapter lifecycle passed');
