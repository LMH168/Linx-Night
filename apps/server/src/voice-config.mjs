export function voiceConfig(env = process.env) {
  const profiles = String(env.LINX_PROFILES || '').split(',').map(s => s.trim()).filter(Boolean);
  let players;
  try { players = JSON.parse(env.LINX_PLAYER_VOICES || '{}'); } catch { throw new Error('LINX_PLAYER_VOICES 必须是 profile 到音色 ID 的 JSON 对象'); }
  if (!players || Array.isArray(players) || typeof players !== 'object') throw new Error('无效玩家音色配置');
  const valid = id => typeof id === 'string' && id.trim() === id && id.length > 0 && id.length <= 128;
  const host = env.LINX_HOST_VOICE_ID;
  if (!valid(host) || profiles.some(p => !valid(players[p]))) throw new Error('请配置主持及每个玩家 profile 的音色 ID');
  const ids = [host, ...profiles.map(p => players[p])];
  if (new Set(ids).size !== ids.length) throw new Error('主持与各玩家必须使用不同音色');
  return { host, players: Object.fromEntries(profiles.map(p => [p, players[p]])) };
}
