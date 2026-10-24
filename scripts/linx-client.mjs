import { createInterface } from 'node:readline/promises';
import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initProfile, readProfile, profilePath } from '../apps/linx/src/profile.mjs';
import { ota, activate } from '../apps/linx/src/ota.mjs';
import { LinxClient } from '../apps/linx/src/client.mjs';

const [command, name] = process.argv.slice(2);
let client, terminal, logTail = Promise.resolve(), logFailure = false;
const abort = new AbortController();
const close = () => { abort.abort(); client?.close(); terminal?.close(); };
process.once('SIGINT', close); process.once('SIGTERM', close);
try {
  if (command === 'init') {
    await initProfile(name); console.log(`已保存软件身份：${profilePath(name)}（重复执行不会重置）`);
  } else if (command === 'activate') {
    const identity = await readProfile(name);
    await activate(identity, { signal: abort.signal, onCode: code => console.log(`请在灵矽控制台将激活码 ${code} 关联到专用测试 Agent；最多等待 5 分钟。`) });
    console.log('激活成功，可以运行 connect。');
  } else if (command === 'connect') {
    const identity = await readProfile(name), directory = profilePath(name);
    const evidence = join(directory, 'evidence'); await mkdir(evidence, { recursive: true });
    const log = join(evidence, `${Date.now()}-${randomUUID()}.jsonl`);
    const record = event => {
      logTail = logTail.then(() => appendFile(log, `${JSON.stringify(event)}\n`, { mode: 0o600 })).catch(() => { logFailure = true; console.error('证据写入失败，本次不可标记验收通过'); client?.close(); });
      if (event.type !== 'audio_received') console.log(JSON.stringify(event));
    };
    record({ at: new Date().toISOString(), type: 'attempt_created', source: 'program-client', profileAlias: name });
    const config = await ota(identity, { signal: abort.signal });
    if (config.state !== 'bound') throw new Error('设备未激活，请先运行 activate');
    client = new LinxClient(identity, { record });
    await client.connect(config);
    // Local-only identity artifact for an administrator to compare with MCP diagnostics.
    await writeFile(join(directory, 'connection.json'), JSON.stringify({ deviceId: identity.deviceId, clientId: identity.clientId, sessionId: client.sessionId, runId: client.runId, connectedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    console.log(`连接成功；本机身份记录：${join(directory, 'connection.json')}\n脱敏协议证据：${log}\n命令：send <WAV 路径> / status / close。语音结束不代表游戏行动被接受。`);
    terminal = createInterface({ input: process.stdin, output: process.stdout });
    for await (const line of terminal) {
      const input = line.trim();
      try {
        if (input.startsWith('send ')) { const file = input.slice(5).trim().replace(/^"(.*)"$/, '$1'); await client.send(await readFile(file)); }
        else if (input === 'status') console.log(client.status());
        else if (input === 'close') break;
        else if (input) console.log('命令：send <WAV 路径> / status / close');
      } catch (error) { console.error(error.code ? `本机文件错误 ${error.code}` : error.message); }
    }
  } else throw new Error('用法：node scripts/linx-client.mjs init|activate|connect <profile>');
} catch (error) { console.error(error.code ? `本机文件错误 ${error.code}` : error.message); process.exitCode = 1; }
finally { close(); await logTail; if (logFailure) process.exitCode = 1; }
