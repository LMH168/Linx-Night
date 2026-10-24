import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { rooms, publishNewEvents } from '../../server/src/api.mjs';
import { privateState, publicState } from '../../../packages/domain/src/model.mjs';
import { hunterShot, seerCheck, submitSpeech, submitVote, witchAction, wolfTarget } from '../../../packages/domain/src/engine.mjs';

export const sessions = new Map();
export const auditLog = [];
export const devices = new Map();
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

function authToken(req) { return req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : req.headers['x-mcp-auth-token']; }
function sessionContext(req, requiredToken) {
  if (requiredToken && authToken(req) !== requiredToken) throw Object.assign(new Error('MCP authentication failed'), { code: -32000 });
  const sessionId = req.headers['x-linx-session-id']; const deviceId = req.headers['x-linx-device-id']; const agentId = req.headers['x-linx-agent-id'];
  const context = sessions.get(sessionId) || devices.get(`${agentId}:${deviceId}`); if (!context) throw Object.assign(new Error('unknown Linx session'), { code: -32001 });
  if ((context.deviceId && context.deviceId !== deviceId) || (context.agentId && context.agentId !== agentId)) throw Object.assign(new Error('Linx session metadata mismatch'), { code: -32003 });
  return { ...context, sessionId, deviceId, agentId };
}
function roomFor(context) { const room = rooms.get(context.roomId); if (!room) throw Object.assign(new Error('game room not found'), { code: -32004 }); return room; }
function seatFor(room, context) { const seat = room.seats.find(item => item.seatId === context.seatId && item.playerId === context.playerId); if (!seat) throw Object.assign(new Error('session seat mismatch'), { code: -32003 }); return seat; }
function targetSeat(room, playerId) { const seat = room.seats.find(item => item.playerId === playerId || item.seatId === playerId); if (!seat) throw Object.assign(new Error('target player not found'), { code: -32004 }); return seat.seatId; }
function resultText(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false }; }

export function registerSession({ sessionId = randomUUID(), roomId, seatId, playerId, role = 'player', deviceId, agentId }) { if (!roomId || !seatId || !playerId) throw new Error('roomId, seatId and playerId are required'); sessions.set(sessionId, { roomId, seatId, playerId, role, deviceId, agentId }); return sessionId; }

async function callTool(req, name, args, requiredToken) {
  const context = sessionContext(req, requiredToken); const room = roomFor(context); const seat = context.role === 'host' ? null : seatFor(room, context);
  const audit = { at: new Date().toISOString(), sessionId: context.sessionId, agentId: context.agentId, roomId: context.roomId, seatId: context.seatId, tool: name, ok: false };
  try {
    if (name === 'get_public_game_state') { audit.ok = true; return resultText(publicState(room)); }
    if (context.role === 'host' && !['get_public_game_state', 'get_recent_speeches'].includes(name)) throw Object.assign(new Error('host is read-only'), {code: -32002});
    if (name === 'get_my_private_state') { audit.ok = true; return resultText(privateState(room, seat.playerId)); }
    if (name === 'get_recent_speeches') { audit.ok = true; return resultText({ speeches: room.speeches.slice(-10), version: room.version }); }
  if (context.role === 'host' && name !== 'submit_speech') throw Object.assign(new Error('host cannot submit player action'), { code: -32002 });
  const action = { roomId: context.roomId, seatId: seat.seatId, playerId: seat.playerId, ...args };
  const actionId = args.action_id || `mcp_${randomUUID()}`;
  if (name === 'submit_speech') { submitSpeech(room, seat.seatId, args.text, actionId); audit.ok = true; return resultText({ accepted: true, version: room.version }); }
  const targetSeatId = args.target_player_id ? targetSeat(room, args.target_player_id) : null;
  if (name === 'submit_wolf_target') { wolfTarget(room, seat.seatId, targetSeatId, actionId); audit.ok = true; return resultText({ accepted: true, version: room.version }); }
  if (name === 'submit_seer_check') { const result = seerCheck(room, seat.seatId, targetSeatId, actionId); audit.ok = true; return resultText({ accepted: true, result, version: room.version }); }
  if (name === 'submit_witch_action') { witchAction(room, seat.seatId, args.action, targetSeatId, actionId); audit.ok = true; return resultText({ accepted: true, version: room.version }); }
  if (name === 'submit_hunter_shot') { hunterShot(room, seat.seatId, targetSeatId, actionId); audit.ok = true; return resultText({ accepted: true, version: room.version }); }
  if (name === 'submit_vote') { submitVote(room, seat.seatId, targetSeatId, actionId); audit.ok = true; return resultText({ accepted: true, version: room.version }); }
  throw Object.assign(new Error('unknown tool'), { code: -32601 });
  } finally { publishNewEvents(room); auditLog.push(audit); if (auditLog.length > 1000) auditLog.shift(); }
}

export function createMcpServer({ port = Number(process.env.MCP_PORT || 9091), authToken: requiredToken = process.env.MCP_AUTH_TOKEN || '', adminToken = process.env.ADMIN_TOKEN || '' } = {}) {
  const streams = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let message;
    try {
      if (url.pathname === '/health') return json(res, 200, {ok:true, service:'linx-night-mcp'});
      if (url.pathname === '/admin/bindings' && req.method === 'POST') {
        if (!adminToken || authToken(req) !== adminToken) return json(res, 403, {error:'administrator token required'});
        const binding = await bodyOf(req);
        const room = rooms.get(binding.roomId);
        if (!room || !['host','player'].includes(binding.role)) throw new Error('invalid room or role');
        const seat = room.seats.find(s => s.seatId === binding.seatId && s.playerId);
        if (binding.role === 'player' && !seat) throw new Error('occupied seat required');
        const context = {roomId:room.roomId, role:binding.role, seatId:seat?.seatId, playerId:seat?.playerId, deviceId:binding.deviceId, agentId:binding.agentId};
        if (binding.sessionId) sessions.set(binding.sessionId, context);
        else if (binding.deviceId && binding.agentId) devices.set(`${binding.agentId}:${binding.deviceId}`, context);
        else throw new Error('sessionId or deviceId + agentId required');
        if (seat && binding.role === 'player') seat.linxControlled = true;
        return json(res, 201, {registered:true});
      }
      if (requiredToken && authToken(req) !== requiredToken) return json(res, 401, rpcError(null,-32000,'MCP authentication failed'));
      const streamable = url.pathname === '/mcp' && req.method === 'POST';
      const versions = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
      const protocolVersion = req.headers['mcp-protocol-version'];
      if (protocolVersion && !versions.includes(protocolVersion)) return json(res,400,rpcError(null,-32600,'unsupported MCP protocol version'));
      // Stateless HTTP replies need no server-initiated stream or transport session.
      if (url.pathname === '/mcp' && (req.method === 'DELETE' || (req.method === 'GET' && protocolVersion))) {
        res.writeHead(405, {allow:'POST'}); return res.end();
      }
      if (url.pathname === '/mcp' && req.method === 'GET') {
        const id = randomUUID();
        res.writeHead(200, {'content-type':'text/event-stream', 'cache-control':'no-cache', connection:'keep-alive'});
        streams.set(id, {res, headers:{...req.headers}});
        res.write(`event: endpoint\ndata: /mcp/message?sessionId=${id}\n\n`);
        const timer = setInterval(() => res.write(': heartbeat\n\n'),15000);
        res.on('close', () => {clearInterval(timer); streams.delete(id);});
        return;
      }
      if (!streamable && (url.pathname !== '/mcp/message' || req.method !== 'POST')) return json(res,404,{error:'not found'});
      const streamId = streamable ? null : url.searchParams.get('sessionId');
      const stream = streams.get(streamId);
      if (streamId && !stream) return json(res,404,{error:'SSE session expired'});
      if (stream) {
        for (const key of ['x-linx-session-id','x-linx-device-id','x-linx-agent-id']) {
          if (req.headers[key] && stream.headers[key] && req.headers[key] !== stream.headers[key]) return json(res,403,{error:'connection identity mismatch'});
          req.headers[key] ??= stream.headers[key];
        }
      }
      message = await bodyOf(req);
      if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') throw new Error('invalid JSON-RPC request');
      if (message.id === undefined) { res.writeHead(202); return res.end(); }
      let response;
      try {
        const {id,method,params={}} = message;
        if (method === 'initialize') response = rpc(id,{protocolVersion:streamable ? (versions.includes(params.protocolVersion) ? params.protocolVersion : '2025-03-26') : '2024-11-05',capabilities:{tools:{}},serverInfo:{name:'linx-night-game',version:'0.3.0'}});
        else if (method === 'ping') response = rpc(id,{});
        else if (method === 'tools/list') response = rpc(id,{tools:[...toolMap.values()]});
        else if (method === 'tools/call') response = rpc(id,await callTool(req,params.name,params.arguments || {},requiredToken));
        else response = rpcError(id,-32601,'unknown method');
      } catch(error) {response = rpcError(message.id,error.code || -32603,error.message);}
      if (stream) {stream.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`); res.writeHead(202); return res.end();}
      return json(res,200,response);
    } catch(error) {return json(res,400,rpcError(message?.id ?? null,error.code || -32600,error.message));}
  });
  return {server,port};
}
