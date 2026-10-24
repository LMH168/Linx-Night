import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ROLES = Object.freeze({ WEREWOLF: 'werewolf', SEER: 'seer', WITCH: 'witch', HUNTER: 'hunter', VILLAGER: 'villager' });
export const CAMPS = Object.freeze({ WEREWOLF: 'werewolf', GOOD: 'good' });
export const PHASES = Object.freeze({ LOBBY: 'LOBBY', ROLE_ASSIGNMENT: 'ROLE_ASSIGNMENT', NIGHT_WOLF: 'NIGHT_WOLF', NIGHT_SEER: 'NIGHT_SEER', NIGHT_WITCH: 'NIGHT_WITCH', DAY_ANNOUNCEMENT: 'DAY_ANNOUNCEMENT', SPEECH: 'SPEECH', VOTE: 'VOTE', RESOLUTION: 'RESOLUTION', GAME_OVER: 'GAME_OVER' });
export const PLAYER_TYPES = Object.freeze({ HUMAN: 'human', AI: 'ai' });
export const CONNECTION_STATES = Object.freeze({ ONLINE: 'online', DISCONNECTED: 'disconnected', AI_CONTROLLED: 'ai_controlled' });
export const CONTROLLER_STATES = Object.freeze({ PENDING: 'pending', CONNECTING: 'connecting', CONNECTED: 'connected', BINDING: 'binding', READY: 'ready', FAILED: 'failed', RECONNECTING: 'reconnecting', RELEASED: 'released' });

const roleCamp = role => role === ROLES.WEREWOLF ? CAMPS.WEREWOLF : CAMPS.GOOD;
const roleList = [ROLES.WEREWOLF, ROLES.WEREWOLF, ROLES.WEREWOLF, ROLES.SEER, ROLES.WITCH, ROLES.HUNTER, ROLES.VILLAGER, ROLES.VILLAGER, ROLES.VILLAGER];

function id(prefix) { return `${prefix}_${randomUUID()}`; }
function requireText(value, name) { if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`); }
function clone(value) { return structuredClone(value); }

export function createRoom({ roomId = id('room'), hostPlayerId = id('player') } = {}) {
  requireText(roomId, 'roomId'); requireText(hostPlayerId, 'hostPlayerId');
  return {
    roomId, hostPlayerId, phase: PHASES.LOBBY, version: 0, round: 0, currentSeatId: null,
    gameId: null, controllerEpoch: 0, controllerPhase: 'idle', controllers: [], invalidated: false,
    seats: Array.from({ length: 9 }, (_, index) => ({ seatId: `P${index + 1}`, playerId: null, playerType: null, controlSource: null, linxControlled: false, displayName: null, connectionState: null, role: null, camp: null, alive: true, skills: { antidoteAvailable: false, poisonAvailable: false, hunterShotAvailable: false }, seerResults: [] })),
    events: [], speeches: [], actions: [], votes: [], turns: [],
  };
}

const turnPhases = new Set([PHASES.NIGHT_WOLF, PHASES.NIGHT_SEER, PHASES.NIGHT_WITCH, PHASES.SPEECH, PHASES.VOTE]);
export function createTurn(room, { seatId, controlSource, controllerEpoch = null } = {}) {
  room.events ??= []; room.version ??= 0;
  const seat = room.seats.find(item => item.seatId === seatId);
  if (!seat || !seat.alive || (room.phase !== undefined && !turnPhases.has(room.phase))) throw new Error('turn is not available');
  if (!['human', 'linx', 'rule_bot'].includes(controlSource)) throw new Error('invalid control source');
  const phase = room.phase ?? 'SCHEDULER';
  room.turns ??= [];
  const active = room.turns.find(turn => turn.status === 'active' && turn.seatId === seatId && turn.round === room.round && turn.phase === phase);
  if (active) {
    if (active.controlSource !== controlSource || active.controllerEpoch !== controllerEpoch) throw new Error('turn ownership mismatch');
    return clone(active);
  }
  const turn = { turnId: id('turn'), seatId, round: room.round ?? 0, phase, controlSource, controllerEpoch, status: 'active', createdAt: new Date().toISOString(), completedAt: null };
  room.turns.push(turn); room.version += 1; appendEvent(room, { type: 'game.turn_created', data: { turnId: turn.turnId, seatId, phase: turn.phase, controlSource } }); return clone(turn);
}
export function completeTurn(room, turnId) {
  const turn = room.turns.find(item => item.turnId === turnId); if (!turn) throw new Error('turn not found');
  if (turn.status === 'completed') return clone(turn);
  if (turn.status !== 'active') throw new Error('turn is not active');
  turn.status = 'completed'; turn.completedAt = new Date().toISOString(); room.version += 1; appendEvent(room, { type: 'game.turn_completed', data: { turnId: turn.turnId, seatId: turn.seatId, phase: turn.phase } }); return clone(turn);
}
export function expireTurn(room, turnId, reason = 'expired') {
  const turn = room.turns.find(item => item.turnId === turnId); if (!turn) return false;
  if (turn.status !== 'active') return false; turn.status = 'expired'; turn.completedAt = new Date().toISOString(); turn.reason = reason; room.version += 1; appendEvent(room, { type: 'game.turn_expired', data: { turnId: turn.turnId, seatId: turn.seatId, phase: turn.phase, reason } }); return true;
}

export function beginControllerPreparation(room, { gameId = id('game'), aiSeatIds = room.seats.filter(seat => seat.playerType === PLAYER_TYPES.AI).map(seat => seat.seatId) } = {}) {
  if (room.phase !== PHASES.LOBBY) throw new Error('room is not in lobby');
  room.gameId = gameId; room.controllerEpoch += 1; room.controllerPhase = 'connecting'; room.invalidated = false;
  room.controllers = aiSeatIds.map(seatId => ({ seatId, gameId, controllerEpoch: room.controllerEpoch, profileName: null, agentId: null, deviceId: null, sessionId: null, runId: null, status: CONTROLLER_STATES.PENDING, retryCount: 0, boundAt: null, lastSeenAt: null, errorCode: null }));
  room.version += 1; return { gameId, controllerEpoch: room.controllerEpoch, controllers: clone(room.controllers) };
}

export function controllerFor(room, seatId) { return room.controllers?.find(controller => controller.seatId === seatId) ?? null; }

export function updateController(room, seatId, patch = {}) {
  const controller = controllerFor(room, seatId); if (!controller) throw new Error('controller seat is not reserved');
  const allowed = ['gameId', 'controllerEpoch', 'profileName', 'agentId', 'deviceId', 'sessionId', 'runId', 'status', 'retryCount', 'boundAt', 'lastSeenAt', 'errorCode'];
  for (const key of Object.keys(patch)) if (!allowed.includes(key)) throw new Error(`invalid controller field: ${key}`);
  Object.assign(controller, patch); room.version += 1; return clone(controller);
}

export function releaseControllerReservation(room, seatId) {
  const controller = controllerFor(room, seatId); if (!controller) return false;
  controller.status = CONTROLLER_STATES.RELEASED; controller.sessionId = null; controller.runId = null; controller.lastSeenAt = new Date().toISOString();
  room.version += 1; return true;
}

export function invalidateRoomControllers(room) {
  for (const controller of room.controllers ?? []) { controller.status = CONTROLLER_STATES.RELEASED; controller.sessionId = null; controller.runId = null; }
  room.controllerPhase = 'invalidated'; room.invalidated = true; room.version += 1; return room;
}

export function assignRoles(room) {
  if (room?.phase !== PHASES.LOBBY) throw new Error('room already started');
  if (!room || !Array.isArray(room.seats) || room.seats.length !== 9) throw new Error('room must contain exactly 9 seats');
  if (room.seats.some(seat => !seat.playerId)) throw new Error('all seats must be occupied before role assignment');
  const roles = [...roleList];
  for (let i = roles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [roles[i], roles[j]] = [roles[j], roles[i]]; }
  room.seats.forEach((seat, index) => { seat.role = roles[index]; seat.camp = roleCamp(roles[index]); seat.alive = true; seat.skills = { antidoteAvailable: roles[index] === ROLES.WITCH, poisonAvailable: roles[index] === ROLES.WITCH, hunterShotAvailable: roles[index] === ROLES.HUNTER }; });
  room.phase = PHASES.ROLE_ASSIGNMENT; room.version += 1; return room;
}

export function addPlayer(room, { playerId = id('player'), displayName, playerType = PLAYER_TYPES.HUMAN, connectionState = CONNECTION_STATES.ONLINE } = {}) {
  requireText(playerId, 'playerId'); requireText(displayName, 'displayName');
  if (!Object.values(PLAYER_TYPES).includes(playerType)) throw new Error('invalid playerType');
  if (room.phase !== PHASES.LOBBY) throw new Error('players cannot join after the room starts');
  if (room.seats.some(seat => seat.playerId === playerId)) throw new Error('player already joined');
  const seat = room.seats.find(item => !item.playerId); if (!seat) throw new Error('room is full');
  Object.assign(seat, { playerId, displayName, playerType, controlSource: playerType === PLAYER_TYPES.HUMAN ? 'human' : 'rule_bot', linxControlled: false, connectionState }); room.version += 1; return clone(seat);
}

export function fillAiSeats(room, name = index => `AI ${index}`) {
  room.seats.filter(seat => !seat.playerId).forEach((seat, index) => addPlayer(room, { playerId: id('ai'), displayName: name(index + 1), playerType: PLAYER_TYPES.AI }));
  return room;
}

export function publicState(room) {
  return { roomId: room.roomId, hostPlayerId: room.hostPlayerId, gameId: room.gameId, controllerEpoch: room.controllerEpoch, controllerPhase: room.controllerPhase, preparing: Boolean(room.preparing), phase: room.phase, version: room.version, round: room.round, currentSeatId: room.currentSeatId, seats: room.seats.map(({ seatId, displayName, playerType, controlSource, connectionState, alive }) => ({ seatId, displayName, playerType, controlSource, connectionState, alive })), controllers: (room.controllers ?? []).map(({ seatId, status, retryCount, boundAt, lastSeenAt, errorCode }) => ({ seatId, status, retryCount, boundAt, lastSeenAt, errorCode })), turns: (room.turns ?? []).filter(turn => turn.status === 'active').map(({ turnId, seatId, phase, controlSource, status, createdAt }) => ({ turnId, seatId, phase, controlSource, status, createdAt })), speeches: (room.speeches ?? []).map(({ speechId, round, seatId, text }) => ({ speechId, round, seatId, text })), events: (room.events ?? []).map(({ eventId, version, type, roomId, data }) => ({ eventId, version, type, roomId, data: publicEventData(type, data) })) };
}

// Events cross a public API/SSE boundary. Keep this allowlist beside the
// projection so accidental diagnostic, model, audio, or role fields cannot
// become public when a new internal event is added.
export function publicEventData(type, data = {}) {
  const fields = {
    'game.phase_changed': ['phase', 'seatId', 'winner'],
    'game.speech_submitted': ['speechId', 'seatId'],
    'game.vote_submitted': ['voteId', 'seatId'],
    'game.vote_resolved': ['leaders'],
    'game.player_eliminated': ['seatId', 'cause'],
    'game.action_submitted': ['actionId'],
    'game.turn_created': ['turnId', 'seatId', 'phase', 'controlSource'],
    'game.turn_completed': ['turnId', 'seatId', 'phase'],
    'game.turn_expired': ['turnId', 'seatId', 'phase', 'reason'],
    'host.speech_opened': ['phase', 'seatId'],
    'host.vote_opened': ['phase', 'seatId'],
    'host.phase_announced': ['phase', 'seatId'],
    'host.deaths_announced': ['seatId', 'cause'],
    'host.game_finished': ['winner'],
    'controller.created': ['gameId', 'controllerEpoch', 'seatIds'],
    'controller.connected': ['seatId', 'status'],
    'controller.bound': ['seatId', 'status'],
    'controller.failed': ['seatId', 'errorCode'],
    'controller.released': ['seatId'],
    'game.ready': ['gameId', 'controllerEpoch'],
  }[type];
  if (!fields) return {};
  return Object.fromEntries(fields.filter(field => Object.prototype.hasOwnProperty.call(data, field)).map(field => [field, clone(data[field])]));
}

export function privateState(room, playerId) {
  requireText(playerId, 'playerId'); const seat = room.seats.find(item => item.playerId === playerId); if (!seat) throw new Error('player not found');
  const teammates = seat.camp === CAMPS.WEREWOLF ? room.seats.filter(item => item.camp === CAMPS.WEREWOLF && item.playerId !== playerId && item.alive).map(item => item.seatId) : [];
  return { roomId: room.roomId, seatId: seat.seatId, playerId: seat.playerId, role: seat.role, camp: seat.camp, alive: seat.alive, skills: clone(seat.skills), seerResults: clone(seat.seerResults), nightVictim: seat.role === ROLES.WITCH ? room.pendingNight?.wolfTarget ?? null : null, werewolfTeammates: teammates };
}

export function appendEvent(room, { eventId = id('evt'), type, data = {} } = {}) {
  requireText(eventId, 'eventId'); requireText(type, 'type');
  if (room.events.some(event => event.eventId === eventId)) throw new Error('duplicate event');
  const event = { eventId, version: room.version + 1, type, roomId: room.roomId, data: clone(data) }; room.events.push(event); room.version = event.version; return clone(event);
}

export async function saveSnapshot(room, filePath) { await mkdir(dirname(filePath), { recursive: true }); await writeFile(filePath, `${JSON.stringify(room, null, 2)}\n`, 'utf8'); }
export async function loadSnapshot(filePath) { return JSON.parse(await readFile(filePath, 'utf8')); }
