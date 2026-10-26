import assert from 'node:assert/strict';
import { createMcpServer, registerSession, sessions } from '../src/server.mjs';
import { rooms, events } from '../../server/src/api.mjs';
import { createRoom, addPlayer, createTurn } from '../../../packages/domain/src/model.mjs';
import { announceDay, submitVote } from '../../../packages/domain/src/engine.mjs';

const { server } = createMcpServer({ authToken: 'test', adminToken: 'admin' });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let room, selected, sequence = 0;
const received = [];
const unsubscribe = events.subscribe('actions-test', e => received.push(e));
function setup(phase = 'SPEECH', actor = 2) {
  sessions.clear(); received.length = 0;
  room = createRoom({ roomId: 'actions-test', hostPlayerId: 'p1' });
  const roles = ['villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager'];
  roles.forEach((role, i) => {
    addPlayer(room, { playerId: `p${i + 1}`, displayName: '测试' });
    Object.assign(room.seats[i], { role, camp: role === 'werewolf' ? 'werewolf' : 'good', skills: { antidoteAvailable: role === 'witch', poisonAvailable: role === 'witch', hunterShotAvailable: role === 'hunter' } });
    registerSession({ sessionId: `s${i + 1}`, roomId: room.roomId, seatId: `P${i + 1}`, playerId: `p${i + 1}`, deviceId: 'device', agentId: 'agent' });
  });
  Object.assign(room, { phase, currentSeatId: 'P2', pendingNight: { wolfTarget: 'P9' } });
  rooms.set(room.roomId, room); selected = `s${actor}`;
}
async function rpc(method, params, extra = {}) {
  return (await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test', 'x-linx-session-id': selected, 'x-linx-device-id': 'device', 'x-linx-agent-id': 'agent', ...extra }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }) })).json();
}
const call = (name, args = {}, headers) => rpc('tools/call', { name, arguments: args }, headers);
async function reject(name, args, code) {
  const before = structuredClone(room);
  const response = await call(name, args);
  if (typeof code === 'number') assert.equal(response.error.code, code);
  else { assert.equal(response.result.isError, true); if (code) assert.equal(JSON.parse(response.result.content[0].text).code, code); }
  assert.deepEqual(room, before, `${name} rejected without mutation`);
}
try {
  setup('LOBBY');
  assert.equal(JSON.parse((await call('get_public_game_state')).result.content[0].text).phase, 'LOBBY');
  const tools = (await rpc('tools/list')).result.tools;
  for (const name of ['submit_vote', 'submit_wolf_target', 'submit_seer_check', 'submit_hunter_shot']) assert.ok(tools.find(t => t.name === name).inputSchema.required.includes('target_player_id'));
  assert.ok(tools.find(t => t.name === 'submit_vote').inputSchema.properties.action_id);
  setup();
  for (const args of [null, [], 'text', { text: '' }, { text: 1 }, { text: 'hi', player_id: 'p1' }, { text: 'hi', action_id: '' }]) await reject('submit_speech', args, 'INVALID_ARGUMENTS');
  await reject('submit_vote', {}, 'INVALID_ARGUMENTS');
  await reject('submit_vote', { target_player_id: 'P99' }, 'INVALID_ARGUMENTS');
  await reject('submit_witch_action', { action: 'poison' }, 'INVALID_ARGUMENTS');
  await reject('missing_tool', {}, -32601);
  selected = 'missing'; await reject('get_public_game_state', {}, -32001); selected = 's2';
  assert.equal((await call('get_public_game_state', {}, { 'x-linx-device-id': 'wrong' })).error.code, -32003);
  registerSession({ sessionId: 'host', roomId: room.roomId, seatId: 'P1', playerId: 'p1', role: 'host' }); selected = 'host';
  await reject('submit_speech', { text: 'not allowed' }, -32002); selected = 's2';
  room.currentSeatId = 'P3'; await reject('submit_speech', { text: 'not my turn' }); room.currentSeatId = 'P2';
  room.seats[1].alive = false; await reject('submit_speech', { text: 'dead' }); room.seats[1].alive = true;
  const speech = JSON.parse((await call('submit_speech', { text: 'private-content-not-in-diagnostics', action_id: 'speech-1' })).result.content[0].text);
  assert.equal(speech.accepted, true); assert.ok(speech.requestId); assert.equal(speech.actionId, 'speech-1');
  assert.equal(room.currentSeatId, 'P3'); assert.equal(room.speeches.length, 1);
  assert.deepEqual(speech.eventIds, received.map(e => e.eventId));
  assert.equal(received.filter(e => e.type === 'game.speech_submitted').length, 1);
  await reject('submit_speech', { text: 'retry', action_id: 'speech-1' });
  selected = 's3'; await reject('submit_speech', { text: 'other seat', action_id: 'speech-1' });
  setup('VOTE');
  const vote = JSON.parse((await call('submit_vote', { target_player_id: 'P3', action_id: 'vote-1' })).result.content[0].text);
  assert.equal(vote.eventIds.length, 1); assert.equal(room.votes.length, 1);
  assert.deepEqual(received[0].data, { voteId: 'vote-1', seatId: 'P2' });
  await reject('submit_vote', { target_player_id: 'P4', action_id: 'vote-1' });
  await reject('submit_vote', { target_player_id: 'P4', action_id: 'vote-2' });
  selected = 's1'; await reject('submit_vote', { target_player_id: 'P4', action_id: 'vote-1' });
  setup('VOTE'); for (const seat of room.seats.filter(s => s.seatId !== 'P2')) submitVote(room, seat.seatId, 'P3', `fixture-${seat.seatId}`);
  await call('submit_vote', { target_player_id: 'P3' });
  assert.equal(room.phase, 'LAST_WORDS'); assert.equal(room.seats[2].alive, false);
  assert.equal(room.events.filter(e => e.type === 'game.vote_resolved').length, 1);
  setup('NIGHT_WOLF', 3); assert.equal((await call('submit_wolf_target', { target_player_id: 'P9' })).result.isError, false);
  // A teammate can submit between the agent's state read and its write.
  selected = 's4';
  const beforeConflict = structuredClone(room);
  const conflict = await call('submit_wolf_target', { target_player_id: 'P8', action_id: 'wolf-correctable' });
  const hint = JSON.parse(conflict.result.content[0].text).recovery;
  assert.equal(conflict.result.isError, true);assert.deepEqual(room, beforeConflict);
  assert.equal(hint.code, 'WOLF_TARGET_CONFLICT');assert.equal(hint.arguments.target_player_id, 'P9');
  assert.equal(hint.arguments.action_id, 'wolf-correctable');
  const corrected = await call(hint.tool, hint.arguments);
  assert.equal(JSON.parse(corrected.result.content[0].text).accepted, true);
  assert.equal(room.actions.filter(a => a.actionId === 'wolf-correctable').length, 1);
  await reject(hint.tool, hint.arguments);
  selected = 's2';
  const outsider = await call('submit_wolf_target', {target_player_id:'P8'});
  assert.equal(JSON.parse(outsider.result.content[0].text).recovery, undefined);
  // Enabling leases rejects stale requests before exposing a correction target.
  selected = 's5';room.requireActionLease = true;room.seats[4].controlSource = 'linx';
  const stale = await call('submit_wolf_target', {target_player_id:'P8',turn_id:'expired'});
  assert.equal(JSON.parse(stale.result.content[0].text).recovery, undefined);
  assert.deepEqual(room.actions, [...beforeConflict.actions, room.actions.at(-1)]);
  room.requireActionLease = false;
  selected = 's2'; await reject('submit_wolf_target', { target_player_id: 'P9' });
  setup('NIGHT_WOLF',3);await call('submit_wolf_target',{target_player_id:'P9'});
  room.requireActionLease=true;room.gameId='recovery-game';selected='s4';room.seats[3].controlSource='linx';
  room.controllers=[{seatId:'P4',status:'ready',controllerEpoch:1,sessionId:'s4',deviceId:'device',agentId:'agent'}];
  registerSession({sessionId:'s4',roomId:room.roomId,seatId:'P4',playerId:'p4',deviceId:'device',agentId:'agent',gameId:room.gameId,controllerEpoch:1});
  const lease=createTurn(room,{seatId:'P4',controlSource:'linx',controllerEpoch:1});room.turns.at(-1).expiresAt=Date.now()+60000;
  const leasedBefore=structuredClone(room);
  const leasedConflict=JSON.parse((await call('submit_wolf_target',{target_player_id:'P8',turn_id:lease.turnId,action_id:'leased-fix'})).result.content[0].text);
  assert.deepEqual(room,leasedBefore);assert.equal(leasedConflict.recovery.arguments.turn_id,lease.turnId);
  assert.equal(JSON.parse((await call('submit_wolf_target',leasedConflict.recovery.arguments)).result.content[0].text).accepted,true);
  assert.equal(room.turns.at(-1).status,'completed');await reject('submit_wolf_target',leasedConflict.recovery.arguments);
  setup('NIGHT_SEER', 6); assert.equal(JSON.parse((await call('submit_seer_check', { target_player_id: 'P3' })).result.content[0].text).result, 'werewolf');
  for (const action of ['save', 'poison', 'skip']) {
    setup('NIGHT_WITCH', 7);
    assert.equal((await call('submit_witch_action', { action, ...(action === 'poison' ? { target_player_id: 'P3' } : {}) })).result.isError, false);
    assert.equal(room.phase, 'DAY_ANNOUNCEMENT');
  }
  setup('NIGHT_WITCH', 7); room.pendingNight = null; await reject('submit_witch_action', { action: 'save' });
  setup('SPEECH', 8); await reject('submit_hunter_shot', { target_player_id: 'P3' }); room.phase = 'DAY_ANNOUNCEMENT'; room.pendingNight = {wolfTarget:'P8'}; announceDay(room);
  assert.equal((await call('submit_hunter_shot', { target_player_id: 'P3', window_id: room.hunterResponse.windowId })).result.isError, false);
  await reject('submit_hunter_shot', { target_player_id: 'P4' });
  setup('GAME_OVER');
  for (const name of ['submit_speech', 'submit_vote', 'submit_wolf_target', 'submit_seer_check', 'submit_witch_action', 'submit_hunter_shot']) {
    const args = name === 'submit_speech' ? { text: 'late' } : name === 'submit_witch_action' ? { action: 'skip' } : { target_player_id: 'P3' };
    await reject(name, args);
  }
  const diagnostic = await (await fetch(base + '/admin/diagnostics', { headers: { authorization: 'Bearer admin' } })).json();
  const entry = diagnostic.requests.find(r => r.actionId === 'speech-1' && r.resultCode === 'OK');
  assert.equal(entry.requestId, speech.requestId); assert.ok(entry.afterVersion > entry.beforeVersion);
  assert.deepEqual(entry.eventIds, speech.eventIds);
  assert.doesNotMatch(JSON.stringify(diagnostic), /private-content-not-in-diagnostics/);
  console.log('MCP action schemas, atomic rejection, deduplication, events, diagnostics and night regression passed');
} finally { unsubscribe(); rooms.delete('actions-test'); sessions.clear(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
