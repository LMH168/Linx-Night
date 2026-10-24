import { appendEvent, CAMPS, CONNECTION_STATES, PHASES, ROLES } from './model.mjs';

const aliveSeats = room => room.seats.filter(seat => seat.alive);
const seatOf = (room, seatId) => room.seats.find(seat => seat.seatId === seatId);
const requireAlive = (room, seatId) => { const seat = seatOf(room, seatId); if (!seat || !seat.alive) throw new Error('target seat is not alive'); return seat; };
const commandKey = (room, key) => room.actions.some(action => action.actionId === key) || room.votes.some(vote => vote.voteId === key);
const recordAction = (room, action) => { if (commandKey(room, action.actionId)) throw new Error('duplicate action'); room.actions.push(action); room.version += 1; appendEvent(room, { type: 'game.action_submitted', data: { actionId: action.actionId, seatId: action.seatId, actionType: action.actionType } }); };
const transition = (room, phase, data = {}) => { room.phase = phase; room.currentSeatId = data.seatId ?? null; room.version += 1; appendEvent(room, { type: 'game.phase_changed', data: { phase, ...data } }); };

export function startGame(room) {
  if (room.phase !== PHASES.ROLE_ASSIGNMENT) throw new Error('roles must be assigned before starting');
  transition(room, PHASES.NIGHT_WOLF); return room;
}

export function wolfTarget(room, seatId, targetSeatId, actionId) {
  if (room.phase !== PHASES.NIGHT_WOLF) throw new Error('wolf action is not allowed now');
  const actor = seatOf(room, seatId); if (!actor?.alive || actor.camp !== CAMPS.WEREWOLF) throw new Error('actor is not a living werewolf');
  requireAlive(room, targetSeatId); if (targetSeatId === seatId) throw new Error('werewolves cannot target themselves');
  recordAction(room, { actionId, turnId: room.round, actionType: 'wolf_target', seatId, targetSeatId });
  const wolves = aliveSeats(room).filter(seat => seat.camp === CAMPS.WEREWOLF); const submitted = room.actions.filter(action => action.actionType === 'wolf_target' && wolves.some(wolf => wolf.seatId === action.seatId));
  if (submitted.length >= wolves.length) {
    const targets = new Set(submitted.slice(-wolves.length).map(action => action.targetSeatId));
    if (targets.size !== 1) throw new Error('werewolf targets must agree');
    room.pendingNight = { wolfTarget: submitted.at(-1).targetSeatId }; transition(room, PHASES.NIGHT_SEER);
  }
  return room;
}

export function seerCheck(room, seatId, targetSeatId, actionId) {
  if (room.phase !== PHASES.NIGHT_SEER) throw new Error('seer action is not allowed now');
  const actor = seatOf(room, seatId); if (!actor?.alive || actor.role !== ROLES.SEER) throw new Error('actor is not the living seer');
  const target = requireAlive(room, targetSeatId); recordAction(room, { actionId, turnId: room.round, actionType: 'seer_check', seatId, targetSeatId });
  const result = target.camp === CAMPS.WEREWOLF ? 'werewolf' : 'good'; actor.seerResults.push({ round: room.round, seatId: targetSeatId, result });
  transition(room, PHASES.NIGHT_WITCH); return result;
}

export function witchAction(room, seatId, action, targetSeatId, actionId) {
  if (room.phase !== PHASES.NIGHT_WITCH) throw new Error('witch action is not allowed now');
  const actor = seatOf(room, seatId); if (!actor?.alive || actor.role !== ROLES.WITCH) throw new Error('actor is not the living witch');
  if (!['save', 'poison', 'skip'].includes(action)) throw new Error('invalid witch action');
  if (action === 'save') { if (!actor.skills.antidoteAvailable) throw new Error('antidote is unavailable'); actor.skills.antidoteAvailable = false; }
  if (action === 'poison') { if (!actor.skills.poisonAvailable) throw new Error('poison is unavailable'); actor.skills.poisonAvailable = false; requireAlive(room, targetSeatId); }
  recordAction(room, { actionId, turnId: room.round, actionType: 'witch_action', seatId, action, targetSeatId: targetSeatId ?? null });
  room.pendingNight.witch = { action, targetSeatId: targetSeatId ?? null }; transition(room, PHASES.DAY_ANNOUNCEMENT); return room;
}

export function announceDay(room) {
  if (room.phase !== PHASES.DAY_ANNOUNCEMENT) throw new Error('day announcement is not allowed now');
  const night = room.pendingNight ?? {}; const deaths = new Set();
  if (night.wolfTarget && night.witch?.action !== 'save') deaths.add(night.wolfTarget);
  if (night.witch?.action === 'poison') deaths.add(night.witch.targetSeatId);
  room.pendingNight = null;
  for (const seatId of deaths) eliminate(room, seatId, 'night');
  const winner = checkWinner(room); if (winner) return winner;
  transition(room, PHASES.SPEECH, { seatId: aliveSeats(room)[0]?.seatId ?? null }); return room;
}

export function submitSpeech(room, seatId, text, actionId) {
  if (room.phase !== PHASES.SPEECH || room.currentSeatId !== seatId) throw new Error('speech is not allowed for this seat now');
  const seat = requireAlive(room, seatId); if (typeof text !== 'string' || !text.trim()) throw new Error('speech must not be empty');
  recordAction(room, { actionId, turnId: room.round, actionType: 'speech', seatId }); room.speeches.push({ speechId: actionId, round: room.round, seatId, text: text.trim() }); room.version += 1; appendEvent(room, { type: 'game.speech_submitted', data: { speechId: actionId, seatId } });
  const next = aliveSeats(room).find(item => item.seatId > seat.seatId); const first = aliveSeats(room)[0]; if (next) transition(room, PHASES.SPEECH, { seatId: next.seatId }); else transition(room, PHASES.VOTE); return room;
}

export function submitVote(room, seatId, targetSeatId, voteId) {
  if (room.phase !== PHASES.VOTE) throw new Error('vote is not allowed now');
  requireAlive(room, seatId); requireAlive(room, targetSeatId); if (room.votes.some(vote => vote.round === room.round && vote.seatId === seatId)) throw new Error('seat already voted');
  room.votes.push({ voteId, round: room.round, seatId, targetSeatId }); room.version += 1;
  if (room.votes.filter(vote => vote.round === room.round).length === aliveSeats(room).length) resolveVotes(room); return room;
}

export function hunterShot(room, seatId, targetSeatId, actionId) {
  const hunter = seatOf(room, seatId); if (!hunter || hunter.role !== ROLES.HUNTER || hunter.alive || !hunter.skills.hunterShotAvailable) throw new Error('hunter shot is unavailable');
  requireAlive(room, targetSeatId); hunter.skills.hunterShotAvailable = false; recordAction(room, { actionId, turnId: room.round, actionType: 'hunter_shot', seatId, targetSeatId }); eliminate(room, targetSeatId, 'hunter'); checkWinner(room); return room;
}

function resolveVotes(room) {
  const votes = room.votes.filter(vote => vote.round === room.round); const counts = new Map(); for (const vote of votes) counts.set(vote.targetSeatId, (counts.get(vote.targetSeatId) ?? 0) + 1);
  const max = Math.max(...counts.values()); const leaders = [...counts].filter(([, count]) => count === max).map(([seatId]) => seatId); appendEvent(room, { type: 'game.vote_resolved', data: { leaders } });
  if (leaders.length === 1) eliminate(room, leaders[0], 'vote');
  const winner = checkWinner(room); if (winner) return winner; room.round += 1; transition(room, PHASES.NIGHT_WOLF); return room;
}

function eliminate(room, seatId, cause) { const seat = seatOf(room, seatId); if (!seat?.alive) return; seat.alive = false; seat.connectionState = CONNECTION_STATES.DISCONNECTED; room.version += 1; appendEvent(room, { type: 'game.player_eliminated', data: { seatId, cause } }); }

export function checkWinner(room) { const wolves = aliveSeats(room).filter(seat => seat.camp === CAMPS.WEREWOLF).length; const good = aliveSeats(room).filter(seat => seat.camp === CAMPS.GOOD).length; if (wolves === 0) { transition(room, PHASES.GAME_OVER, { winner: CAMPS.GOOD }); return CAMPS.GOOD; } if (wolves >= good) { transition(room, PHASES.GAME_OVER, { winner: CAMPS.WEREWOLF }); return CAMPS.WEREWOLF; } return null; }
