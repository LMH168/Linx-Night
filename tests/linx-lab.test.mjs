import assert from 'node:assert/strict';
import { createApiServer, rooms, publishNewEvents } from '../apps/server/src/api.mjs';
import { createMcpServer, registerSession, sessions } from '../apps/mcp/src/server.mjs';
import { newScenario, armScenario, evidenceReport } from '../scripts/lab/scenarios.mjs';
const api = createApiServer().server, mcp = createMcpServer({ authToken: 'test', adminToken: 'admin' }).server;
await Promise.all([api, mcp].map(s => new Promise(r => s.listen(0, '127.0.0.1', r))));
const apiBase = `http://127.0.0.1:${api.address().port}`, mcpBase = `http://127.0.0.1:${mcp.address().port}`;
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
try {
  assert.throws(() => newScenario('invalid'));
  assert.throws(() => armScenario(newScenario('speech')), /P1/);
  const ids = [];
  for (const name of ['lobby', 'speech', 'vote']) {
    const scenario = newScenario(name), room = scenario.room; ids.push(room.roomId); rooms.set(room.roomId, room);
    const joined = await (await post(`${apiBase}/api/rooms/${room.roomId}/players`, { display_name: '观察员' })).json();
    assert.equal(joined.player.seatId, 'P1');
    armScenario(scenario); publishNewEvents(room);
    assert.throws(() => armScenario(scenario));
    if (name === 'lobby') { assert.equal(room.phase, 'LOBBY'); continue; }
    assert.equal(room.seats[1].role, 'villager');
    assert.equal(room.seats.filter(s => s.role === 'werewolf').length, 3);
    const binding = { sessionId: `test-${name}`, deviceId: 'test-device', agentId: 'test-agent' };
    scenario.binding = binding;
    registerSession({ ...binding, roomId: room.roomId, seatId: 'P2', playerId: room.seats[1].playerId });
    const abort = new AbortController();
    const stream = await fetch(`${apiBase}/api/rooms/${room.roomId}/events?after=${room.version}`, { signal: abort.signal });
    const reader = stream.body.getReader(); await reader.read();
    const response = await (await post(mcpBase + '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: name === 'speech' ? 'submit_speech' : 'submit_vote', arguments: name === 'speech' ? { text: '模拟 HTTP 发言，非真实灵矽' } : { target_player_id: 'P3' } } }, { authorization: 'Bearer test', 'x-linx-session-id': binding.sessionId, 'x-linx-device-id': binding.deviceId, 'x-linx-agent-id': binding.agentId })).json();
    assert.equal(response.result.isError, false);
    const frame = new TextDecoder().decode((await reader.read()).value);
    assert.match(frame, name === 'speech' ? /game.speech_submitted/ : /game.vote_submitted/);
    abort.abort();
    const requests = (await (await fetch(mcpBase + '/admin/diagnostics', { headers: { authorization: 'Bearer admin' } })).json()).requests;
    const report = evidenceReport(scenario, requests);
    assert.ok(Object.values(report.serverChecks).every(Boolean));
    assert.equal(report.overall, 'pending'); assert.equal(report.platformEvidence, 'pending');
    assert.doesNotMatch(JSON.stringify(report), /test-device|test-agent|模拟 HTTP 发言/);
    const publicRoom = (await (await fetch(`${apiBase}/api/rooms/${room.roomId}/state`)).json()).state;
    assert.equal(publicRoom.phase, name === 'speech' ? 'SPEECH' : 'NIGHT_WOLF');
    if (name === 'speech') assert.equal(publicRoom.currentSeatId, 'P3');
    else assert.equal(publicRoom.seats[2].alive, false);
    assert.equal(evidenceReport(scenario, []).serverChecks.acceptedOnce, false);
  }
  assert.equal(new Set(ids).size, 3);
  console.log('Isolated fixtures, normal browser join API, HTTP actions, SSE delivery and pending evidence classification passed (simulated, not live Linx)');
} finally {
  rooms.clear(); sessions.clear();
  for (const s of [api, mcp]) s.closeAllConnections();
  await Promise.all([api, mcp].map(s => new Promise(r => s.close(r))));
}
