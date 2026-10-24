import { loadState, saveState, platform } from '../linx-config.mjs';
const choices = [
  '沉稳质感男',
  '元气甜美女',
  '智慧青年男',
  '温柔闺蜜女',
  '热血磁性男',
  '积极知性女',
  '低调冷静女',
  '磁性低音男',
];
try {
  const state = await loadState(),
    { voices } = await platform('/v1/voices');
  const selected = choices.map((name) => {
    const v = voices.find((v) => v.name === name && v.tags?.languages?.includes('zh'));
    if (!v) throw Error(`音色不可用：${name}`);
    return v;
  });
  if (new Set(selected.map((v) => v.id)).size !== 8) throw Error('音色必须各不相同');
  for (const p of state.players) {
    const voice = selected[p.seat - 2];
    if (!voice) continue;
    await platform('/xiaozhi/agent/' + p.agentId, {
      method: 'PUT',
      body: { ttsVoiceId: voice.id },
    });
    const actual = await platform('/xiaozhi/agent/' + p.agentId);
    if (actual.ttsVoiceId !== voice.id) throw Error(`${p.name} 音色回读不一致`);
    p.voiceId = voice.id;
    p.voiceName = voice.name;
    await saveState(state);
    console.log(`${p.seat} 号 ${p.name} → ${voice.name}`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
