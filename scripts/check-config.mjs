import { join } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseWav } from '../apps/linx/src/wav.mjs';
import { profilePath } from '../apps/linx/src/profile.mjs';

export async function checkConfig({ env = process.env, fs = { access, readFile } } = {}) {
  const missing = [];
  for (const key of ['LINX_AGENT_ID', 'LINX_MCP_ADMIN_URL', 'LINX_MCP_ADMIN_TOKEN', 'MCP_AUTH_TOKEN', 'ADMIN_TOKEN']) if (!env[key]?.trim()) missing.push(key);
  const profiles = String(env.LINX_PROFILES || 'player-a,player-b').split(',').map(name => name.trim()).filter(Boolean);
  const seats=String(env.LINX_SEATS || 'P2,P3').split(',').map(s=>s.trim()).filter(Boolean);
  if(new Set(profiles).size!==profiles.length || profiles.length<seats.length) missing.push('LINX_PROFILES: count or duplicates');
  if(seats.some(s=>!/^P[1-9]$/.test(s)) || new Set(seats).size!==seats.length)missing.push('LINX_SEATS: invalid');
  if(env.LINX_MCP_ADMIN_TOKEN!==env.ADMIN_TOKEN)missing.push('LINX_MCP_ADMIN_TOKEN: must match ADMIN_TOKEN');
  if(env.ADMIN_TOKEN && env.ADMIN_TOKEN===env.MCP_AUTH_TOKEN)missing.push('ADMIN_TOKEN: must differ from MCP_AUTH_TOKEN');
  if(env.LINX_VOICE_PROFILE){if(profiles.includes(env.LINX_VOICE_PROFILE))missing.push('LINX_VOICE_PROFILE: must be independent');else{try{await fs.access(`${profilePath(env.LINX_VOICE_PROFILE)}/identity.json`);}catch{missing.push('LINX_VOICE_PROFILE: missing identity');}}}
  for (const profile of profiles) { try { await fs.access(`${profilePath(profile)}/identity.json`); } catch { missing.push(`profile:${profile}`); } }
  try { const wav=env.LINX_TURN_WAV || join(env.LOCALAPPDATA || '.', 'LinxNight', 'audio', 'turn.wav'); await fs.access(wav); if(fs.readFile)parseWav(await fs.readFile(wav)); } catch { missing.push('LINX_TURN_WAV: run scripts/linx-audio.ps1'); }
  return { ok: missing.length === 0, missing, profiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkConfig(); if (!result.ok) { console.error(`Linx 配置不完整：${result.missing.join(', ')}`); process.exitCode = 1; } else console.log(`Linx 配置完整：${result.profiles.join(', ')}`);
}
