import { readFile } from 'node:fs/promises';
const envFile = `${process.env.LOCALAPPDATA}/LinxNight-lab.env`;
for (const line of await readFile(envFile, 'utf8').then(text => text.split(/\r?\n/))) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}
Object.assign(process.env, {
  LINX_PROFILES: 'player-a,player-b,player-c,player-d,player-e,player-f,player-g,player-h',
  LINX_AGENT_ID: '83699aeb48f4470b8d4021eb2a9e1d5a',
  LINX_HOST_PROFILE: 'host',
  LINX_HOST_AGENT_ID: '0317d571793e499f9d8d9d0584098ef2',
  LINX_MCP_ADMIN_URL: 'http://127.0.0.1:9091',
  LINX_MCP_ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  PORT: '5000', CLIENT_PORT: '5010', MCP_PORT: '9091'
});
await import('../run.mjs');
