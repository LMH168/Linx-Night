import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const OTA = 'https://xrobo.qiniuapi.com/v1/ota/';
export function secureSocketUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('OTA 连接地址无效'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.hostname !== 'xrobo-io.qiniuapi.com' || url.port || url.pathname !== '/v1/ws/' || url.username || url.password || url.search || url.hash) throw new Error('拒绝非官方 WSS 地址');
  url.protocol = 'wss:';
  return url.href;
}
// The injected fetch is only for protocol tests; production never accepts an endpoint override.
export async function ota(identity, { fetchImpl = fetch, signal } = {}) {
  let response;
  try {
    response = await fetchImpl(OTA, {
      method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      headers: { 'Activation-Version': '1', 'Device-Id': identity.deviceId, 'Client-Id': identity.clientId, 'User-Agent': 'linx-night-probe/0.1.0', 'Content-Type': 'application/json', 'Accept-Language': 'zh-CN' },
      body: JSON.stringify({ mac_address: identity.deviceId, uuid: identity.clientId, application: { name: 'linx-night-probe', version: '0.1.0', elf_sha256: createHash('sha256').update('linx-night-probe/0.1.0').digest('hex') }, board: { type: 'linx-night-probe', ssid: 'software-client', rssi: 0 } }),
    });
  } catch { throw new Error('OTA 网络失败或超时'); }
  if (!response.ok) throw new Error(`OTA HTTP ${response.status}`);
  let data; try { data = await response.json(); } catch { throw new Error('OTA 非 JSON 响应'); }
  if (!data || typeof data !== 'object' || data.error || (data.code !== undefined && data.code !== 0 && data.code !== 200)) throw new Error('OTA 业务错误');
  if (typeof data.websocket?.token === 'string' && data.websocket.token.trim()) return { state: 'bound', url: secureSocketUrl(data.websocket.url), token: data.websocket.token };
  const code = String(data.activation?.code || '');
  if (/^\d{6}$/.test(code)) return { state: 'unbound', code };
  throw new Error('OTA 未返回激活码或连接凭据');
}
export async function activate(identity, { fetchImpl = fetch, signal, timeoutMs = 300000, pollMs = 5000, onCode = () => {} } = {}) {
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let config = await ota(identity, { fetchImpl, signal: bounded });
  if (config.state === 'bound') return config;
  onCode(config.code);
  try {
    while (!bounded.aborted) {
      await delay(pollMs, undefined, { signal: bounded });
      const response = await fetchImpl(`${OTA}activate`, { method: 'POST', redirect: 'error', headers: { 'Device-Id': identity.deviceId }, signal: AbortSignal.any([bounded, AbortSignal.timeout(10000)]) });
      if (response.status === 202) continue;
      if (response.status !== 200 || (await response.text()).trim() !== 'success') throw new Error('激活检查失败');
      config = await ota(identity, { fetchImpl, signal: bounded });
      if (config.state === 'bound') return config;
      throw new Error('激活确认后未获得连接凭据');
    }
  } catch (error) { if (bounded.aborted) throw new Error('激活等待结束，请重新运行 activate'); throw new Error(error.message === '激活检查失败' ? error.message : '激活检查网络或协议失败'); }
  throw new Error('激活等待结束，请重新运行 activate');
}
