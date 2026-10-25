import { randomUUID } from 'node:crypto';
import { appendEvent, CAMPS, CONNECTION_STATES, PHASES, ROLES } from './model.mjs';

export class RuleError extends Error {}

const aliveSeats = room => room.seats.filter(seat => seat.alive);
const seatOf = (room, seatId) => room.seats.find(seat => seat.seatId === seatId);
const requireAlive = (room, seatId) => { const seat = seatOf(room, seatId); if (!seat || !seat.alive) throw new RuleError('target seat is not alive'); return seat; };
const commandKey = (room, key) => room.actions.some(action => action.actionId === key) || room.votes.some(vote => vote.voteId === key);
const recordAction = (room, action) => { if (commandKey(room, action.actionId)) throw new RuleError('duplicate action'); room.actions.push(action); room.version += 1; appendEvent(room, { type: 'game.action_submitted', data: { actionId: action.actionId } }); };
const transition = (room, phase, data = {}) => { room.phase = phase; room.currentSeatId = data.seatId ?? null; room.version += 1; appendEvent(room, { type: 'game.phase_changed', data: { phase, ...data } }); };

export function startGame(room) {
  if (room.phase !== PHASES.ROLE_ASSIGNMENT) throw new RuleError('roles must be assigned before starting');
  transition(room, PHASES.NIGHT_WOLF); return room;
}

export function wolfTarget(room, seatId, targetSeatId, actionId) {
  if (room.phase !== PHASES.NIGHT_WOLF) throw new RuleError('wolf action is not allowed now');
  const actor = seatOf(room, seatId); if (!actor?.alive || actor.camp !== CAMPS.WEREWOLF) throw new RuleError('actor is not a living werewolf');
  requireAlive(room, targetSeatId); if (targetSeatId === seatId) throw new RuleError('werewolves cannot target themselves');
  const wolves = aliveSeats(room).filter(seat => seat.camp === CAMPS.WEREWOLF); const submitted = room.actions.filter(action => action.turnId === room.round && action.actionType === 'wolf_target' && wolves.some(wolf => wolf.seatId === action.seatId));
  if (submitted.some(a => a.seatId === seatId)) throw new RuleError('seat already submitted');
  if (submitted.length && submitted[0].targetSeatId !== targetSeatId) throw new RuleError('werewolf targets must agree');
  const projected = [...submitted, { seatId, targetSeatId }];
  if (projected.length >= wolves.length && new Set(projected.slice(-wolves.length).map(action => action.targetSeatId)).size !== 1) throw new RuleError('werewolf targets must agree');
  recordAction(room, { actionId, turnId: room.round, actionType: 'wolf_target', seatId, targetSeatId });
  if (projected.length >= wolves.length) {
    const targets = new Set(projected.slice(-wolves.length).map(action => action.targetSeatId));
    if (targets.size !== 1) throw new RuleError('werewolf targets must agree');
    room.pendingNight = { wolfTarget: targetSeatId }; transition(room, PHASES.NIGHT_SEER); skipAbsentRoles(room);
  }
  return room;
}

export function seerCheck(room, seatId, targetSeatId, actionId) {
  if (room.phase !== PHASES.NIGHT_SEER) throw new RuleError('seer action is not allowed now');
  const actor = seatOf(room, seatId); if (!actor?.alive || actor.role !== ROLES.SEER) throw new RuleError('actor is not the living seer');
  const target = requireAlive(room, targetSeatId); recordAction(room, { actionId, turnId: room.round, actionType: 'seer_check', seatId, targetSeatId });
  const result = target.camp === CAMPS.WEREWOLF ? 'werewolf' : 'good'; actor.seerResults.push({ round: room.round, seatId: targetSeatId, result });
  transition(room, PHASES.NIGHT_WITCH); skipAbsentRoles(room); return result;
}

export function skipSeerAction(room, seatId, actionId) {
  if (room.phase !== PHASES.NIGHT_SEER) throw new RuleError('seer action is not allowed now');
  const actor = seatOf(room, seatId); if (!actor?.alive || actor.role !== ROLES.SEER) throw new RuleError('actor is not the living seer');
  recordAction(room, { actionId, turnId: room.round, actionType: 'seer_skip', seatId });
  transition(room, PHASES.NIGHT_WITCH); skipAbsentRoles(room); return room;
}

export function witchAction(room, seatId, action, targetSeatId, actionId) {
  if (room.phase !== PHASES.NIGHT_WITCH) throw new RuleError('witch action is not allowed now');
  const actor = seatOf(room, seatId); if (!actor?.alive || actor.role !== ROLES.WITCH) throw new RuleError('actor is not the living witch');
  if (!['save', 'poison', 'skip'].includes(action)) throw new RuleError('invalid witch action');
  if (commandKey(room, actionId)) throw new RuleError('duplicate action');
  if (action === 'poison') requireAlive(room, targetSeatId);
  if (!room.pendingNight) throw new RuleError('night action context is unavailable');
  if (action === 'save') { if (!actor.skills.antidoteAvailable) throw new RuleError('antidote is unavailable'); actor.skills.antidoteAvailable = false; }
  if (action === 'poison') { if (!actor.skills.poisonAvailable) throw new RuleError('poison is unavailable'); actor.skills.poisonAvailable = false; }
  recordAction(room, { actionId, turnId: room.round, actionType: 'witch_action', seatId, action, targetSeatId: targetSeatId ?? null });
  room.pendingNight.witch = { action, targetSeatId: targetSeatId ?? null }; transition(room, PHASES.DAY_ANNOUNCEMENT); return room;
}

export function announceDay(room) {
  if (room.phase !== PHASES.DAY_ANNOUNCEMENT) throw new RuleError('day announcement is not allowed now');
  const night = room.pendingNight ?? {}; const deaths = new Set();
  if (night.wolfTarget && night.witch?.action !== 'save') deaths.add(night.wolfTarget);
  if (night.witch?.action === 'poison') deaths.add(night.witch.targetSeatId);
  room.pendingNight = null;
  appendEvent(room, { type: 'game.night_resolved', data: { round: room.round, deathSeatIds: [...deaths] } });
  for (const seatId of deaths) eliminate(room, seatId, 'night');
  if (room.hunterResponse?.status === 'open') return room;
  const winner = checkWinner(room); if (winner) return winner;
  transition(room, PHASES.SPEECH, { seatId: aliveSeats(room)[0]?.seatId ?? null }); return room;
}

export function submitSpeech(room, seatId, text, actionId) {
  if (room.phase !== PHASES.SPEECH || room.currentSeatId !== seatId) throw new RuleError('speech is not allowed for this seat now');
  const seat = requireAlive(room, seatId); if (typeof text !== 'string' || !text.trim()) throw new RuleError('speech must not be empty');
  recordAction(room, { actionId, turnId: room.round, actionType: 'speech', seatId }); room.speeches.push({ speechId: actionId, round: room.round, seatId, text: text.trim() }); room.version += 1; appendEvent(room, { type: 'game.speech_submitted', data: { speechId: actionId, seatId } });
  const next = aliveSeats(room).find(item => item.seatId > seat.seatId); const first = aliveSeats(room)[0]; if (next) transition(room, PHASES.SPEECH, { seatId: next.seatId }); else transition(room, PHASES.VOTE); return room;
}

export function submitVote(room, seatId, targetSeatId, voteId) {
  if (room.phase !== PHASES.VOTE) throw new RuleError('vote is not allowed now');
  if (commandKey(room, voteId)) throw new RuleError('duplicate action');
  requireAlive(room, seatId); requireAlive(room, targetSeatId); if (room.votes.some(vote => vote.round === room.round && vote.seatId === seatId)) throw new RuleError('seat already voted');
  room.votes.push({ voteId, round: room.round, seatId, targetSeatId }); room.version += 1;
  appendEvent(room, { type: 'game.vote_submitted', data: { voteId, seatId } });
  if (room.votes.filter(vote => vote.round === room.round).length === aliveSeats(room).length) resolveVotes(room); return room;
}

export { submitHunterResponse as hunterShot };

function openHunterResponse(room, hunter, cause) {
  if (room.hunterResponse?.status === 'open') return room.hunterResponse;
  const phaseBefore = room.phase;
  const now = Date.now();
  room.hunterResponse = { windowId: `hunter_${randomUUID()}`, seatId: hunter.seatId, phaseBefore, cause, status: 'open', createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString(), targetSeatId: null };
  transition(room, PHASES.HUNTER_RESPONSE, { seatId: hunter.seatId });
  appendEvent(room, { type: 'game.hunter_response_opened', data: { windowId: room.hunterResponse.windowId, seatId: hunter.seatId, cause, expiresAt: room.hunterResponse.expiresAt } });
  return room.hunterResponse;
}

function continueAfterHunter(room) {
  const response = room.hunterResponse; if (!response) return room;
  const before = response.phaseBefore;
  const winner = checkWinner(room); if (winner) return room;
  if (before === PHASES.DAY_ANNOUNCEMENT) transition(room, PHASES.SPEECH, { seatId: aliveSeats(room)[0]?.seatId ?? null });
  else if (before === PHASES.VOTE) { room.round += 1; transition(room, PHASES.NIGHT_WOLF); }
  return room;
}

function requireHunterResponse(room, seatId, actionId, windowId, now) {
  const response = room.hunterResponse;
  if (room.phase !== PHASES.HUNTER_RESPONSE || !response || response.status !== 'open') throw new RuleError('hunter response is not open');
  if (windowId !== response.windowId) throw new RuleError('hunter response window mismatch');
  if (now >= Date.parse(response.expiresAt)) throw new RuleError('hunter response has expired');
  if (typeof actionId !== 'string' || !actionId.trim()) throw new RuleError('action id is required');
  if (commandKey(room, actionId)) throw new RuleError('duplicate action');
  const hunter = seatOf(room, seatId); if (!hunter || hunter.seatId !== response.seatId || hunter.role !== ROLES.HUNTER || hunter.alive || !hunter.skills.hunterShotAvailable) throw new RuleError('hunter shot is unavailable');
  return { response, hunter };
}

export function submitHunterResponse(room, seatId, targetSeatId, actionId, windowId, now = Date.now()) {
  const { response, hunter } = requireHunterResponse(room, seatId, actionId, windowId, now);
  requireAlive(room, targetSeatId); hunter.skills.hunterShotAvailable = false; recordAction(room, { actionId, turnId: room.round, actionType: 'hunter_shot', seatId, targetSeatId }); response.status = 'completed'; response.targetSeatId = targetSeatId; room.version += 1; appendEvent(room, { type: 'game.hunter_response_closed', data: { windowId: response.windowId, seatId, status: response.status, targetSeatId } }); eliminate(room, targetSeatId, 'hunter'); return continueAfterHunter(room);
}

export function skipHunterResponse(room, seatId, actionId, windowId, now = Date.now()) {
  const { response, hunter } = requireHunterResponse(room, seatId, actionId, windowId, now);
  recordAction(room, { actionId, turnId: room.round, actionType: 'hunter_response_skip', seatId });
  hunter.skills.hunterShotAvailable = false; response.status = 'skipped';
  appendEvent(room, { type: 'game.hunter_response_closed', data: { windowId: response.windowId, seatId, status: response.status } });
  return continueAfterHunter(room);
}

export function expireHunterResponse(room, now = Date.now()) {
  const response = room.hunterResponse; if (room.phase !== PHASES.HUNTER_RESPONSE || !response || response.status !== 'open') return false;
  if (now < Date.parse(response.expiresAt)) return false;
  seatOf(room, response.seatId).skills.hunterShotAvailable = false;
  response.status = 'expired';
  appendEvent(room, { type: 'game.hunter_response_closed', data: { windowId: response.windowId, seatId: response.seatId, status: response.status } });
  continueAfterHunter(room); return true;
}

function resolveVotes(room) {
  const votes = room.votes.filter(vote => vote.round === room.round); const counts = new Map(); for (const vote of votes) counts.set(vote.targetSeatId, (counts.get(vote.targetSeatId) ?? 0) + 1);
  const max = Math.max(...counts.values()); const leaders = [...counts].filter(([, count]) => count === max).map(([seatId]) => seatId); appendEvent(room, { type: 'game.vote_resolved', data: { leaders } });
  if (leaders.length === 1) eliminate(room, leaders[0], 'vote');
  if (room.hunterResponse?.status === 'open') return room;
  const winner = checkWinner(room); if (winner) return winner; room.round += 1; transition(room, PHASES.NIGHT_WOLF); return room;
}

function eliminate(room, seatId, cause) { const seat = seatOf(room, seatId); if (!seat?.alive) return; seat.alive = false; seat.connectionState = CONNECTION_STATES.DISCONNECTED; room.version += 1; appendEvent(room, { type: 'game.player_eliminated', data: { seatId, cause } }); if (seat.role === ROLES.HUNTER && seat.skills.hunterShotAvailable) openHunterResponse(room, seat, cause); }

export function checkWinner(room) { if (room.hunterResponse?.status === 'open') return null; const wolves = aliveSeats(room).filter(seat => seat.camp === CAMPS.WEREWOLF).length; const good = aliveSeats(room).filter(seat => seat.camp === CAMPS.GOOD).length; if (wolves === 0) { transition(room, PHASES.GAME_OVER, { winner: CAMPS.GOOD }); return CAMPS.GOOD; } if (wolves >= good) { transition(room, PHASES.GAME_OVER, { winner: CAMPS.WEREWOLF }); return CAMPS.WEREWOLF; } return null; }

export function skipAbsentRoles(room) {
  if (room.phase === PHASES.NIGHT_SEER && !aliveSeats(room).some(s => s.role === ROLES.SEER)) transition(room, PHASES.NIGHT_WITCH);
  if (room.phase === PHASES.NIGHT_WITCH && !aliveSeats(room).some(s => s.role === ROLES.WITCH)) transition(room, PHASES.DAY_ANNOUNCEMENT);
}
