import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { rooms } from '../../server/src/api.mjs';
import { privateState, publicState } from '../../../packages/domain/src/model.mjs';
import { hunterShot, seerCheck, submitSpeech, submitVote, witchAction, wolfTarget } from '../../../packages/domain/src/engine.mjs';

export const sessions = new Map();
const tools = [
  ['get_public_game_state', '获取当前房间公开状态', {}],
  ['get_my_private_state', '获取当前会话玩家的私密身份和技能状态', {}],
  ['get_recent_speeches', '获取最近公开发言', {}],
  ['submit_speech', '提交公开发言', { text: { type: 'string', minLength: 1 } }],
  ['submit_wolf_target', '提交狼人目标', { target_player_id: { type: 'string' } }],
  ['submit_seer_check', '提交预言家查验目标', { target_player_id: { type: 'string' } }],
  ['submit_witch_action', '提交女巫行动', { action: { type: 'string', enum: ['save', 'poison', 'skip'] }, target_player_id: { type: 'string' } }],
  ['submit_hunter_shot', '提交猎人开枪目标', { target_player_id: { type: 'string' } }],
  ['submit_vote', '提交投票目标', { target_player_id: { type: 'string' } }],
];
const toolMap = new Map(tools.map(([name, description, properties]) => [name, { name, description, inputSchema: { type: 'object', properties, required: Object.keys(properties).filter(key => key !== 'target_player_id') } }]));

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };
const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const bodyOf = req => new Promise((resolve, reject) => { let value = ''; req.on('data', chunk => { value += chunk; }); req.on('end', () => { try { resolve(JSON.parse(value)); } catch { reject(new Error('invalid JSON')); } }); req.on('error', reject); });

function sessionContext(req) {
  const sessionId = req.headers['x-linx-session-id']; const deviceId = req.headers['x-linx-device-id']; const agentId = req.headers['x-linx-agent-id'];
  const context = sessions.get(sessionId); if (!context) throw Object.assign(new Error('unknown Linx session'), { code: -32001 });
  return { ...context, sessionId, deviceId, agentId };
}
function roomFor(context) { const room = rooms.get(context.roomId); if (!room) throw Object.assign(new Error('game room not found'), { code: -32004 }); return room; }
function seatFor(room, context) { const seat = room.seats.find(item => item.seatId === context.seatId && item.playerId === context.playerId); if (!seat) throw Object.assign(new Error('session seat mismatch'), { code: -32003 }); return seat; }
function resultText(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false }; }

export function registerSession({ sessionId = randomUUID(), roomId, seatId, playerId, role = 'player' }) { if (!roomId || !seatId || !playerId) throw new Error('roomId, seatId and playerId are required'); sessions.set(sessionId, { roomId, seatId, playerId, role }); return sessionId; }

async function callTool(req, name, args) {
  const context = sessionContext(req); const room = roomFor(context); const seat = seatFor(room, context);
  if (name === 'get_public_game_state') return resultText(publicState(room));
  if (name === 'get_my_private_state') return resultText(privateState(room, seat.playerId));
  if (name === 'get_recent_speeches') return resultText({ speeches: room.speeches.slice(-10), version: room.version });
  if (context.role === 'host' && name !== 'submit_speech') throw Object.assign(new Error('host cannot submit player action'), { code: -32002 });
  const action = { roomId: context.roomId, seatId: seat.seatId, playerId: seat.playerId, ...args };
  const actionId = args.action_id || `mcp_${randomUUID()}`;
  if (name === 'submit_speech') { submitSpeech(room, seat.seatId, args.text, actionId); return resultText({ accepted: true, version: room.version }); }
  if (name === 'submit_wolf_target') { wolfTarget(room, seat.seatId, args.target_player_id, actionId); return resultText({ accepted: true, version: room.version }); }
  if (name === 'submit_seer_check') { const result = seerCheck(room, seat.seatId, args.target_player_id, actionId); return resultText({ accepted: true, result, version: room.version }); }
  if (name === 'submit_witch_action') { witchAction(room, seat.seatId, args.action, args.target_player_id, actionId); return resultText({ accepted: true, version: room.version }); }
  if (name === 'submit_hunter_shot') { hunterShot(room, seat.seatId, args.target_player_id, actionId); return resultText({ accepted: true, version: room.version }); }
  if (name === 'submit_vote') { submitVote(room, seat.seatId, args.target_player_id, actionId); return resultText({ accepted: true, version: room.version }); }
  throw Object.assign(new Error('unknown tool'), { code: -32601 });
}

export function createMcpServer({ port = Number(process.env.MCP_PORT || 9091) } = {}) {
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-linx-session-id,x-linx-device-id,x-linx-agent-id' }); return res.end(); }
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, service: 'linx-night-mcp' });
    if (req.method === 'GET' && req.url === '/mcp') { res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' }); res.write(': connected\n\n'); return; }
    if (req.method !== 'POST' || req.url !== '/mcp/message') return json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
    try { const message = await bodyOf(req); const { id, method, params = {} } = message; if (method === 'initialize') return json(res, 200, rpc(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'linx-night-game', version: '0.1.0' } })); if (method === 'tools/list') return json(res, 200, rpc(id, { tools: [...toolMap.values()] })); if (method === 'tools/call') return json(res, 200, rpc(id, await callTool(req, params.name, params.arguments || {}))); return json(res, 200, rpcError(id, -32601, `未知方法: ${method}`)); } catch (error) { return json(res, 200, rpcError(null, error.code || -32603, error.message)); }
  });
  return { server, port };
}
