import assert from 'node:assert/strict';
import { createApiServer, rooms } from '../apps/server/src/api.mjs';
import { createMcpServer, sessions, devices } from '../apps/mcp/src/server.mjs';
import { newScenario, armScenario, evidenceReport } from '../scripts/lab/scenarios.mjs';
import { verifiedProgramBinding } from '../scripts/lab/program-binding.mjs';
import { sanitizeProtocol, programEvidence } from '../scripts/lab/program-evidence.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api = createApiServer().server, mcp = createMcpServer({ authToken: 'test-token', adminToken: 'test-admin' }).server;
await Promise.all([api, mcp].map(s => new Promise(r => s.listen(0, '127.0.0.1', r))));
const base = `http://127.0.0.1:${mcp.address().port}`, apiBase = `http://127.0.0.1:${api.address().port}`;
const post = async (url, body, headers = {}) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })).json();
const diagnostics = async () => (await (await fetch(base + '/admin/diagnostics', { headers: { authorization: 'Bearer test-admin' } })).json()).requests;
const call = (session, device, name, args = {}) => post(base + '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { authorization: 'Bearer test-token', 'x-linx-session-id': session, 'x-linx-device-id': device, 'x-linx-agent-id': 'expected-agent' });
try {
  const scenario = newScenario('dual-speech'), room = scenario.room; rooms.set(room.roomId, room);
  await post(`${apiBase}/api/rooms/${room.roomId}/players`, { display_name: '观察员' }); armScenario(scenario);
  const inputs = [];
  for (const [seatId, suffix] of [['P2', 'a'], ['P3', 'b']]) {
    const identity = { name: `player-${suffix}`, deviceId: `device-${suffix}`, clientId: `client-${suffix}` };
    const connection = { ...identity, runId: `run-${suffix}`, connectedAt: scenario.armedAt };
    const sessionId = `session-${suffix}`;
    const unknown = await call(sessionId, identity.deviceId, 'get_my_private_state'); assert.equal(unknown.error.code, -32001);
    const input = { scenario, seatId, identity, connection, agentId: 'expected-agent', sessionId, requests: await diagnostics() };
    const before = structuredClone(room);
    assert.throws(() => verifiedProgramBinding({ ...input, agentId: 'wrong-agent' }));
    assert.throws(() => verifiedProgramBinding({ ...input, connection: { ...connection, deviceId: 'wrong' } }));
    assert.throws(() => verifiedProgramBinding({ ...input, connection: { ...connection, sessionId: 'wrong' } }));
    assert.throws(() => verifiedProgramBinding({ ...input, requests: input.requests.map(r => ({ ...r, authenticated: false })) }));
    assert.throws(() => verifiedProgramBinding({ ...input, requests: input.requests.map(r => ({ ...r, at: '2000-01-01' })) }));
    assert.deepEqual(room, before);
    const binding = verifiedProgramBinding(input);
    await post(base + '/admin/bindings', binding, { authorization: 'Bearer test-admin' });
    scenario.bindings ||= {}; scenario.bindings[seatId] = binding;
    assert.throws(() => verifiedProgramBinding(input), /已绑定/);
    inputs.push(input);
  }
  const privateA = JSON.parse((await call('session-a', 'device-a', 'get_my_private_state')).result.content[0].text);
  const privateB = JSON.parse((await call('session-b', 'device-b', 'get_my_private_state')).result.content[0].text);
  assert.equal(privateA.seatId, 'P2'); assert.equal(privateA.role, 'villager'); assert.deepEqual(privateA.werewolfTeammates, []);
  assert.equal(privateB.seatId, 'P3'); assert.equal(privateB.role, 'werewolf'); assert.deepEqual(privateB.werewolfTeammates, ['P4', 'P5']);
  const before = structuredClone(room);
  assert.equal((await call('session-a', 'device-b', 'submit_speech', { text: 'wrong' })).error.code, -32003);
  assert.equal((await call('session-b', 'device-b', 'submit_speech', { text: 'out of turn' })).result.isError, true);
  assert.deepEqual(room, before);
  const abort = new AbortController(); const stream = await fetch(`${apiBase}/api/rooms/${room.roomId}/events?after=${room.version}`, { signal: abort.signal }); const reader = stream.body.getReader(); await reader.read();
  for (const suffix of ['a', 'b']) {
    assert.equal((await call(`session-${suffix}`, `device-${suffix}`, 'submit_speech', { text: `模拟 ${suffix}，不是灵矽`, action_id: `action-${suffix}` })).result.isError, false);
    assert.match(new TextDecoder().decode((await reader.read()).value), /game.speech_submitted/);
  }
  abort.abort();
  const report = evidenceReport(scenario, await diagnostics()); assert.ok(Object.values(report.serverChecks).every(Boolean)); assert.equal(report.overall, 'pending');
  assert.doesNotMatch(JSON.stringify(report), /device-a|session-a|expected-agent|不是灵矽/);
  const publicState = (await (await fetch(`${apiBase}/api/rooms/${room.roomId}/state`)).json()).state; assert.equal(publicState.currentSeatId, 'P4');
  assert.equal(evidenceReport(scenario, []).serverChecks.actionsValid, false);
  const evidenceRoot = await mkdtemp(join(tmpdir(), 'linx-evidence-'));
  try {
    const directory = join(evidenceRoot, 'player-a', 'evidence'); await mkdir(directory, { recursive: true });
    const at = new Date().toISOString(), attemptId = '6f76ab32-c084-4055-862d-d1b57fde0ee6';
    const records = [{ runId: 'run-a', type: 'input_start', at, attemptId, samples: 320 }, { runId: 'run-a', type: 'stt', at, attemptId, text: 'private-role', textLength: 12 }, { runId: 'run-a', type: 'turn_finished', at, attemptId, gameAccepted: true, token: 'secret-token' }, { runId: 'other-run', type: 'input_start', at }];
    await writeFile(join(directory, '1-abcd.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n{unfinished');
    const exported = await programEvidence(scenario, await diagnostics(), evidenceRoot);
    assert.equal(exported.clients[0].logStatus, 'incomplete'); assert.equal(exported.clients[1].logStatus, 'unavailable');
    assert.equal(exported.clients[0].attempts.length, 1); assert.equal(exported.clients[0].attempts[0].gameAccepted, 'unverified');
    assert.equal(exported.clients[0].protocol.length, 3); assert.ok(exported.clients[0].mcp.some(r => r.actionId === 'action-a'));
    assert.doesNotMatch(JSON.stringify(exported), /private-role|secret-token|device-a|session-a|expected-agent/); assert.equal(exported.overall, 'pending');
  } finally { await rm(evidenceRoot, { recursive: true }); }
  const duplicate = { ...inputs[1], scenario: { ...scenario, bindings: { P2: scenario.bindings.P2 } }, identity: inputs[0].identity, connection: inputs[0].connection, sessionId: 'session-a' };
  assert.throws(() => verifiedProgramBinding(duplicate), /身份重复/);
  const full = structuredClone(room); await call('session-a', 'device-a', 'submit_speech', { text: 'retry', action_id: 'action-a' }); assert.deepEqual(room, full);
  sessions.clear(); devices.clear(); rooms.clear(); // Same cleanup performed by scene/quit; no broad fallback remains.
  assert.equal((await call('session-a', 'device-a', 'get_my_private_state')).error.code, -32001);
  const fresh = newScenario('speech'); rooms.set(fresh.room.roomId, fresh.room);
  await post(`${apiBase}/api/rooms/${fresh.room.roomId}/players`, { display_name: '观察员' }); armScenario(fresh);
  await call('new-session', 'device-a', 'get_public_game_state');
  const renewed = verifiedProgramBinding({ ...inputs[0], scenario: fresh, sessionId: 'new-session', connection: { ...inputs[0].connection, connectedAt: fresh.armedAt, runId: 'new-run' }, requests: await diagnostics() });
  await post(base + '/admin/bindings', renewed, { authorization: 'Bearer test-admin' });
  assert.equal((await call('new-session', 'device-a', 'submit_speech', { text: '模拟重连' })).result.isError, false);
  assert.equal((await call('session-a', 'device-a', 'submit_speech', { text: 'stale' })).error.code, -32001);
  const sanitized = sanitizeProtocol([{ runId: 'r', type: 'stt', at: new Date().toISOString(), text: 'secret-role', token: 'secret-token', textLength: 11 }, { runId: 'r', type: 'unexpected', at: new Date().toISOString(), text: 'secret' }], 'r');
  assert.equal(sanitized.length, 1); assert.doesNotMatch(JSON.stringify(sanitized), /secret/);
  console.log('Program binding, dual-seat privacy/actions/SSE, immutable rejection, fresh-session cleanup and redaction passed (simulated, not live Linx).');
} finally { rooms.clear(); sessions.clear(); devices.clear(); for (const server of [api, mcp]) server.closeAllConnections(); await Promise.all([api, mcp].map(server => new Promise(resolve => server.close(resolve)))); }
