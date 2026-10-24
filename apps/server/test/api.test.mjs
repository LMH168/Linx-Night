import assert from 'node:assert/strict';
import { createApiServer, rooms } from '../src/api.mjs';
const { server } = createApiServer({ port: 0 }); await new Promise(resolve => server.listen(0, resolve)); const port = server.address().port;
const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
const created = await request('/api/rooms', { method: 'POST', body: JSON.stringify({ player_id: 'host', display_name: '房主' }) }); assert.equal(created.status, 201); const room = await created.json();
const joined = await request(`/api/rooms/${room.room_id}/players`, { method: 'POST', body: JSON.stringify({ player_id: 'human2', display_name: '玩家 2' }) }); assert.equal(joined.status, 201);
const started = await request(`/api/rooms/${room.room_id}/start`, { method: 'POST', headers: { 'x-player-id': 'host' } }); assert.equal(started.status, 200); const startedBody = await started.json(); assert.equal(startedBody.state.seats.length, 9); assert.equal(startedBody.private_state.playerId, 'host');
const privateResponse = await request(`/api/rooms/${room.room_id}/private-state`, { headers: { 'x-player-id': 'human2' } }); assert.equal(privateResponse.status, 200); const privateBody = await privateResponse.json(); assert.ok(privateBody.private_state.role);
const denied = await request(`/api/rooms/${room.room_id}/private-state`, { headers: { 'x-player-id': 'missing' } }); assert.equal(denied.status, 403); rooms.clear(); server.close(); console.log('api tests passed');
