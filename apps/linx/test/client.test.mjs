import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { initProfile } from '../src/profile.mjs';
import { ota, activate, secureSocketUrl } from '../src/ota.mjs';
import { parseWav, frames } from '../src/wav.mjs';
import { LinxClient, pcm } from '../src/client.mjs';

const identity = { name: 'a', deviceId: '02:01:02:03:04:05', clientId: '3a76ab32-c084-4055-862d-d1b57fde0ee6' };
const config = { url: 'wss://xrobo-io.qiniuapi.com/v1/ws/', token: 'secret-token' };
function wav(samples = 321) {
  const b = Buffer.alloc(44 + samples * 2); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40); return b;
}
test('profiles are durable, independent and reject path traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'linx-profile-'));
  try { const a = await initProfile('a', root), b = await initProfile('b', root); assert.deepEqual(await initProfile('a', root), a); assert.notEqual(a.deviceId, b.deviceId); assert.notEqual(a.clientId, b.clientId); await assert.rejects(initProfile('../escape', root)); } finally { await rm(root, { recursive: true }); }
});
test('OTA validates body, activation, business errors and credential destination', async () => {
  const pending = await ota(identity, { fetchImpl: async (url, request) => {
    assert.equal(url, 'https://xrobo.qiniuapi.com/v1/ota/'); assert.equal(request.redirect, 'error'); assert.equal(JSON.parse(request.body).mac_address, request.headers['Device-Id']); return Response.json({ activation: { code: '123456' } });
  } }); assert.deepEqual(pending, { state: 'unbound', code: '123456' });
  assert.equal(secureSocketUrl(config.url.replace('wss:', 'ws:')), config.url);
  for (const url of ['ws://evil.test/v1/ws/', 'wss://xrobo-io.qiniuapi.com.evil.test/v1/ws/', `${config.url}?token=x`, 'wss://u:p@xrobo-io.qiniuapi.com/v1/ws/']) assert.throws(() => secureSocketUrl(url));
  for (const response of [Response.json({ error: 'secret' }), Response.json({ code: 500 }), new Response('secret', { status: 401 }), new Response('invalid'), Response.json({ websocket: { url: 'ws://evil.test/', token: 'secret' } })]) await assert.rejects(ota(identity, { fetchImpl: async () => response }), error => !error.message.includes('secret'));
  const replies = [Response.json({ activation: { code: '123456' } }), new Response(null, { status: 202 }), new Response('success'), Response.json({ websocket: config })];
  let code; assert.equal((await activate(identity, { fetchImpl: async () => replies.shift(), pollMs: 1, onCode: c => { code = c; } })).token, config.token); assert.equal(code, '123456');
  const failing = [Response.json({ activation: { code: '123456' } }), Response.json({ code: 500, msg: 'secret' })];
  await assert.rejects(activate(identity, { fetchImpl: async () => failing.shift(), pollMs: 1 }), /激活检查失败/);
  await assert.rejects(activate(identity, { fetchImpl: async url => url.endsWith('/activate') ? new Response(null, { status: 202 }) : Response.json({ activation: { code: '123456' } }), timeoutMs: 10, pollMs: 2 }), /激活等待结束/);
});
test('WAV validates format, length, duration and pads final PCM frame', () => {
  const audio = parseWav(wav()); assert.equal(audio.length, 642); assert.deepEqual([...frames(audio)].map(f => f.length), [640, 640]);
  const wrongRate = wav(); wrongRate.writeUInt32LE(48000, 24);
  for (const b of [Buffer.alloc(0), wav().subarray(0, 40), wrongRate, wav(0), wav(16000 * 31)]) assert.throws(() => parseWav(b));
});
async function mockServer(handler) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise(resolve => server.once('listening', resolve));
  server.on('connection', (socket, request) => handler(socket, request));
  return { factory: (_url, options) => new WebSocket(`ws://127.0.0.1:${server.address().port}`, options), close: () => new Promise(resolve => { for (const s of server.clients) s.terminate(); server.close(resolve); }) };
}
test('real local WS: headers, hello, paced audio, privacy and game success remains unverified', async () => {
  const received = [], logs = [];
  const mock = await mockServer((socket, request) => {
    assert.equal(request.headers.authorization, 'Bearer secret-token'); assert.equal(request.headers['device-id'], identity.deviceId);
    socket.on('message', (raw, binary) => {
      received.push({ at: Date.now(), binary, data: binary ? raw.length : JSON.parse(raw.toString()) });
      if (binary) return;
      const m = JSON.parse(raw.toString());
      if (m.type === 'hello') { assert.equal(m.features, undefined); socket.send(JSON.stringify({ type: 'hello', transport: 'websocket', session_id: 'private-session', audio_params: pcm })); }
      if (m.state === 'stop') { socket.send(JSON.stringify({ type: 'stt', text: 'private-role' })); socket.send(JSON.stringify({ type: 'tts', state: 'sentence_start', text: 'private-role' })); socket.send(Buffer.alloc(4)); socket.send(JSON.stringify({ type: 'tts', state: 'stop' })); }
    });
  });
  const client = new LinxClient(identity, { socketFactory: mock.factory, record: e => logs.push(e) });
  try {
    await client.connect(config); assert.equal(client.sessionId, 'private-session'); const result = await client.send(wav()); assert.equal(result.gameAccepted, 'unverified');
    assert.deepEqual(received.map(r => r.binary ? r.data : r.data.type + (r.data.state || '')), ['hello', 'listenstart', 640, 640, 'listenstop']);
    assert.ok(received[3].at - received[2].at >= 10); assert.equal(received[1].data.session_id, 'private-session');
    assert.ok(!JSON.stringify(logs).match(/secret-token|private-role|private-session|02:01:02:03:04:05/));
  } finally { client.close(); await mock.close(); }
});
test('hello absence, Opus negotiation, invalid JSON, authentication and abrupt close fail safely', async () => {
  for (const kind of ['timeout', 'opus', 'invalid', 'close', 'auth']) {
    const mock = await mockServer(socket => socket.on('message', () => {
      if (kind === 'opus') socket.send(JSON.stringify({ type: 'hello', transport: 'websocket', audio_params: { ...pcm, format: 'opus' } }));
      if (kind === 'invalid') socket.send('broken');
      if (kind === 'close' || kind === 'auth') socket.close(1008, 'secret');
    }));
    const client = new LinxClient(identity, { socketFactory: mock.factory, helloTimeoutMs: 30 });
    try { await assert.rejects(client.connect(config)); assert.equal(client.state, 'closed'); } finally { client.close(); await mock.close(); }
  }
});
test('missing session is allowed, but an unfinished turn times out and closes without replay', async () => {
  const mock = await mockServer(socket => socket.on('message', (raw, binary) => { if (!binary && JSON.parse(raw).type === 'hello') socket.send(JSON.stringify({ type: 'hello', transport: 'websocket', audio_params: pcm })); }));
  const client = new LinxClient(identity, { socketFactory: mock.factory, actionTimeoutMs: 80 });
  try { await client.connect(config); assert.equal(client.sessionId, undefined); await assert.rejects(client.send(wav()), /TIMEOUT/); assert.equal(client.state, 'closed'); } finally { client.close(); await mock.close(); }
});
test('backpressure and stalled send callbacks are bounded and clean up', async () => {
  for (const kind of ['backpressure', 'stall']) {
    class Fake extends EventEmitter {
      readyState = WebSocket.OPEN; bufferedAmount = kind === 'backpressure' ? 999999 : 0;
      send(data, callback) { if (JSON.parse(data).type === 'hello') { callback(); queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ type: 'hello', transport: 'websocket', audio_params: pcm })), false)); } }
      terminate() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
    }
    const client = new LinxClient(identity, { actionTimeoutMs: 30, socketFactory: () => { const socket = new Fake(); queueMicrotask(() => socket.emit('open')); return socket; } });
    await client.connect(config); await assert.rejects(client.send(wav())); assert.equal(client.pending, null); assert.equal(client.state, 'closed');
  }
});
test('HTTP upgrade authentication failure is bounded without leaking response', async () => {
  const server = createServer(); server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\nsecret'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const logs = [], client = new LinxClient(identity, { record: e => logs.push(e), socketFactory: (_url, opts) => new WebSocket(`ws://127.0.0.1:${server.address().port}`, opts) });
  try { await assert.rejects(client.connect(config), /SOCKET_ERROR/); assert.ok(!JSON.stringify(logs).includes('secret')); } finally { client.close(); await new Promise(resolve => server.close(resolve)); }
});
test('two clients keep distinct sessions; reconnect refreshes session and interrupted input fails', async () => {
  let counter = 0;
  const mock = await mockServer(socket => socket.on('message', (raw, binary) => {
    if (binary) { socket.terminate(); return; }
    if (JSON.parse(raw).type === 'hello') socket.send(JSON.stringify({ type: 'hello', transport: 'websocket', session_id: `session-${++counter}`, audio_params: pcm }));
  }));
  const a = new LinxClient(identity, { socketFactory: mock.factory }), b = new LinxClient({ ...identity, deviceId: '02:06:07:08:09:00' }, { socketFactory: mock.factory });
  try {
    await Promise.all([a.connect(config), b.connect(config)]); const old = a.sessionId; assert.notEqual(old, b.sessionId);
    a.close(); await a.connect(config); assert.notEqual(a.sessionId, old); assert.equal(a.state, 'ready');
    await assert.rejects(a.send(wav())); assert.equal(a.state, 'closed'); assert.equal(b.state, 'ready');
  } finally { a.close(); b.close(); await mock.close(); }
});
test('realtime input accepts PCM frames and exposes returned TTS PCM for chaining', async () => {
  const received = [], audio = [];
  const mock = await mockServer(socket => socket.on('message', (raw, binary) => {
    received.push({ binary, data: binary ? raw.length : JSON.parse(raw.toString()) });
    if (!binary && JSON.parse(raw.toString()).type === 'hello') socket.send(JSON.stringify({ type: 'hello', transport: 'websocket', session_id: 'realtime-session', audio_params: pcm }));
    if (!binary && JSON.parse(raw.toString()).state === 'stop') {
      socket.send(JSON.stringify({ type: 'stt', text: '上一位发言' }));
      socket.send(JSON.stringify({ type: 'tts', state: 'start' }));
      socket.send(Buffer.alloc(640));
      socket.send(JSON.stringify({ type: 'tts', state: 'stop' }));
    }
  }));
  const client = new LinxClient(identity, { socketFactory: mock.factory, onAudio: chunk => audio.push(chunk) });
  try {
    await client.connect(config);
    const stream = await client.startRealtime();
    await stream.send(Buffer.alloc(640));
    await client.stopRealtime();
    assert.deepEqual(received.map(item => item.binary ? item.data : item.data.type + (item.data.state || '')), ['hello', 'listenstart', 640, 'listenstop']);
    assert.equal(audio.length, 1); assert.equal(audio[0].length, 640);
  } finally { client.close(); await mock.close(); }
});
