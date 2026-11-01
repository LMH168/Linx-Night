import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { secureSocketUrl } from './ota.mjs';
import { parseWav, frames } from './wav.mjs';

export const pcm = { format: 'pcm', sample_rate: 16000, channels: 1, bit_depth: 16, endianness: 'little', frame_duration: 20, frame_size: 320, sample_format: 'signed_int16', play_buffer_duration: 1000 };
export class LinxClient {
  constructor(identity, { socketFactory = (url, options) => new WebSocket(url, options), record = () => {}, onAudio = () => {}, onMessage = () => {}, helloTimeoutMs = 10000, actionTimeoutMs = 60000 } = {}) {
    this.identity = identity; this.socketFactory = socketFactory; this.record = record; this.onAudio = onAudio; this.onMessage = onMessage;
    this.helloTimeoutMs = helloTimeoutMs; this.actionTimeoutMs = actionTimeoutMs;
    this.state = 'closed'; this.sessionId = undefined; this.pending = null; this.stream = null;
  }
  event(type, data = {}) { this.record({ at: new Date().toISOString(), runId: this.runId, type, ...data }); }
  status() { return { state: this.state, sessionPresent: Boolean(this.sessionId), runId: this.runId, audio: this.audio, busy: Boolean(this.pending || this.stream) }; }
  async connect(config) {
    if (this.state !== 'closed') throw new Error('请先关闭当前连接');
    const url = secureSocketUrl(config.url);
    if (typeof config.token !== 'string' || !config.token.trim()) throw new Error('缺少连接 Token');
    this.runId = randomUUID(); this.sessionId = undefined; this.audio = undefined; this.state = 'connecting'; this.event('connect_start');
    await new Promise((resolve, reject) => {
      let greeted = false;
      let finished = false;
      const fail = code => {
        if (finished || this.runId !== runId) return;
        finished = true;
        clearTimeout(timer);
        this.event('connection_failure', { code });
        this.state = 'closed'; this.pending?.reject(new Error(code)); this.stream?.reject(new Error(code)); this.socket?.terminate();
        if (!greeted) reject(new Error(code));
      };
      const runId = this.runId;
      const timer = setTimeout(() => fail('HELLO_TIMEOUT'), this.helloTimeoutMs);
      try { this.socket = this.socketFactory(url, { headers: { Authorization: `Bearer ${config.token}`, 'Protocol-Version': '1', 'Device-Id': this.identity.deviceId, 'Client-Id': this.identity.clientId }, followRedirects: false, maxPayload: 1024 * 1024, handshakeTimeout: this.helloTimeoutMs }); }
      catch { fail('CONNECT_FAILED'); return; }
      const socket = this.socket;
      socket.on('open', () => { socket.send(JSON.stringify({ type: 'hello', version: 1, transport: 'websocket', audio_params: pcm }), error => { if (error) fail('HELLO_SEND_FAILED'); }); });
      socket.on('error', () => fail('SOCKET_ERROR'));
      socket.on('close', () => {
        if (this.runId !== runId) return;
        finished = true;
        clearTimeout(timer); this.state = 'closed'; this.event('closed');
        this.pending?.reject(new Error('CONNECTION_CLOSED')); this.stream?.reject(new Error('CONNECTION_CLOSED'));
        if (!greeted) reject(new Error('CONNECTION_CLOSED_BEFORE_HELLO'));
      });
      socket.on('message', (raw, binary) => {
        if (finished || this.runId !== runId) return;
        if (binary) { this.event('audio_received', { bytes: raw.length }); this.onAudio(Buffer.from(raw), { attemptId: this.pending?.attemptId ?? this.stream?.attemptId }); return; }
        let message; try { message = JSON.parse(raw.toString()); } catch { fail('INVALID_JSON'); return; }
        if (!message || typeof message !== 'object') { fail('INVALID_MESSAGE'); return; }
        if (!greeted) {
          if (message.type !== 'hello' || message.transport !== 'websocket') { fail('INVALID_HELLO'); return; }
          const a = message.audio_params;
          if (a?.format !== 'pcm' || a.sample_rate !== 16000 || a.channels !== 1 || (a.bit_depth !== undefined && a.bit_depth !== 16) || (a.endianness !== undefined && a.endianness !== 'little') || (a.frame_duration !== undefined && a.frame_duration !== 20) || (a.frame_size !== undefined && a.frame_size !== 320) || (a.sample_format !== undefined && a.sample_format !== 'signed_int16')) { fail('PCM_NOT_CONFIRMED'); return; }
          if (message.session_id !== undefined && (typeof message.session_id !== 'string' || !message.session_id.trim())) { fail('INVALID_SESSION'); return; }
          this.sessionId = message.session_id; this.audio = { format: 'pcm', sampleRate: 16000, channels: 1 };
          greeted = true; clearTimeout(timer); this.state = 'ready'; this.event('hello', { sessionPresent: Boolean(this.sessionId), ...this.audio }); resolve(); return;
        }
        if (message.type === 'error') { fail('PLATFORM_ERROR'); return; }
        this.onMessage(message);
        if (message.type === 'stt') this.event('stt', { textLength: typeof message.text === 'string' ? message.text.length : 0, attemptId: this.pending?.attemptId ?? this.stream?.attemptId });
        if (message.type === 'tts' && ['start', 'stop', 'sentence_start'].includes(message.state)) {
          this.event(`tts_${message.state}`, { attemptId: this.pending?.attemptId ?? this.stream?.attemptId });
          if (message.state === 'stop') {
            const active = this.pending?.sent ? this.pending : this.stream;
            if (active) {
              if (message.is_aborted) active.reject(new Error('TURN_ABORTED'));
              else active.resolve();
            }
          }
        }
      });
    });
  }

  async startRealtime({ mode = 'realtime' } = {}) {
    if (this.state !== 'ready' || this.pending || this.stream) throw new Error('连接未准备或已有行动等待结束');
    const attemptId = randomUUID(), abort = new AbortController();
    let timer;
    const completion = new Promise((resolve, reject) => { this.stream = { resolve, reject, done: null, attemptId, mode: 'stream' }; timer = setTimeout(() => reject(new Error('ACTION_TIMEOUT')), this.actionTimeoutMs); });
    this.stream.done = completion;
    completion.catch(() => abort.abort());
    const send = data => new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 640 * 50) { reject(new Error('SEND_BACKPRESSURE_OR_CLOSED')); return; }
      const cancelled = () => reject(new Error('SEND_CANCELLED'));
      if (abort.signal.aborted) { cancelled(); return; }
      abort.signal.addEventListener('abort', cancelled, { once: true });
      this.socket.send(data, error => { abort.signal.removeEventListener('abort', cancelled); error ? reject(new Error('SEND_FAILED')) : resolve(); });
    });
    this.stream.send = send; this.stream.timer = timer; this.stream.abort = abort;
    try {
      await send(JSON.stringify({ ...(this.sessionId ? { session_id: this.sessionId } : {}), type: 'listen', state: 'start', mode }));
      this.event('input_start', { attemptId, mode: 'realtime' });
      return { attemptId, send: frame => send(frame), done: completion };
    } catch (error) {
      this.stream = null; clearTimeout(timer); abort.abort(); this.close(); throw error;
    }
  }

  async stopRealtime({ waitForTts = true } = {}) {
    const stream = this.stream;
    if (!stream) throw new Error('没有实时监听');
    try {
      await stream.send(JSON.stringify({ ...(this.sessionId ? { session_id: this.sessionId } : {}), type: 'listen', state: 'stop' }));
      this.event('input_stop', { attemptId: stream.attemptId, mode: 'realtime' });
      if (waitForTts) await stream.done;
      return { attemptId: stream.attemptId, gameAccepted: 'unverified' };
    } catch (error) {
      this.close(); throw error;
    } finally {
      clearTimeout(stream.timer); stream.abort.abort(); if (this.stream === stream) this.stream = null;
    }
  }
  async send(wav) {
    const audio = parseWav(wav);
    if (this.state !== 'ready' || this.pending || this.stream) throw new Error('连接未准备或已有行动等待结束');
    const attemptId = randomUUID(), abort = new AbortController();
    let timer;
    const completion = new Promise((resolve, reject) => { this.pending = { resolve, reject, sent: false, attemptId }; timer = setTimeout(() => reject(new Error('ACTION_TIMEOUT')), this.actionTimeoutMs); });
    // Attach a handler immediately: a disconnect may occur while audio is still being sent.
    completion.catch(() => abort.abort());
    const control = (state) => JSON.stringify({ ...(this.sessionId ? { session_id: this.sessionId } : {}), type: 'listen', state, ...(state === 'start' ? { mode: 'manual' } : {}) });
    const send = data => new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 640 * 50) { reject(new Error('SEND_BACKPRESSURE_OR_CLOSED')); return; }
      const cancelled = () => reject(new Error('SEND_CANCELLED'));
      if (abort.signal.aborted) { cancelled(); return; }
      abort.signal.addEventListener('abort', cancelled, { once: true });
      this.socket.send(data, error => { abort.signal.removeEventListener('abort', cancelled); error ? reject(new Error('SEND_FAILED')) : resolve(); });
    });
    try {
      const startedAt = Date.now();
      this.event('input_start', { attemptId, samples: audio.length / 2 }); await send(control('start'));
      for (const frame of frames(audio)) { abort.signal.throwIfAborted(); await send(frame); await delay(20, undefined, { signal: abort.signal }); }
      this.pending.sent = true; await send(control('stop')); this.event('input_stop', { attemptId });
      await completion; this.event('turn_finished', { attemptId, gameAccepted: 'unverified', durationMs: Date.now() - startedAt });
      return { attemptId, gameAccepted: 'unverified' };
    } catch (error) {
      const code = abort.signal.aborted ? 'ACTION_INTERRUPTED_OR_TIMEOUT' : (/^[A-Z_]+$/.test(error.message) ? error.message : 'SEND_FAILED');
      this.event('input_failure', { attemptId, code }); this.close(); throw new Error(code);
    } finally { clearTimeout(timer); abort.abort(); this.pending = null; }
  }
  close() {
    this.pending?.reject(new Error('CLIENT_CLOSED'));
    this.stream?.reject(new Error('CLIENT_CLOSED'));
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
    this.state = 'closed'; this.sessionId = undefined;
  }
}
