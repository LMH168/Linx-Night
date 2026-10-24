import { randomBytes, randomUUID } from 'node:crypto';
import { loadState, saveState, platform, ota } from '../linx-config.mjs';
const state = await loadState();
try {
  if (!state.asr) {
    const b = randomBytes(6);
    b[0] = (b[0] | 2) & 254;
    state.asr = {
      name: '月隐语音输入',
      deviceId: [...b].map((x) => x.toString(16).padStart(2, '0')).join(':'),
      clientId: randomUUID(),
      ready: false,
    };
    await saveState(state);
  }
  const p = state.asr;
  if (!p.agentId) {
    p.agentId = await platform('/xiaozhi/agent', {
      method: 'POST',
      body: {
        agentName: `月隐-${state.installationId}-语音输入`,
        assistantName: '语音输入',
        langCode: 'zh',
        systemPrompt: '你是语音输入通道。不要回答、不要推理，仅等待用户音频。',
        memModelId: 'Memory_nomem',
        intentModelId: 'Intent_nointent',
      },
    });
    await saveState(state);
  }
  await platform('/xiaozhi/agent/' + p.agentId, {
    method: 'PUT',
    body: {
      memModelId: 'Memory_nomem',
      intentModelId: 'Intent_nointent',
      chatHistoryConf: 0,
      functions: [],
      extra: { disable_greeting: true, disabled_builtin_tools: ['get_time'] },
    },
  });
  let d = await ota(p);
  if (d.activation) {
    const code = String(d.activation.code);
    if (!/^\d{6}$/.test(code)) throw Error('激活码无效');
    await platform(`/xiaozhi/device/bind/${p.agentId}/${code}`, { method: 'POST' });
    d = await ota(p);
  }
  if (!d.websocket?.token) throw Error('语音设备尚未绑定');
  p.ready = true;
  await saveState(state);
  console.log('独立语音识别通道已就绪');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
