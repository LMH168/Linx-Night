const URLS = [
  'https://linxnight.mimi-api.cn/#/',
  'https://linxnight.mimi-api.cn/#/lobby',
];

const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const { spawn } = await import('node:child_process');
const WebSocket = (await import('ws')).default;
const path = await import('node:path');
const os = await import('node:os');
const fs = await import('node:fs');

const PORT = 9341;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-route-'));
const child = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 80; i += 1) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (res.ok) { wsUrl = (await res.json()).webSocketDebuggerUrl; break; }
  } catch { /* wait */ }
  await sleep(250);
}

const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let seq = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, { resolve });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);

for (const url of URLS) {
  await send('Page.navigate', { url }, sessionId);
  await sleep(4000);
  const probe = await send('Runtime.evaluate', {
    expression: `(() => {
      const frames = [...document.querySelectorAll('iframe')].map((f) => f.getAttribute('src'));
      const canvas = document.querySelector('canvas.game-world-scene');
      const world = document.querySelector('.game-world');
      return {
        iframes: frames,
        canvas: canvas ? { w: canvas.width, h: canvas.height, cls: canvas.className } : null,
        gameWorld: world ? { cls: world.className, hidden: world.style.display } : null,
        stageHandle: !!window.__linxStage,
        route: location.hash,
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        bodyText: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160),
      };
    })()`,
    returnByValue: true,
  }, sessionId);
  console.log('\n=== ' + url);
  console.log(JSON.stringify(probe?.result?.value, null, 2));
}

ws.close();
child.kill();
setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } process.exit(0); }, 300);
