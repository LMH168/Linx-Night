import assert from 'node:assert/strict';
import { createApiServer, rooms } from '../apps/server/src/api.mjs';
import { createRoom, addPlayer, PHASES } from '../packages/domain/src/model.mjs';
import { tickRoom } from '../apps/scheduler/src/local.mjs';

const manager = { async prepare(room) { for (const c of room.controllers) { c.status = 'ready'; c.sessionId = `test-${c.seatId}`; c.agentId = 'test-agent'; c.deviceId = `test-device-${c.seatId}`; } room.controllerPhase = 'ready'; }, async release(room) { room.controllers.forEach(c => { c.status = 'released'; c.sessionId = null; }); } };
const api = createApiServer({ port: 0, sessions: manager, linxSeats: ['P2', 'P3'] }).server; await new Promise(resolve => api.listen(0, resolve)); const base = `http://127.0.0.1:${api.address().port}`; const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
try {
  const created = await (await post('/api/rooms', { display_name: '观察员' })).json(); const room = rooms.get(created.room_id); const started = await post(`/api/rooms/${room.roomId}/start`, {}, { 'x-player-id': created.player_id }); assert.equal(started.status, 202); await new Promise(resolve => setImmediate(resolve));
  assert.equal(room.phase, PHASES.NIGHT_WOLF); assert.deepEqual(room.controllers.map(c => c.seatId), ['P2', 'P3']); assert.ok(room.seats.filter(s => s.playerType === 'ai').length === 8); assert.equal(room.seats.find(s => s.seatId === 'P2').controlSource, 'linx'); assert.equal(room.seats.find(s => s.seatId === 'P4').controlSource, 'rule_bot');
  tickRoom(room); assert.equal(room.actions.some(action => ['P2', 'P3'].includes(action.seatId)), false, 'Linx seats must wait for their own action');
  const cancelled = await post(`/api/rooms/${room.roomId}/controllers/cancel`, {}, { 'x-player-id': created.player_id }); assert.equal(cancelled.status, 200); assert.equal(room.phase, PHASES.LOBBY); assert.equal(room.controllers.length, 0); console.log('1 human + 2 Linx + 6 rule bots mixed e2e passed');
} finally { rooms.clear(); api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
