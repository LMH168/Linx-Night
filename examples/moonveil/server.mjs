import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Game } from './engine.mjs';
import { configured, checkLinx, status, createProvider } from './linx.mjs';
import { prepareLinxNight, transact } from './orchestrator.mjs';
import { loadEnvFile } from 'node:process';
const providers = new Map();
let creating = false;
const reloadEnv = () => {
  try {
    loadEnvFile(new URL('./.env', import.meta.url));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
};
const games = new Map(),
  root = new URL('./public/', import.meta.url),
  port = Number(process.env.PORT || 4173);
const send = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};
const server = http.createServer(async (req, res) => {
  try {
    reloadEnv();
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/current') {
      const current = [...games.values()].find((g) => g.aiMode === 'linx' && g.phase !== 'over');
      return send(res, 200, current ? current.view() : null);
    }
    if (req.method === 'GET' && url.pathname === '/api/status')
      return send(res, 200, await status());
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
        return send(res, 403, { error: '不允许跨站请求' });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 10000) return send(res, 413, { error: '请求过大' });
      }
      const body = JSON.parse(raw || '{}');
      if (url.pathname === '/api/linx/check') {
        if (creating || [...games.values()].some((g) => g.aiMode === 'linx' && g.phase !== 'over'))
          return send(res, 409, { error: '请先结束当前灵矽对局，再进行连接验证' });
        creating = true;
        try {
          return send(res, 200, await checkLinx({ testOutput: body.testOutput === true }));
        } finally {
          creating = false;
        }
      }
      if (url.pathname === '/api/game') {
        if (creating) return send(res, 409, { error: '正在创建对局，请稍候' });
        if (
          configured() &&
          [...games.values()].some((x) => x.aiMode === 'linx' && x.phase !== 'over')
        )
          return send(res, 409, {
            error: '已有灵矽对局占用独立设备，请继续该局或先返回大厅结束对局',
          });
        creating = true;
        try {
          const mode = configured() ? 'linx' : 'demo',
            g = new Game({ ...body, aiMode: mode });
          if (mode === 'linx') {
            const provider = await createProvider(g.players.length);
            await checkLinx();
            await prepareLinxNight(g, provider);
            providers.set(g.id, provider);
          }
          if (games.size > 200) {
            const id = games.keys().next().value;
            games.delete(id);
            providers.delete(id);
          }
          games.set(g.id, g);
          return send(res, 200, g.view());
        } finally {
          creating = false;
        }
      }
      const g = games.get(body.gameId);
      if (!g) return send(res, 404, { error: '对局已过期，请重新开局' });
      if (g.busy) return send(res, 409, { error: '正在处理上一项操作' });
      g.busy = true;
      try {
        if (url.pathname === '/api/end') {
          games.delete(g.id);
          providers.delete(g.id);
          return send(res, 200, { ended: true });
        }
        if (g.aiMode === 'linx') {
          const next = await transact(g, url.pathname, body, providers.get(g.id));
          next.busy = false;
          games.set(g.id, next);
          return send(res, 200, next.view());
        }
        switch (url.pathname) {
          case '/api/night':
            g.actNight(body);
            break;
          case '/api/speech':
            g.speech(1, body.text);
            break;
          case '/api/ai': {
            if (g.phase !== 'discussion' || !g.speaker || g.speaker === 1)
              throw Error('当前没有 AI 发言');
            const id = g.speaker;
            const text = g.fallbackSpeech(id);
            g.speech(id, text);
            break;
          }
          case '/api/vote':
            g.vote(body.target);
            break;
          case '/api/next':
            g.nextNight();
            break;
          case '/api/shoot':
            g.shoot(body.target);
            break;
          default:
            return send(res, 404, { error: '接口不存在' });
        }
        return send(res, 200, g.view());
      } finally {
        g.busy = false;
      }
    }
    if (req.method !== 'GET') return send(res, 405, { error: '不支持的请求方式' });
    const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'style.css', 'app.js'].includes(path))
      return send(res, 404, { error: '页面不存在' });
    const data = await readFile(new URL(path, root));
    res.writeHead(200, {
      'Content-Type': path.endsWith('.css')
        ? 'text/css'
        : path.endsWith('.js')
          ? 'text/javascript'
          : 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch (e) {
    send(res, 400, { error: e.message || '操作失败' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`月隐已启动：http://localhost:${port}`));
