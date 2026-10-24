import assert from 'node:assert/strict';
import { addPlayer, createRoom, CONTROLLER_STATES } from '../../../packages/domain/src/model.mjs';
import { createApiServer, rooms } from '../src/api.mjs';

const manager = {
  async prepare(room) { room.controllers.forEach(controller => { controller.status = CONTROLLER_STATES.READY; }); room.controllerPhase = 'ready'; },
  async release(room) { room.controllers.forEach(controller => { controller.status = CONTROLLER_STATES.RELEASED; }); },
};
const { server } = createApiServer({ port: 0, sessions: manager }); await new Promise(resolve => server.listen(0, resolve)); const base = `http://127.0.0.1:${server.address().port}`; const request = (path, options = {}) => fetch(base + path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
try {
  const room = createRoom({ roomId: 'controller-api', hostPlayerId: 'host' }); addPlayer(room, { playerId: 'host', displayName: '房主' }); rooms.set(room.roomId, room);
  const started = await request(`/api/rooms/${room.roomId}/start`, { method: 'POST', headers: { 'x-player-id': 'host' } }); assert.equal(started.status, 202); const startBody = await started.json(); assert.equal(startBody.state.controllerPhase, 'connecting');
  await new Promise(resolve => setImmediate(resolve)); const state = await (await request(`/api/rooms/${room.roomId}/state`)).json(); assert.equal(state.state.phase, 'NIGHT_WOLF');
  const controllers = await (await request(`/api/rooms/${room.roomId}/controllers`, { headers: { 'x-player-id': 'host' } })).json(); assert.equal(controllers.phase, 'ready'); assert.equal(controllers.controllers.length, 2); assert.deepEqual(controllers.controllers.map(controller => controller.seatId), ['P2', 'P3']);
  const cancel = await request(`/api/rooms/${room.roomId}/controllers/cancel`, { method: 'POST', headers: { 'x-player-id': 'host' } }); assert.equal(cancel.status, 200); assert.equal((await cancel.json()).state.phase, 'LOBBY');
  console.log('controller preparation, query and cancellation passed');
} finally { rooms.clear(); server.close(); }
