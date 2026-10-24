import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { frame, FrameReader, parseDecision, LinxProvider, exchange } from '../linx.mjs';
import { validateRoster, secureWsURL, ota, platform } from '../linx-config.mjs';
import { Game } from '../engine.mjs';
import { transact, prepareLinxNight } from '../orchestrator.mjs';
const packet = (text, op = 1, fin = true) => {
  const b = Buffer.from(text);
  return Buffer.concat([Buffer.from([(fin ? 128 : 0) | op, b.length]), b]);
};
test('client frames are masked, including 64KB payloads', () => {
  for (const length of [5, 150, 70000]) {
    const b = frame('x'.repeat(length)),
      prefix = length < 126 ? 2 : length <= 65535 ? 4 : 10;
    assert.ok(b[1] & 128);
    const mask = b.subarray(prefix, prefix + 4),
      out = Buffer.from(b.subarray(prefix + 4));
    for (let i = 0; i < out.length; i++) out[i] ^= mask[i % 4];
    assert.equal(out.toString(), 'x'.repeat(length));
  }
});
test('server reader handles fragmentation, partial packets, binary and ping', () => {
  const messages = [],
    pings = [];
  const r = new FrameReader(
    (b, o) => messages.push([b.toString(), o]),
    (b) => pings.push(b.toString()),
    () => {},
  );
  const b = packet('first', 1, false);
  r.push(b.subarray(0, 1));
  r.push(b.subarray(1));
  r.push(packet('ping', 9));
  r.push(packet('second', 0));
  r.push(packet('audio', 2));
  assert.deepEqual(messages, [
    ['firstsecond', 1],
    ['audio', 2],
  ]);
  assert.deepEqual(pings, ['ping']);
  assert.throws(() => r.push(packet('orphan', 0)));
});
test('decision parser rejects narrative, illegal targets and fields', () => {
  const a = [
    { action: 'vote', target: 3 },
    { action: 'vote', target: null },
  ];
  assert.deepEqual(parseDecision('```json\n{"action":"vote","target":3}\n```', a), a[0]);
  for (const s of [
    'vote 3',
    '{"action":"vote","target":1}',
    '{"action":"vote","target":"3"}',
    '{"action":"vote","target":3,"reason":"x"}',
  ])
    assert.throws(() => parseDecision(s, a));
});
test('independent roster rejects reused agents and devices', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({
    seat: i + 2,
    agentId: 'agent' + i,
    deviceId: `02:00:00:00:00:0${i}`,
    clientId: 'client' + i,
    ready: true,
  }));
  assert.equal(validateRoster({ players }).length, 8);
  players[1].agentId = players[0].agentId;
  assert.throws(() => validateRoster({ players }));
});
test('OTA restricts credential destination and validates business errors', async () => {
  assert.equal(
    secureWsURL('ws://xrobo-io.qiniuapi.com/v1/ws/'),
    'wss://xrobo-io.qiniuapi.com/v1/ws/',
  );
  assert.throws(() => secureWsURL('wss://evil.example/v1/ws/'));
  await assert.rejects(
    platform('/test', {
      key: 'test',
      fetchImpl: async () => ({ ok: true, json: async () => ({ code: 401 }) }),
    }),
  );
  await assert.rejects(
    ota(
      { deviceId: '02:00:00:00:00:01', clientId: 'x' },
      {
        fetchImpl: async () => ({ ok: true, json: async () => ({ error: 'Invalid OTA request' }) }),
      },
    ),
  );
});
test('provider uses exact seat device and never includes another identity', async () => {
  const calls = [];
  const provider = new LinxProvider(
    [
      { seat: 2, name: 'A', deviceId: 'a' },
      { seat: 3, name: 'B', deviceId: 'b' },
    ],
    {
      getConnection: async (p) => ({ deviceId: p.deviceId }),
      transport: async (c, v) => {
        calls.push([c.deviceId, v]);
        return '我的发言';
      },
    },
  );
  await provider.speech({ seat: 2, role: '村民' });
  await provider.speech({ seat: 3, role: '狼人' });
  assert.deepEqual(
    calls.map((x) => x[0]),
    ['a', 'b'],
  );
  assert.equal(calls[0][1].role, '村民');
  await assert.rejects(provider.speech({ seat: 9 }));
});
test('exchange verifies handshake, ignores audio, assembles TTS and handles abort', async () => {
  for (const aborted of [false, true]) {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.write = () => {};
    const requestImpl = (url, options) => {
      const req = new EventEmitter();
      req.destroy = () => {};
      req.end = () =>
        queueMicrotask(() => {
          const accept = createHash('sha1')
            .update(options.headers['Sec-WebSocket-Key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64');
          req.emit(
            'upgrade',
            { headers: { 'sec-websocket-accept': accept } },
            socket,
            Buffer.alloc(0),
          );
          for (const msg of [
            { type: 'hello', transport: 'websocket', session_id: 's' },
            { type: 'tts', state: 'sentence_start', text: '你好' },
            { type: 'tts', state: 'stop', is_aborted: aborted },
          ])
            socket.emit('data', packet(JSON.stringify(msg)));
        });
      return req;
    };
    const task = exchange(
      { url: 'wss://xrobo-io.qiniuapi.com/v1/ws/', token: 'test', deviceId: 'x', clientId: 'y' },
      { seat: 2 },
      'speak',
      { requestImpl },
    );
    if (aborted) await assert.rejects(task, /打断/);
    else assert.equal(await task, '你好');
  }
});
function rig() {
  const g = new Game({ size: 6, role: 'seer', aiMode: 'linx' });
  ['seer', 'wolf', 'witch', 'villager', 'villager', 'wolf'].forEach(
    (r, i) => (g.players[i].role = r),
  );
  return g;
}
test('AI nighttime and votes are transactional on failure', async () => {
  const g = rig();
  const before = JSON.stringify(g);
  const bad = {
    decide: async () => {
      throw Error('timeout');
    },
  };
  await assert.rejects(transact(g, '/api/night', { target: 2 }, bad));
  assert.equal(JSON.stringify(g), before);
  g.phase = 'vote';
  const state = JSON.stringify(g);
  await assert.rejects(transact(g, '/api/vote', { target: 2 }, bad));
  assert.equal(JSON.stringify(g), state);
});
test('each AI voter gets independent perspective and no early ballot leaks', async () => {
  const g = rig();
  g.phase = 'vote';
  const views = [];
  const provider = {
    decide: async (v) => {
      views.push(v);
      return { action: 'vote', target: null };
    },
  };
  const next = await transact(g, '/api/vote', {}, provider);
  assert.equal(next.phase, 'result');
  assert.equal(views.length, 5);
  assert.ok(views.every((v) => v.votes.length === 0));
  assert.ok(views.every((v) => v.alive.every((p) => !('role' in p))));
  assert.equal(g.votes.length, 0);
  assert.equal(next.votes.length, 6);
});
test('AI wolf, seer, witch and hunter receive only permitted skill context', async () => {
  const g = rig();
  g.players[0].role = 'villager';
  g.players[3].role = 'seer';
  const calls = [];
  const provider = {
    decide: async (v) => {
      calls.push(v);
      return v.allowedActions.find((a) => a.action === 'skip') || v.allowedActions[0];
    },
  };
  await prepareLinxNight(g, provider);
  assert.equal(calls.filter((v) => v.task === 'night-wolf').length, 2);
  assert.equal(calls.filter((v) => v.task === 'night-seer').length, 1);
  assert.ok(calls.every((v) => !('attack' in v)));
  const next = await transact(g, '/api/night', {}, provider);
  assert.ok(calls.find((v) => v.task === 'night-witch').attack);
  assert.equal(next.phase, 'discussion');
  assert.equal(g.phase, 'night');
  assert.equal(next.perspective(3).privateActions.at(-1).action, 'skip');
  assert.deepEqual(next.perspective(4).privateActions, []);
});
test('AI hunter chooses a shot from its own perspective before win resolution', async () => {
  const g = new Game({ size: 9, role: 'villager', aiMode: 'linx' });
  ['villager', 'hunter', 'seer', 'witch', 'wolf', 'wolf', 'wolf', 'villager', 'villager'].forEach(
    (role, i) => (g.players[i].role = role),
  );
  g.phase = 'vote';
  const calls = [];
  const provider = {
    decide: async (v) => {
      calls.push(v);
      return v.task === 'hunter-shot'
        ? { action: 'shoot', target: 5 }
        : v.seat === 2
          ? { action: 'vote', target: 5 }
          : { action: 'vote', target: 2 };
    },
  };
  const next = await transact(g, '/api/vote', { target: 2 }, provider);
  assert.equal(next.player(2).shot, true);
  assert.equal(next.player(5).alive, false);
  assert.equal(next.phase, 'result');
  assert.equal(calls.filter((v) => v.task === 'hunter-shot').length, 1);
  assert.ok(g.player(2).alive);
});
test('disconnect or missing hello times out without committing output', async () => {
  const requestImpl = () => {
    const r = new EventEmitter();
    r.end = () => {};
    r.destroy = () => {};
    return r;
  };
  await assert.rejects(
    exchange(
      { url: 'wss://xrobo-io.qiniuapi.com/v1/ws/', token: 't', deviceId: 'd', clientId: 'c' },
      { seat: 2 },
      'test',
      { requestImpl, timeoutMs: 10 },
    ),
    /超时/,
  );
});
