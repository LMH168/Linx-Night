import assert from 'node:assert/strict';
import { createApiServer, roomCodes, rooms } from '../src/api.mjs';

const { server } = createApiServer({ port: 0 });
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
  headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  ...options,
});

const created = await request('/api/rooms', { method: 'POST', body: JSON.stringify({ player_id: 'room-code-host', display_name: '房主' }) });
assert.equal(created.status, 201);
const createdBody = await created.json();
assert.match(createdBody.room_code, /^\d{6}$/);
assert.equal(createdBody.state.roomCode, createdBody.room_code);
assert.equal(roomCodes.get(createdBody.room_code), createdBody.room_id);

const byCode = await request(`/api/rooms/${createdBody.room_code}/state`);
assert.equal(byCode.status, 200);
assert.equal((await byCode.json()).state.roomId, createdBody.room_id);

const byUuid = await request(`/api/rooms/${createdBody.room_id}/players`, {
  method: 'POST', body: JSON.stringify({ player_id: 'room-code-player', display_name: '玩家' }),
});
assert.equal(byUuid.status, 201);

const second = await request('/api/rooms', { method: 'POST', body: JSON.stringify({ player_id: 'room-code-host-2', display_name: '房主 2' }) });
assert.equal(second.status, 201);
const secondBody = await second.json();
assert.match(secondBody.room_code, /^\d{6}$/);
assert.notEqual(secondBody.room_code, createdBody.room_code);

const ended = await request(`/api/rooms/${createdBody.room_code}/end`, { method: 'POST', headers: { 'x-player-id': 'room-code-host' } });
assert.equal(ended.status, 200);
const endedBody = await ended.json();
assert.equal(endedBody.settlement.roomCode, createdBody.room_code);
assert.equal(roomCodes.has(createdBody.room_code), false);
assert.equal(rooms.has(createdBody.room_id), false);
const expired = await request(`/api/rooms/${createdBody.room_code}/state`);
assert.equal(expired.status, 404);
const settlement = await request(`/api/rooms/${createdBody.room_code}/settlement`, { headers: { 'x-player-id': 'room-code-host' } });
assert.equal(settlement.status, 200);
assert.equal((await settlement.json()).settlement.roomId, createdBody.room_id);

rooms.delete(secondBody.room_id);
roomCodes.delete(secondBody.room_code);
rooms.clear();
roomCodes.clear();
server.close();
console.log('room code tests passed');
