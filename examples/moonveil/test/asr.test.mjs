import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { validatePCM, recognize, MAX_PCM_BYTES } from '../asr.mjs';
import { resamplePCM, microphoneError } from '../public/recorder.js';
test('PCM conversion handles 48k stereo-mixed chunks, clipping and little endian', () => {
  const out = resamplePCM(
    [new Float32Array(24000).fill(0.5), new Float32Array(24000).fill(-0.5)],
    48000,
  );
  assert.equal(out.byteLength, 32000);
  const view = new DataView(out);
  assert.equal(view.getInt16(0, true), 16384);
  assert.equal(view.getInt16(31998, true), -16384);
  assert.equal(
    new DataView(resamplePCM([new Float32Array([2, -2])], 16000)).getInt16(0, true),
    32767,
  );
});
test('audio validation rejects silence, empty, odd or oversized buffers', () => {
  for (const b of [
    Buffer.alloc(0),
    Buffer.alloc(3201),
    Buffer.alloc(3200),
    Buffer.alloc(MAX_PCM_BYTES + 2),
  ])
    assert.throws(() => validatePCM(b));
  const pcm = Buffer.alloc(3200);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(1000, i);
  assert.doesNotThrow(() => validatePCM(pcm));
});
test('permission failures explain microphone and system permission separately', () => {
  assert.match(microphoneError({ name: 'NotAllowedError' }), /系统麦克风/);
  assert.match(microphoneError({ name: 'NotFoundError' }), /没有找到麦克风/);
});
function packet(d) {
  const b = Buffer.from(JSON.stringify(d));
  if (b.length >= 126) throw Error('test packet too large');
  return Buffer.concat([Buffer.from([129, b.length]), b]);
}
function decode(b) {
  const prefix = (b[1] & 127) === 126 ? 4 : 2,
    mask = b.subarray(prefix, prefix + 4),
    out = Buffer.from(b.subarray(prefix + 4));
  for (let i = 0; i < out.length; i++) out[i] ^= mask[i % 4];
  return { opcode: b[0] & 15, body: out };
}
test('realistic handshake sends PCM frames, manual stop, reads only STT and aborts response', async () => {
  const sent = [];
  const socket = new EventEmitter();
  socket.destroy = () => {};
  socket.write = (b) => {
    const f = decode(b);
    sent.push(f);
    if (f.opcode === 1) {
      const d = JSON.parse(f.body);
      if (d.type === 'hello')
        queueMicrotask(() =>
          socket.emit('data', packet({ type: 'hello', transport: 'websocket', session_id: 's' })),
        );
      if (d.type === 'listen' && d.state === 'stop')
        queueMicrotask(() =>
          socket.emit('data', packet({ type: 'stt', session_id: 's', text: '我是预言家' })),
        );
    }
  };
  const requestImpl = (url, opts) => {
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = () =>
      queueMicrotask(() =>
        req.emit(
          'upgrade',
          {
            headers: {
              'sec-websocket-accept': createHash('sha1')
                .update(opts.headers['Sec-WebSocket-Key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
                .digest('base64'),
            },
          },
          socket,
          Buffer.alloc(0),
        ),
      );
    return req;
  };
  assert.equal(
    await recognize(
      { url: 'wss://xrobo-io.qiniuapi.com/v1/ws/', token: 'test', deviceId: 'd', clientId: 'c' },
      Buffer.alloc(1280),
      { requestImpl, paceMs: 0, timeoutMs: 2000 },
    ),
    '我是预言家',
  );
  assert.equal(sent.filter((f) => f.opcode === 2).length, 2);
  assert.ok(sent.some((f) => f.opcode === 1 && JSON.parse(f.body).type === 'abort'));
});
