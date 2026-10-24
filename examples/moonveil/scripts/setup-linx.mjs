import { randomBytes, randomUUID } from 'node:crypto';
import { PROFILES, SYSTEM_PROMPT, loadState, saveState, platform, ota } from '../linx-config.mjs';
const state = await loadState();
try {
  if (!process.env.LINX_API_KEY)
    throw Error('请在项目 .env 中填写 LINX_API_KEY 后重试。不要把密钥发到聊天或放进网页源码。');
  await platform('/xiaozhi/agent/list?limit=1');
  state.installationId ||= randomUUID().slice(0, 8);
  await saveState(state);
  for (let i = 0; i < PROFILES.length; i++) {
    const seat = i + 2,
      [name, style] = PROFILES[i];
    let p = state.players.find((x) => x.seat === seat);
    if (!p) {
      const bytes = randomBytes(6);
      bytes[0] = (bytes[0] | 2) & 254;
      p = {
        seat,
        name,
        style,
        deviceId: [...bytes].map((x) => x.toString(16).padStart(2, '0')).join(':'),
        clientId: randomUUID(),
        ready: false,
      };
      state.players.push(p);
      await saveState(state);
    }
    if (!p.agentId) {
      const agentName = `月隐-${state.installationId}-${seat}号-${name}`;
      // Recover a created agent after an interrupted response, without creating duplicates.
      let cursor, found;
      do {
        const r = await fetch(
          'https://xrobo.qiniu.com/xiaozhi/agent/list?limit=100' +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          {
            headers: { Authorization: `Bearer ${process.env.LINX_API_KEY}` },
            signal: AbortSignal.timeout(20000),
            redirect: 'error',
          },
        );
        const d = await r.json();
        if (!r.ok || d.code !== 0) throw Error('读取智能体列表失败');
        found = d.data?.find((a) => a.agentName === agentName);
        cursor = d.nextCursor;
      } while (cursor && !found);
      p.agentId =
        found?.id ||
        (await platform('/xiaozhi/agent', {
          method: 'POST',
          body: {
            agentName,
            assistantName: name,
            langCode: 'zh',
            systemPrompt: SYSTEM_PROMPT,
            memModelId: 'Memory_nomem',
            intentModelId: 'Intent_nointent',
          },
        }));
      if (typeof p.agentId !== 'string' || !p.agentId) throw Error(`${seat} 号智能体返回格式无效`);
      await saveState(state);
    }
    // Update only this installation's dedicated agents, never unrelated account agents.
    await platform('/xiaozhi/agent/' + encodeURIComponent(p.agentId), {
      method: 'PUT',
      body: {
        systemPrompt: SYSTEM_PROMPT,
        memModelId: 'Memory_nomem',
        intentModelId: 'Intent_nointent',
        chatHistoryConf: 0,
        functions: [],
        extra: {
          disable_greeting: true,
          disabled_builtin_tools: ['get_time'],
          llm: { enable_search: false, max_tokens: 500 },
        },
      },
    });
    let result = await ota(p);
    if (result.activation) {
      const code = String(result.activation.code);
      if (!/^\d{6}$/.test(code)) throw Error(`${seat} 号设备激活码格式无效`);
      await platform(`/xiaozhi/device/bind/${encodeURIComponent(p.agentId)}/${code}`, {
        method: 'POST',
      });
      result = await ota(p);
    }
    if (!result.websocket?.token) throw Error(`${seat} 号设备未取得会话凭据`);
    const devices = await platform('/xiaozhi/device/bind/' + encodeURIComponent(p.agentId));
    if (
      !Array.isArray(devices) ||
      !devices.some((d) => d.macAddress?.toLowerCase() === p.deviceId.toLowerCase())
    )
      throw Error(`${seat} 号设备与专用智能体绑定不匹配`);
    p.ready = true;
    await saveState(state);
    console.log(`${seat} 号 ${name}：专用智能体和设备就绪`);
  }
  console.log('8 个 AI 玩家已配置完成。网页右上角选择“检查全部智能体”，验证真实输出后开局。');
} catch (e) {
  console.error(e.message);
  console.error('已完成的资源已保存，可修正配置后重新运行；不会自动删除资源。');
  process.exitCode = 1;
}
