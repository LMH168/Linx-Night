#!/usr/bin/env node
/**
 * 真机/无头浏览器测帧 —— 用本地 Chrome/Edge 的 CDP 直接量对局舞台。
 *
 * 为什么不用 Puppeteer/Playwright：本项目不希望为了测一次性能就往依赖里加
 * 一个浏览器自动化框架。Edge/Chrome 自带 CDP，项目本来就有 `ws` 依赖，
 * 两者拼起来就够用。
 *
 * 用法：
 *   node tools/measure-stage.mjs                       # 默认站点 lobby
 *   node tools/measure-stage.mjs --url=https://x/#/table --ms=4000
 *   node tools/measure-stage.mjs --browser="C:\...\msedge.exe"
 *
 * 退出码：0 测到数据；1 页面没起来 / 没有舞台；2 浏览器或 CDP 失败。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const URL_TARGET = arg('url', 'https://linxnight.mimi-api.cn/?perf=1#/lobby');
const BENCH_MS = Number(arg('ms', '3000'));
const IDLE_MS = Number(arg('idle', '2500'));
const PORT = Number(arg('port', '9333'));
const TIMEOUT = Number(arg('timeout', '45000'));

const CANDIDATES = [
  arg('browser', ''),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const browserPath = CANDIDATES.find((p) => existsSync(p));
if (!browserPath) {
  console.error('找不到 Chrome/Edge，可用 --browser=<路径> 指定');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'linx-cdp-'));
const child = spawn(
  browserPath,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--enable-unsafe-swiftshader',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);

const cleanup = () => {
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
};
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('DevTools 端口没起来');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params, msg.sessionId);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} 超时`));
        }
      }, TIMEOUT);
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
}

const EXPRESSION = `(async () => {
  const started = performance.now();
  while (!window.__linxStage && performance.now() - started < ${TIMEOUT}) {
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!window.__linxStage) {
    const canvas = document.querySelector('canvas.game-world-scene');
    return { ok: false, reason: 'window.__linxStage 未出现', canvas: !!canvas };
  }
  const bench = await window.__linxStage.benchmark(${BENCH_MS});
  const stats = window.__linxStage.stats();
  const before = stats.renders;
  await new Promise((r) => setTimeout(r, ${IDLE_MS}));
  const after = window.__linxStage.stats().renders;
  const gl = (() => {
    const c = document.querySelector('canvas');
    const ctx = c && (c.getContext('webgl2') || c.getContext('webgl'));
    if (!ctx) return null;
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    return dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
  })();
  return { ok: true, bench, stats, idleFrames: after - before, gl, ua: navigator.userAgent };
})()`;

async function main() {
  const wsUrl = await waitForDevtools();
  const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const cdp = new Cdp(ws);

  const errors = [];
  cdp.on('Runtime.exceptionThrown', (params) => {
    errors.push(params?.exceptionDetails?.exception?.description ?? JSON.stringify(params));
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params?.type === 'error') {
      errors.push((params.args ?? []).map((a) => a.value ?? a.description).join(' '));
    }
  });

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url: URL_TARGET }, sessionId);
  await sleep(1200);

  const result = await cdp.send(
    'Runtime.evaluate',
    { expression: EXPRESSION, awaitPromise: true, returnByValue: true },
    sessionId,
  );

  const value = result?.result?.value;
  const out = { url: URL_TARGET, browser: browserPath, errors, result: value };
  console.log(JSON.stringify(out, null, 2));

  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  ws.close();
  cleanup();

  if (!value) return 2;
  if (!value.ok) return 1;
  const low = value.bench.fps < 30;
  console.error(
    `\n结论：${value.bench.fps.toFixed(1)} fps · ${value.bench.calls} draw calls · ` +
      `${value.bench.triangles} triangles · 静止 ${IDLE_MS}ms 渲染 ${value.idleFrames} 帧` +
      (low ? ' · 低于 30fps' : '') +
      (value.gl ? `\nGPU：${value.gl}` : '\nGPU：未知'),
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
