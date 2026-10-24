import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createApiServer, rooms, publishNewEvents } from '../apps/server/src/api.mjs';
import { createMcpServer, sessions, devices } from '../apps/mcp/src/server.mjs';
import { newScenario, armScenario, evidenceReport } from './lab/scenarios.mjs';
import { verifiedProgramBinding } from './lab/program-binding.mjs';
import { readProfile, profilePath } from '../apps/linx/src/profile.mjs';
import { programEvidence } from './lab/program-evidence.mjs';

if (!process.env.ADMIN_TOKEN || !process.env.MCP_AUTH_TOKEN || process.env.ADMIN_TOKEN === process.env.MCP_AUTH_TOKEN) throw new Error('请加载独立测试环境文件，使用不同的 ADMIN_TOKEN 和 MCP_AUTH_TOKEN');
const api = createApiServer({ port: 5100 }).server;
const mcp = createMcpServer({ port: 9191 }).server;
const listen = (server, port) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const output = join(process.env.LOCALAPPDATA || homedir(), 'LinxNight-lab', 'evidence');
let scenario, child, terminal, closing = false;
const adminHeaders = { authorization: `Bearer ${process.env.ADMIN_TOKEN}` };
async function diagnostics() {
  const r = await fetch('http://127.0.0.1:9191/admin/diagnostics', { headers: adminHeaders, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`诊断失败 HTTP ${r.status}`);
  return (await r.json()).requests;
}
async function exportEvidence() {
  if (!scenario?.armed || scenario.name === 'lobby') return;
  await mkdir(output, { recursive: true });
  const requests = await diagnostics();
  const report = evidenceReport(scenario, requests);
  if (scenario.bindings) report.program = await programEvidence(scenario, requests);
  const file = join(output, `${scenario.room.roomId}-${scenario.name}.json`);
  await writeFile(file, JSON.stringify(report, null, 2));
  console.log('脱敏证据：', file, '\n服务端检查：', report.serverChecks, '\n真实平台与浏览器证据仍需人工核对。');
}
async function cleanup() {
  if (closing) return; closing = true;
  terminal?.close(); child?.kill();
  for (const server of [api, mcp]) { server.closeAllConnections(); server.close(); }
  sessions.clear(); devices.clear(); rooms.clear();
}
try {
  await listen(api, 5100); await listen(mcp, 9191);
  child = spawn(process.execPath, ['apps/client/server.mjs'], { cwd: resolve(import.meta.dirname, '..'), env: { ...process.env, CLIENT_PORT: '5110', CLIENT_HOST: '127.0.0.1' }, stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', error => { console.error(error.message); cleanup(); });
  child.on('exit', code => { if (!closing) { console.error(`测试网页进程结束 ${code}`); cleanup(); } });
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  process.once('SIGINT', () => cleanup()); process.once('SIGTERM', () => cleanup());
  console.log('命令：scene lobby|speech|vote|dual-speech；arm；recent；bind <SessionID>（第一批）；bind-program <P2|P3> <profile> <SessionID>；export；quit');
  console.log('先 scene，再通过网页加入 P1，然后 arm；禁止点击普通开始游戏按钮。');
  for await (const line of terminal) {
    try {
      const [command, arg, profile, sessionId] = line.trim().split(/\s+/);
      if (command === 'scene') {
        const next = newScenario(arg); await exportEvidence();
        sessions.clear(); devices.clear(); rooms.clear(); scenario = next; rooms.set(next.room.roomId, next.room);
        console.log(`打开 http://localhost:5110/?api=http%3A%2F%2Flocalhost%3A5100&room=${next.room.roomId} ，在全新标签页点击加入房间。`);
      } else if (command === 'arm') {
        if (!scenario) throw new Error('请先创建场景');
        const room = armScenario(scenario); publishNewEvents(room);
        console.log(`已准备 ${scenario.name}。第二批先用程序 send query.wav，再 recent / bind-program；第一批仍可网页拨打后 bind。`);
      } else if (command === 'recent') {
        console.log((await diagnostics()).filter(r => r.authenticated).slice(-10).map(({ at, tool, sessionId, agentId, deviceId, failure }) => ({ at, tool, sessionId, agentId, deviceId, failure })));
      } else if (command === 'bind') {
        if (scenario?.name === 'dual-speech' || scenario?.bindings) throw new Error('程序测试使用 bind-program，不混用第一批绑定');
        if (!scenario?.armed || !arg) throw new Error('先 arm，再指定已核对的 SessionID');
        const request = (await diagnostics()).findLast(r => r.authenticated && r.sessionId === arg && r.agentId && r.deviceId && r.at >= scenario.armedAt);
        if (!request) throw new Error('未找到本场景准备后具有完整身份头的已认证请求');
        if (scenario.binding) throw new Error('本场景已绑定；重连请创建新场景以隔离证据');
        const binding = { roomId: scenario.room.roomId, seatId: 'P2', role: 'player', sessionId: arg, deviceId: request.deviceId, agentId: request.agentId };
        const r = await fetch('http://127.0.0.1:9191/admin/bindings', { method: 'POST', headers: { ...adminHeaders, 'content-type': 'application/json' }, body: JSON.stringify(binding) });
        if (!r.ok) throw new Error(`绑定失败 HTTP ${r.status}`);
        scenario.binding = binding; scenario.boundAt = new Date().toISOString(); console.log('P2 已登记。现在通过灵矽网页说出测试话术；完成后 export。');
      } else if (command === 'bind-program') {
        const identity = await readProfile(profile);
        const connection = JSON.parse(await readFile(join(profilePath(profile), 'connection.json'), 'utf8'));
        const binding = verifiedProgramBinding({ scenario, seatId: arg, identity, connection, agentId: process.env.LINX_TEST_AGENT_ID, sessionId, requests: await diagnostics() });
        if (sessions.has(binding.sessionId) || devices.has(`${binding.agentId}:${binding.deviceId}`)) throw new Error('该身份已被登记；新建场景后重试');
        const { profile: profileName, runId, ...requestBody } = binding;
        const r = await fetch('http://127.0.0.1:9191/admin/bindings', { method: 'POST', headers: { ...adminHeaders, 'content-type': 'application/json' }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`绑定失败 HTTP ${r.status}`);
        scenario.bindings ||= {}; scenario.bindings[arg] = binding;
        if (arg === 'P2') scenario.binding = binding;
        scenario.boundAt = new Date().toISOString();
        console.log(`${arg} 已登记为 ${profileName}，运行 ${runId}。先发送查询验证私密身份，再发送本场景行动音频。`);
      } else if (command === 'export') await exportEvidence();
      else if (command === 'quit') { await exportEvidence(); break; }
      else if (command) console.log('未知命令');
    } catch (error) { console.error(error.message); }
  }
} finally { await cleanup(); }
