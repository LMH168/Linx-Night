import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { rooms, publishNewEvents } from '../../server/src/api.mjs';
import { privateState, publicState } from '../../../packages/domain/src/model.mjs';
import { RuleError, hunterShot, seerCheck, submitSpeech, submitVote, witchAction, wolfTarget } from '../../../packages/domain/src/engine.mjs';

import { toolMap, validateArguments, ToolInputError } from './tools.mjs';

export const sessions = new Map();
export const auditLog = [];
export const devices = new Map();

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
function targetSeat(room, playerId) { const seat = room.seats.find(item => item.playerId === playerId || item.seatId === playerId); if (!seat) throw new ToolInputError('target player not found'); return seat.seatId; }
function resultText(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false }; }

export function registerSession({ sessionId = randomUUID(), roomId, seatId, playerId, role = 'player', deviceId, agentId }) { if (!roomId || !seatId || !playerId) throw new Error('roomId, seatId and playerId are required'); sessions.set(sessionId, { roomId, seatId, playerId, role, deviceId, agentId }); return sessionId; }

async function callTool(req, name, args, requiredToken, trace) {
  const context = sessionContext(req, requiredToken);
  const room = roomFor(context);
  const seat = context.role === 'host' ? null : seatFor(room, context);
  Object.assign(trace, { roomId: room.roomId, seatId: context.seatId, beforeVersion: room.version, eventIds: [] });
  const tool = toolMap.get(name);
  if (!tool) throw Object.assign(new Error('unknown tool'), { code: -32601 });
  if (context.role === 'host' && !['get_public_game_state', 'get_recent_speeches'].includes(name)) throw Object.assign(new Error('host is read-only'), { code: -32002 });
  const audit = { at: new Date().toISOString(), sessionId: context.sessionId, agentId: context.agentId, tool: name, ok: false };
  try {
    validateArguments(tool, args);
    if (name === 'get_public_game_state') { audit.ok = true; return resultText(publicState(room)); }
    if (name === 'get_my_private_state') { audit.ok = true; return resultText(privateState(room, seat.playerId)); }
    if (name === 'get_recent_speeches') { audit.ok = true; return resultText({ speeches: room.speeches.slice(-10), version: room.version }); }
    const actionId = args.action_id || `mcp_${randomUUID()}`;
    trace.actionId = actionId;
    const target = args.target_player_id ? targetSeat(room, args.target_player_id) : null;
    let result;
    if (name === 'submit_speech') submitSpeech(room, seat.seatId, args.text, actionId);
    else if (name === 'submit_wolf_target') wolfTarget(room, seat.seatId, target, actionId);
    else if (name === 'submit_seer_check') result = seerCheck(room, seat.seatId, target, actionId);
    else if (name === 'submit_witch_action') witchAction(room, seat.seatId, args.action, target, actionId);
    else if (name === 'submit_hunter_shot') hunterShot(room, seat.seatId, target, actionId);
    else if (name === 'submit_vote') submitVote(room, seat.seatId, target, actionId);
    trace.eventIds = room.events.filter(e => e.version > trace.beforeVersion).map(e => e.eventId);
    audit.ok = true;
    publishNewEvents(room);
    return resultText({ accepted: true, requestId: trace.requestId, actionId, version: room.version, eventIds: trace.eventIds, ...(result === undefined ? {} : { result }) });
  } catch (error) {
    if (!(error instanceof RuleError || error instanceof ToolInputError)) throw error;
    trace.resultCode = error instanceof ToolInputError ? 'INVALID_ARGUMENTS' : 'ACTION_REJECTED';
    trace.failure = { code: trace.resultCode, reason: error.message };
    return { content: [{ type: 'text', text: JSON.stringify({ code: trace.resultCode, message: error.message, requestId: trace.requestId }) }], isError: true };
  } finally {
    trace.afterVersion = room.version;
    trace.resultCode ??= audit.ok ? 'OK' : 'INTERNAL_ERROR';
    auditLog.push({ ...audit, ...trace }); if (auditLog.length > 1000) auditLog.shift();
  }
}

export function createMcpServer({ port = Number(process.env.MCP_PORT || 9091), authToken: requiredToken = process.env.MCP_AUTH_TOKEN || '', adminToken = process.env.ADMIN_TOKEN || '' } = {}) {
  const streams = new Map();
  const diagnostics = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let message;
    let failure;
    const trace = { requestId: randomUUID() };
    const recordFailure = body => {
      if (body.error) {
        const known = ['MCP authentication failed', 'unknown Linx session', 'Linx session metadata mismatch', 'game room not found', 'session seat mismatch', 'invalid JSON', 'unsupported MCP protocol version'];
        failure = { code: body.error.code, reason: known.includes(body.error.message) ? body.error.message : 'request failed' };
      }
    };
    const reply = (status, body) => { recordFailure(body); return json(res, status, body); };
    res.on('finish', () => {
      if (!['/mcp', '/mcp/message'].includes(url.pathname)) return;
      const authenticated = !requiredToken || authToken(req) === requiredToken;
      const identity = authenticated ? Object.fromEntries(['session', 'device', 'agent'].map(key => [key + 'Id', req.headers[`x-linx-${key}-id`]?.slice(0, 256)])) : {};
      diagnostics.push({ at: new Date().toISOString(), path: url.pathname, httpMethod: req.method, method: typeof message?.method === 'string' ? message.method.slice(0, 128) : undefined, tool: typeof message?.params?.name === 'string' ? message.params.name.slice(0, 128) : undefined, status: res.statusCode, authenticated, ...identity, ...trace, failure: failure || trace.failure });
      if (diagnostics.length > 100) diagnostics.shift();
    });
    try {
      if (url.pathname === '/admin/diagnostics' && req.method === 'GET') {
        if (!adminToken || authToken(req) !== adminToken) return json(res, 403, {error:'administrator token required'});
        res.setHeader('cache-control', 'no-store');
        return json(res, 200, { requests: diagnostics });
      }
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
      if (requiredToken && authToken(req) !== requiredToken) return reply(401, rpcError(null,-32000,'MCP authentication failed'));
      const streamable = url.pathname === '/mcp' && req.method === 'POST';
      const versions = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
      const protocolVersion = req.headers['mcp-protocol-version'];
      if (protocolVersion && !versions.includes(protocolVersion)) return reply(400,rpcError(null,-32600,'unsupported MCP protocol version'));
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
      if (!streamable && (url.pathname !== '/mcp/message' || req.method !== 'POST')) return reply(404,{error:'not found'});
      const streamId = streamable ? null : url.searchParams.get('sessionId');
      const stream = streams.get(streamId);
      if (streamId && !stream) return reply(404,{error:'SSE session expired'});
      if (stream) {
        for (const key of ['x-linx-session-id','x-linx-device-id','x-linx-agent-id']) {
          if (req.headers[key] && stream.headers[key] && req.headers[key] !== stream.headers[key]) return reply(403,{error:'connection identity mismatch'});
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
        else if (method === 'tools/call') response = rpc(id,await callTool(req,params.name,params.arguments === undefined ? {} : params.arguments,requiredToken,trace));
        else response = rpcError(id,-32601,'unknown method');
      } catch(error) { if (!error.code) trace.internalError = error.message; trace.resultCode = error.code || 'INTERNAL_ERROR'; response = rpcError(message.id,error.code || -32603,error.code ? error.message : 'internal error');}
      if (stream) {recordFailure(response); stream.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`); res.writeHead(202); return res.end();}
      return reply(200,response);
    } catch(error) {return reply(400,rpcError(message?.id ?? null,error.code || -32600,error.message));}
  });
  return {server,port};
}
