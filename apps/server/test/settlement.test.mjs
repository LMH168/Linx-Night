import assert from 'node:assert/strict';
import { createApiServer, rooms, settlements } from '../src/api.mjs';

const request = (port, path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
  headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  ...options,
});

const sessions = {
  async release() { throw Object.assign(new Error('release unavailable'), { code: 'RELEASE_FAILED' }); },
};
const { server } = createApiServer({ port: 0, sessions });
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;

const created = await request(port, '/api/rooms', { method: 'POST', body: JSON.stringify({ player_id: 'settlement-host', display_name: '房主' }) });
assert.equal(created.status, 201);
const room = await created.json();
const joined = await request(port, `/api/rooms/${room.room_id}/players`, { method: 'POST', body: JSON.stringify({ player_id: 'settlement-player', display_name: '玩家' }) });
assert.equal(joined.status, 201);

const deniedEnd = await request(port, `/api/rooms/${room.room_id}/end`, { method: 'POST', headers: { 'x-player-id': 'settlement-player' } });
assert.equal(deniedEnd.status, 403);

const ended = await request(port, `/api/rooms/${room.room_id}/end`, { method: 'POST', headers: { 'x-player-id': 'settlement-host' } });
assert.equal(ended.status, 200);
const endedBody = await ended.json();
assert.equal(endedBody.settlement.settlement_type, undefined);
assert.equal(endedBody.settlement.settlementType, 'HOST_ENDED');
assert.equal(endedBody.settlement.winner, null);
assert.equal(endedBody.settlement.release.controllers, 'failed');
assert.equal(endedBody.settlement.release.mcpBindings, 'failed');
assert.equal(endedBody.settlement.release.error, 'release unavailable');
assert.equal(rooms.has(room.room_id), false);

const settlementId = endedBody.settlement_id;
const byRoom = await request(port, `/api/rooms/${room.room_id}/settlement`, { headers: { 'x-player-id': 'settlement-player' } });
assert.equal(byRoom.status, 200);
assert.equal((await byRoom.json()).settlement.settlementId, settlementId);
const byId = await request(port, `/api/settlements/${settlementId}`, { headers: { 'x-player-id': 'settlement-host' } });
assert.equal(byId.status, 200);
const report = (await byId.json()).settlement;
assert.equal(report.settlementId, settlementId);
assert.equal('participants' in report, false);

const stranger = await request(port, `/api/settlements/${settlementId}`, { headers: { 'x-player-id': 'stranger' } });
assert.equal(stranger.status, 403);
const oldState = await request(port, `/api/rooms/${room.room_id}/state`);
assert.equal(oldState.status, 404);

const repeated = await request(port, `/api/rooms/${room.room_id}/end`, { method: 'POST', headers: { 'x-player-id': 'settlement-host' } });
assert.equal(repeated.status, 200);
const repeatedBody = await repeated.json();
assert.equal(repeatedBody.idempotent, true);
assert.equal(repeatedBody.settlement_id, settlementId);
assert.equal(settlements.size, 1);

rooms.clear(); settlements.clear(); server.close();
console.log('settlement API tests passed');
