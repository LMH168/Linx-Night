import { createRoom, fillAiSeats, assignRoles } from '../../packages/domain/src/model.mjs';
import { submitSpeech, submitVote } from '../../packages/domain/src/engine.mjs';

export const scenarios = ['lobby', 'speech', 'vote', 'dual-speech'];
export function newScenario(name) {
  if (!scenarios.includes(name)) throw new Error('场景必须是 lobby、speech、vote 或 dual-speech');
  return { name, room: createRoom(), armed: false, createdAt: new Date().toISOString() };
}
export function armScenario(scenario) {
  const { room, name } = scenario;
  if (scenario.armed || room.phase !== 'LOBBY') throw new Error('场景已准备或已被开始，请创建新场景');
  if (room.seats[0].playerType !== 'human' || room.seats.slice(1).some(s => s.playerId)) throw new Error('请仅让一名真人通过网页加入 P1');
  room.hostPlayerId = room.seats[0].playerId;
  fillAiSeats(room);
  if (name !== 'lobby') {
    assignRoles(room);
    const roles = ['villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager'];
    room.seats.forEach((seat, i) => {
      seat.role = roles[i]; seat.camp = seat.role === 'werewolf' ? 'werewolf' : 'good';
      seat.skills = { antidoteAvailable: seat.role === 'witch', poisonAvailable: seat.role === 'witch', hunterShotAvailable: seat.role === 'hunter' };
    });
    room.phase = 'SPEECH'; room.currentSeatId = 'P1';
    // Fixed test checkpoints only; this module is never loaded by run.mjs.
    const speakers = name === 'speech' || name === 'dual-speech' ? [room.seats[0]] : room.seats;
    for (const seat of speakers) submitSpeech(room, seat.seatId, '测试夹具发言', `fixture-speech-${seat.seatId}`);
    if (name === 'vote') for (const seat of room.seats.filter(s => s.seatId !== 'P2')) submitVote(room, seat.seatId, 'P3', `fixture-vote-${seat.seatId}`);
  }
  scenario.armed = true;
  scenario.baselineVersion = room.version;
  scenario.armedAt = new Date().toISOString();
  return room;
}

export function evidenceReport(scenario, requests) {
  if (scenario.name === 'dual-speech') return dualEvidence(scenario, requests);
  const { room, baselineVersion, binding } = scenario;
  const matched = requests.filter(r => r.roomId === room.roomId && r.sessionId === binding?.sessionId && r.agentId === binding?.agentId && r.deviceId === binding?.deviceId && r.beforeVersion >= baselineVersion);
  const expectedTool = scenario.name === 'speech' ? 'submit_speech' : 'submit_vote';
  const accepted = matched.filter(r => r.tool === expectedTool && r.resultCode === 'OK');
  const newEvents = room.events.filter(e => e.version > baselineVersion);
  const actionCount = scenario.name === 'speech' ? room.speeches.filter(s => s.seatId === 'P2').length : room.votes.filter(v => v.seatId === 'P2').length;
  const stateMatches = scenario.name === 'speech' ? room.phase === 'SPEECH' && room.currentSeatId === 'P3' : room.phase === 'NIGHT_WOLF' && !room.seats[2].alive && newEvents.filter(e => e.type === 'game.vote_resolved').length === 1;
  const linked = accepted.length === 1 && accepted[0].eventIds.length > 0 && accepted[0].eventIds.every(id => newEvents.some(e => e.eventId === id));
  const primary = newEvents.filter(e => e.type === (scenario.name === 'speech' ? 'game.speech_submitted' : 'game.vote_submitted') && e.data.seatId === 'P2');
  return {
    scenario: scenario.name, exportedAt: new Date().toISOString(), armedAt: scenario.armedAt, boundAt: scenario.boundAt,
    source: 'unverified-remote-client', platformEvidence: 'pending', browserEvidence: 'pending', overall: 'pending',
    serverChecks: { acceptedOnce: accepted.length === 1, actionOnce: actionCount === 1, primaryEventOnce: primary.length === 1, stateMatches, linked },
    requests: matched.map(({ requestId, actionId, at, tool, status, resultCode, beforeVersion, afterVersion, eventIds, failure }) => ({ requestId, actionId, at, tool, status, resultCode, beforeVersion, afterVersion, eventIds, failure, roomAlias: 'test-room', sessionAlias: 'test-session', seatId: 'P2' })),
    events: newEvents.map(e => ({ eventId: e.eventId, version: e.version, type: e.type })),
  };
}

function dualEvidence(scenario, requests) {
  const { room, baselineVersion, bindings = {} } = scenario;
  const newEvents = room.events.filter(e => e.version > baselineVersion);
  const seats = ['P2', 'P3'].map(seatId => {
    const binding = bindings[seatId];
    const matched = requests.filter(r => binding && r.roomId === room.roomId && r.seatId === seatId && r.sessionId === binding.sessionId && r.deviceId === binding.deviceId && r.agentId === binding.agentId && r.beforeVersion >= baselineVersion);
    const accepted = matched.filter(r => r.tool === 'submit_speech' && r.resultCode === 'OK');
    const primary = newEvents.filter(e => e.type === 'game.speech_submitted' && e.data.seatId === seatId);
    return { seatId, checks: { acceptedOnce: accepted.length === 1, actionOnce: room.speeches.filter(s => s.seatId === seatId).length === 1, primaryEventOnce: primary.length === 1, linked: accepted.length === 1 && primary.length === 1 && accepted[0].eventIds.includes(primary[0].eventId) && accepted[0].eventIds.every(id => newEvents.some(e => e.eventId === id)) }, requests: matched.map(({ at, requestId, actionId, tool, resultCode, beforeVersion, afterVersion, eventIds }) => ({ at, requestId, actionId, tool, resultCode, beforeVersion, afterVersion, eventIds, seatId, sessionAlias: `session-${seatId}` })) };
  });
  return { scenario: scenario.name, exportedAt: new Date().toISOString(), source: 'unverified-remote-client', platformEvidence: 'pending', browserEvidence: 'pending', overall: 'pending', serverChecks: { distinctIdentities: Boolean(bindings.P2 && bindings.P3 && bindings.P2.sessionId !== bindings.P3.sessionId && bindings.P2.deviceId !== bindings.P3.deviceId && bindings.P2.agentId === bindings.P3.agentId), actionsValid: seats.every(s => Object.values(s.checks).every(Boolean)), stateMatches: room.phase === 'SPEECH' && room.currentSeatId === 'P4' }, seats, events: newEvents.map(e => ({ eventId: e.eventId, version: e.version, type: e.type })) };
}
