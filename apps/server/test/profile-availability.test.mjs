import assert from 'node:assert/strict';
import { createApiServer } from '../src/api.mjs';

const sessions = {
  requireHost: true,
  checkAvailability() {
    throw Object.assign(new Error('灵矽身份正在被其他房间使用，请先结束其他房间后再试'), { code: 'PROFILE_IN_USE', status: 409 });
  },
  async prepare() {},
};
const { server } = createApiServer({ port: 0, sessions });
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
const created = await request('/api/rooms', { method: 'POST', body: JSON.stringify({ player_id: 'host', display_name: '房主' }) });
const room = await created.json();
for (let index = 0; index < 8; index += 1) {
  const response = await request(`/api/rooms/${room.room_id}/players`, { method: 'POST', headers: { 'x-player-id': 'host' }, body: JSON.stringify({ player_type: 'ai' }) });
  assert.equal(response.status, 201);
}
const started = await request(`/api/rooms/${room.room_id}/start`, { method: 'POST', headers: { 'x-player-id': 'host' }, body: '{}' });
assert.equal(started.status, 409);
assert.deepEqual((await started.json()).error, { code: 'PROFILE_IN_USE', message: '灵矽身份正在被其他房间使用，请先结束其他房间后再试' });
const state = await request(`/api/rooms/${room.room_id}/state`);
const stateBody = await state.json();
assert.equal(stateBody.state.phase, 'LOBBY');
assert.equal(stateBody.state.preparing, false);
assert.deepEqual(stateBody.state.controllers, []);
server.close();
console.log('profile availability preflight passed');
