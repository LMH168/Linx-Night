import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { profilePath } from '../apps/linx/src/profile.mjs';

export async function checkConfig({ env = process.env, fs = { access } } = {}) {
  const missing = [];
  for (const key of ['LINX_AGENT_ID', 'LINX_MCP_ADMIN_URL', 'LINX_MCP_ADMIN_TOKEN', 'MCP_AUTH_TOKEN', 'ADMIN_TOKEN']) if (!env[key]?.trim()) missing.push(key);
  const profiles = String(env.LINX_PROFILES || 'player-a,player-b').split(',').map(name => name.trim()).filter(Boolean);
  for (const profile of profiles) { try { await fs.access(`${profilePath(profile)}/identity.json`); } catch { missing.push(`profile:${profile}`); } }
  try { await fs.access(env.LINX_TURN_WAV || join(env.LOCALAPPDATA || '.', 'LinxNight', 'audio', 'turn.wav')); } catch { missing.push('LINX_TURN_WAV: run scripts/linx-audio.ps1'); }
  return { ok: missing.length === 0, missing, profiles };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  const result = await checkConfig(); if (!result.ok) { console.error(`Linx 配置不完整：${result.missing.join(', ')}`); process.exitCode = 1; } else console.log(`Linx 配置完整：${result.profiles.join(', ')}`);
}
