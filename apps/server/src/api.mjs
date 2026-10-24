import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { addPlayer, assignRoles, createRoom, fillAiSeats, privateState, publicState } from '../../../packages/domain/src/model.mjs';
import { announceDay, hunterShot, seerCheck, startGame, submitSpeech, submitVote, witchAction, wolfTarget } from '../../../packages/domain/src/engine.mjs';

export const rooms = new Map();
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 1_000_000) reject(new Error('request body too large')); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('request body must be valid JSON')); } }); req.on('error', reject); });
const currentPlayer = (req, room) => { const playerId = req.headers['x-player-id']; const seat = room.seats.find(item => item.playerId === playerId); if (!seat) throw Object.assign(new Error('player identity is unauthorized'), { status: 403 }); return seat; };
const roomOrFail = roomId => { const room = rooms.get(roomId); if (!room) throw Object.assign(new Error('room not found'), { status: 404 }); return room; };
const actionId = (req, body) => body.action_id || req.headers['idempotency-key'] || `action_${randomUUID()}`;

export function createApiServer({ port = Number(process.env.PORT || 5000) } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'); const parts = url.pathname.split('/').filter(Boolean); const roomId = parts[2];
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, service: 'linx-night-server', version: '0.1.0' });
      if (req.method === 'POST' && url.pathname === '/api/rooms') { const body = await readBody(req); const playerId = body.player_id || `player_${randomUUID()}`; const room = createRoom({ hostPlayerId: playerId }); addPlayer(room, { playerId, displayName: body.display_name || '玩家 1' }); rooms.set(room.roomId, room); return json(res, 201, { room_id: room.roomId, player_id: playerId, state: publicState(room) }); }
      if (!roomId || parts[0] !== 'api' || parts[1] !== 'rooms') return json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
      const room = roomOrFail(roomId);
      if (req.method === 'POST' && parts[3] === 'players') { const body = await readBody(req); const player = addPlayer(room, { playerId: body.player_id || `player_${randomUUID()}`, displayName: body.display_name || '玩家' }); return json(res, 201, { player, state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'start') { const actor = currentPlayer(req, room); if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can start the room'), { status: 403 }); fillAiSeats(room); assignRoles(room); startGame(room); return json(res, 200, { state: publicState(room), private_state: privateState(room, actor.playerId) }); }
      if (req.method === 'GET' && parts[3] === 'state') return json(res, 200, { state: publicState(room) });
      if (req.method === 'GET' && parts[3] === 'private-state') return json(res, 200, { private_state: privateState(room, currentPlayer(req, room).playerId) });
      if (req.method === 'GET' && parts[3] === 'speeches') return json(res, 200, { speeches: room.speeches, version: room.version });
      if (req.method === 'POST' && parts[3] === 'speeches') { const body = await readBody(req); const actor = currentPlayer(req, room); submitSpeech(room, actor.seatId, body.text, actionId(req, body)); return json(res, 200, { state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'actions') { const body = await readBody(req); const actor = currentPlayer(req, room); const id = actionId(req, body); if (body.type === 'wolf_target') wolfTarget(room, actor.seatId, body.target_seat_id, id); else if (body.type === 'seer_check') seerCheck(room, actor.seatId, body.target_seat_id, id); else if (body.type === 'witch_action') witchAction(room, actor.seatId, body.action, body.target_seat_id, id); else if (body.type === 'hunter_shot') hunterShot(room, actor.seatId, body.target_seat_id, id); else if (body.type === 'announce_day') announceDay(room); else throw new Error('invalid action type'); return json(res, 200, { state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'votes') { const body = await readBody(req); const actor = currentPlayer(req, room); submitVote(room, actor.seatId, body.target_seat_id, actionId(req, body)); return json(res, 200, { state: publicState(room) }); }
      return json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
    } catch (error) { return json(res, error.status || 400, { error: { code: error.status === 403 ? 'FORBIDDEN' : 'INVALID_ACTION', message: error.message } }); }
  });
  return { server, port };
}
