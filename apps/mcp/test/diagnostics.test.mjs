import assert from 'node:assert/strict';
import { createMcpServer, registerSession, sessions } from '../src/server.mjs';
import { rooms } from '../../server/src/api.mjs';
import { createRoom, addPlayer } from '../../../packages/domain/src/model.mjs';

const { server } = createMcpServer({ authToken: 'mcp-secret', adminToken: 'admin-secret' });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const read = token => fetch(base + '/admin/diagnostics', { headers: { authorization: `Bearer ${token}` } });
const call = (name, sessionId = 'unbound', token = 'mcp-secret') => fetch(base + '/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-linx-session-id': sessionId, 'x-linx-device-id': 'test-device', 'x-linx-agent-id': 'test-agent' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: name === 'submit_vote' ? { target_player_id: 'P1' } : {} } }),
}).then(r => r.json());
const room = createRoom({ roomId: 'diagnostic-room', hostPlayerId: 'diagnostic-player' });
addPlayer(room, { playerId: 'diagnostic-player', displayName: '测试' }); rooms.set(room.roomId, room);
const session = registerSession({ roomId: room.roomId, seatId: 'P1', playerId: 'diagnostic-player' });
try {
  assert.equal((await read('mcp-secret')).status, 403);
  assert.equal((await read('')).status, 403);
  assert.equal((await call('get_public_game_state')).error.code, -32001);
  await call('get_public_game_state', 'untrusted-session', 'invalid-secret');
  const state = await call('get_public_game_state', session);
  assert.equal(JSON.parse(state.result.content[0].text).phase, 'LOBBY');
  assert.equal((await call('submit_vote', session)).result.isError, true);
  const response = await read('admin-secret');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { requests } = await response.json();
  assert.equal(requests.length, 4);
  assert.equal(requests[0].failure.reason, 'unknown Linx session');
  assert.equal(requests[0].sessionId, 'unbound');
  assert.equal(requests[0].deviceId, 'test-device');
  assert.equal(requests[1].status, 401);
  assert.equal(requests[1].sessionId, undefined);
  assert.equal(requests[2].failure, undefined);
  assert.equal(requests[3].failure.reason, 'vote is not allowed now');
  assert.doesNotMatch(JSON.stringify(requests), /mcp-secret|admin-secret|invalid-secret|private-speech-do-not-log|untrusted-session/);
  for (let i = 0; i < 101; i++) await call('get_public_game_state');
  assert.equal((await (await read('admin-secret')).json()).requests.length, 100);
  console.log('MCP diagnostics: access control, identity, redaction, lobby query, phase rejection and retention passed');
} finally {
  sessions.delete(session); rooms.delete(room.roomId);
  server.closeAllConnections(); await new Promise(r => server.close(r));
}
