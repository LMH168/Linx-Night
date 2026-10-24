import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ota } from '../../linx/src/ota.mjs';
import { LinxClient } from '../../linx/src/client.mjs';
import { readProfile } from '../../linx/src/profile.mjs';
import { LinxSessionAdapter } from '../../linx/src/session-adapter.mjs';
import { parseWav } from '../../linx/src/wav.mjs';

const required = (value, name) => { if (!value) throw Object.assign(new Error(`缺少 ${name} 配置`), { code: 'LINX_CONFIG_MISSING' }); return value; };
async function requestAdmin(base, token, path, body, fetchImpl) {
  required(base, 'LINX_MCP_ADMIN_URL'); required(token, 'LINX_MCP_ADMIN_TOKEN');
  let response;
  try { response = await fetchImpl(`${base.replace(/\/$/, '')}${path}`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); }
  catch { throw Object.assign(new Error('MCP 管理服务连接失败'), { code: 'MCP_ADMIN_UNREACHABLE' }); }
  const result = await response.json();
  if (!response.ok || result.error) throw Object.assign(new Error('MCP 管理操作失败'), { code: 'MCP_BIND_FAILED' });
  return result;
}

export function createLinxControllerManager({ env = process.env, fetchImpl = fetch, clientFactory = identity => new LinxClient(identity), readIdentity = readProfile, loadAudio = readFile, onChange = () => {} } = {}) {
  const names = String(env.LINX_PROFILES || 'player-a,player-b').split(',').map(value => value.trim()).filter(Boolean);
  const adapters = new Map(), profiles = new Map(), reservations = new Map();
  const audioPath = env.LINX_TURN_WAV || join(env.LOCALAPPDATA || '.', 'LinxNight', 'audio', 'turn.wav');
  let audio;
  const adapterFor = room => {
    if (!adapters.has(room.roomId)) {
      const profileBySeat = new Map(room.controllers.map((c, i) => [c.seatId, names[i]]));
      adapters.set(room.roomId, new LinxSessionAdapter({ profiles, clientFactory, onChange,
        connectionFor: async controller => {
          const agentId = required(env.LINX_AGENT_ID, 'LINX_AGENT_ID');
          const profileName = required(profileBySeat.get(controller.seatId), `LINX profile（${controller.seatId}）`);
          const identity = await readIdentity(profileName);
          const connection = await ota(identity, { fetchImpl });
          if (connection.state !== 'bound') throw Object.assign(new Error('软件设备尚未激活'), {code:'LINX_NOT_ACTIVATED'});
          return { profileName, agentId, identity, connection };
        },
        bind: binding => requestAdmin(env.LINX_MCP_ADMIN_URL, env.LINX_MCP_ADMIN_TOKEN, '/admin/bindings', binding, fetchImpl),
        release: binding => requestAdmin(env.LINX_MCP_ADMIN_URL, env.LINX_MCP_ADMIN_TOKEN, '/admin/controllers/release', binding, fetchImpl),
      }));
    }
    return adapters.get(room.roomId);
  };
  return {
    async prepare(room) {
      if (!room.controllers.length) { room.controllerPhase = 'ready'; return room; }
      const assigned = names.slice(0, room.controllers.length);
      if (assigned.length !== room.controllers.length || new Set(assigned).size !== assigned.length || assigned.some(name => reservations.has(name) && reservations.get(name) !== room.roomId)) throw Object.assign(new Error('profile unavailable'), {code:'PROFILE_IN_USE'});
      const gameId = room.gameId;
      required(env.LINX_AGENT_ID, 'LINX_AGENT_ID');
      audio ??= await loadAudio(audioPath); parseWav(audio);
      if (room.invalidated || room.gameId !== gameId) throw new Error('PREPARATION_CANCELLED');
      if (assigned.some(name => reservations.has(name) && reservations.get(name) !== room.roomId)) throw Object.assign(new Error('profile unavailable'), {code:'PROFILE_IN_USE'});
      for (const name of assigned) reservations.set(name, room.roomId);
      const adapter = adapterFor(room);
      await Promise.all(room.controllers.map(c => adapter.connect(room, c.seatId)));
      if (room.invalidated || adapters.get(room.roomId) !== adapter) throw new Error('PREPARATION_CANCELLED');
      room.controllerPhase = 'ready'; return room;
    },
    async ensureConnected(room, seat) {
      const adapter = adapterFor(room), c = room.controllers.find(c => c.seatId === seat.seatId);
      if (!c || c.status === 'failed') throw new Error('CONTROLLER_FAILED');
      const client = adapter.clients.get(seat.seatId)?.client;
      if (!client || client.state === 'closed') await adapter.reconnect(room, seat.seatId);
    },
    async sendTurn(room, seat) {
      const client = adapters.get(room.roomId)?.clients.get(seat.seatId)?.client;
      if (!client) throw new Error('CONTROLLER_MISSING');
      return client.send(audio);
    },
    async releaseSeat(room, seat) {
      const adapter = adapters.get(room.roomId);
      if (adapter) await adapter.releaseSeat(room, seat.seatId);
    },
    async retry(room, seatId) {
      const adapter = adapters.get(room.roomId); if (!adapter) throw new Error('CONTROLLER_MISSING');
      return adapter.reconnect(room, seatId);
    },
    async release(room) {
      const adapter = adapters.get(room.roomId);
      if (adapter) await adapter.releaseAll(room);
      adapters.delete(room.roomId); for (const [name, owner] of reservations) if (owner === room.roomId) reservations.delete(name); room.controllerPhase = 'released';
    },
  };
}
