import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { transcribe, MAX_PCM_BYTES } from './asr.mjs';
import { synthesize } from './tts.mjs';
import { loadState } from './linx-config.mjs';
const ttsBusy = new Set();
const port = Number(process.env.VOICE_PORT || 4174),
  gamePort = Number(process.env.PORT || 4173);
let busy = false;
const origins = new Set([`http://localhost:${gamePort}`, `http://127.0.0.1:${gamePort}`]);
const send = (r, status, data) => {
  r.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  r.end(JSON.stringify(data));
};
http
  .createServer(async (req, res) => {
    try {
      if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host))
        return send(res, 403, { error: '无效来源' });
      if (req.headers.origin && !origins.has(req.headers.origin))
        return send(res, 403, { error: '不允许跨站语音请求' });
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.end();
      }
      if (req.method === 'GET' && req.url === '/voices') {
        const state = await loadState();
        return send(res, 200, {
          players: state.players.map((p) => ({
            seat: p.seat,
            name: p.name,
            voiceName: p.voiceName || '尚未配置',
          })),
        });
      }
      if (req.method === 'POST' && req.url === '/speak') {
        if (req.headers['content-type'] !== 'application/json')
          return send(res, 415, { error: '请求格式无效' });
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 8000) return send(res, 413, { error: '发言过长' });
        }
        const { seat, text } = JSON.parse(raw);
        if (ttsBusy.has(seat)) return send(res, 409, { error: '该玩家正在生成语音' });
        ttsBusy.add(seat);
        const abort = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) abort.abort();
        });
        try {
          const audio = await synthesize(seat, text, { signal: abort.signal });
          if (!res.destroyed) {
            res.writeHead(200, { 'Content-Type': audio.type, 'Cache-Control': 'no-store' });
            res.end(audio.data);
          }
        } finally {
          ttsBusy.delete(seat);
        }
        return;
      }
      if (req.method === 'GET' && req.url === '/status')
        return send(res, 200, { ready: !!(await loadState()).asr?.ready });
      if (req.method === 'GET' && req.url === '/recorder.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        return res.end(await readFile(new URL('./public/recorder.js', import.meta.url)));
      }
      if (req.method !== 'POST' || req.url !== '/transcribe')
        return send(res, 404, { error: '接口不存在' });
      if (req.headers['content-type'] !== 'application/octet-stream')
        return send(res, 415, { error: '音频格式无效' });
      if (busy) return send(res, 409, { error: '上一段语音正在识别，请稍候' });
      busy = true;
      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) abort.abort();
      });
      try {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_PCM_BYTES) return send(res, 413, { error: '单次录音最多 60 秒' });
          chunks.push(chunk);
        }
        const text = await transcribe(Buffer.concat(chunks), { signal: abort.signal });
        if (!res.destroyed) send(res, 200, { text });
      } finally {
        busy = false;
      }
    } catch (e) {
      if (!res.destroyed) send(res, 400, { error: e.message || '语音识别失败' });
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`灵矽语音输入服务：http://localhost:${port}`));
