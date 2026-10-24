import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const profileRoot = join(process.env.LOCALAPPDATA || homedir(), 'LinxNight', 'profiles');
export function profilePath(name, root = profileRoot) {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name || '')) throw new Error('profile 名称只能包含字母、数字、下划线和短横线（1–40 字符）');
  return join(root, name);
}
export async function readProfile(name, root = profileRoot) {
  const p = JSON.parse(await readFile(join(profilePath(name, root), 'identity.json'), 'utf8'));
  if (p.name !== name || !/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(p.deviceId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(p.clientId)) throw new Error('软件身份文件无效');
  return p;
}
export async function initProfile(name, root = profileRoot) {
  const directory = profilePath(name, root);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const bytes = randomBytes(6); bytes[0] = (bytes[0] | 2) & 254;
  const identity = { name, deviceId: [...bytes].map(b => b.toString(16).padStart(2, '0')).join(':'), clientId: randomUUID() };
  try { await writeFile(join(directory, 'identity.json'), JSON.stringify(identity, null, 2), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return readProfile(name, root);
}
