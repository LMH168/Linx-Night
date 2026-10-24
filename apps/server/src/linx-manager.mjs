import { activate } from '../../linx/src/ota.mjs';
import { LinxClient } from '../../linx/src/client.mjs';
import { readProfile } from '../../linx/src/profile.mjs';
import { LinxSessionAdapter } from '../../linx/src/session-adapter.mjs';

const required = (value, name) => { if (!value) throw Object.assign(new Error(`缺少 ${name} 配置`), { code: 'LINX_CONFIG_MISSING' }); return value; };
async function requestAdmin(base, token, path, body, fetchImpl) {
  required(base, 'LINX_MCP_ADMIN_URL'); required(token, 'LINX_MCP_ADMIN_TOKEN');
  let response; try { response = await fetchImpl(`${base.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); } catch { throw Object.assign(new Error('MCP 管理服务连接失败'), { code: 'MCP_ADMIN_UNREACHABLE' }); }
  let result; try { result = await response.json(); } catch { throw Object.assign(new Error('MCP 管理服务返回无效响应'), { code: 'MCP_ADMIN_INVALID_RESPONSE' }); }
  if (!response.ok || result.error) throw Object.assign(new Error(result.error?.message || `MCP 管理绑定失败（HTTP ${response.status}）`), { code: 'MCP_BIND_FAILED' }); return result;
}
export function createLinxControllerManager({ env = process.env, fetchImpl = fetch, clientFactory = identity => new LinxClient(identity) } = {}) {
  const names = String(env.LINX_PROFILES || 'player-a,player-b').split(',').map(value => value.trim()).filter(Boolean); const agentId = env.LINX_AGENT_ID; const mcpAdminUrl = env.LINX_MCP_ADMIN_URL; const mcpAdminToken = env.LINX_MCP_ADMIN_TOKEN; const adapters = new Map();
  const adapterFor = room => { if (!adapters.has(room.roomId)) { const profileBySeat = new Map(room.controllers.map((controller, index) => [controller.seatId, names[index]])); adapters.set(room.roomId, new LinxSessionAdapter({ clientFactory, connectionFor: async controller => { const profileName = required(profileBySeat.get(controller.seatId), `LINX profile（${controller.seatId}）`); const identity = await readProfile(profileName); const connection = await activate(identity, { fetchImpl }); return { profileName, agentId: required(agentId, 'LINX_AGENT_ID'), identity, connection }; }, bind: binding => requestAdmin(mcpAdminUrl, mcpAdminToken, '/admin/bindings', binding, fetchImpl), release: binding => requestAdmin(mcpAdminUrl, mcpAdminToken, '/admin/controllers/release', binding, fetchImpl) })); } return adapters.get(room.roomId); };
  return { async prepare(room) { const adapter = adapterFor(room); await Promise.all(room.controllers.map(controller => adapter.connect(room, controller.seatId))); room.controllerPhase = 'ready'; return room; }, async release(room) { const adapter = adapters.get(room.roomId); if (adapter) await adapter.releaseAll(room); adapters.delete(room.roomId); room.controllerPhase = 'released'; } };
}
