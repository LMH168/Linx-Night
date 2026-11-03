import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { secureSocketUrl } from './ota.mjs';
import { parseWav, frames } from './wav.mjs';

export const pcm = { format: 'pcm', sample_rate: 16000, channels: 1, bit_depth: 16, endianness: 'little', frame_duration: 20, frame_size: 320, sample_format: 'signed_int16', play_buffer_duration: 1000 };
export class LinxClient {
  constructor(identity, { socketFactory = (url, options) => new WebSocket(url, options), record = () => {}, onAudio = () => {}, onMessage = () => {}, mcp, helloTimeoutMs = 10000, actionTimeoutMs = 60000 } = {}) {
    this.identity = identity; this.socketFactory = socketFactory; this.record = record; this.onAudio = onAudio; this.onMessage = onMessage;
    this.helloTimeoutMs = helloTimeoutMs; this.actionTimeoutMs = actionTimeoutMs; this.mcp = mcp;
    this.state = 'closed'; this.sessionId = undefined; this.pending = null; this.stream = null;
  }
  event(type, data = {}) { this.record({ at: new Date().toISOString(), runId: this.runId, type, ...data }); }
  status() { return { state: this.state, sessionPresent: Boolean(this.sessionId), runId: this.runId, audio: this.audio, busy: Boolean(this.pending || this.stream) }; }
  async connect(config) {
    if (this.state !== 'closed') throw new Error('请先关闭当前连接');
    const url = secureSocketUrl(config.url);
    if (typeof config.token !== 'string' || !config.token.trim()) throw new Error('缺少连接 Token');
    this.runId = randomUUID(); this.sessionId = undefined; this.audio = undefined; this.suppressOutput = false; this.state = 'connecting'; this.event('connect_start');
    await new Promise((resolve, reject) => {
      let greeted = false;
      let finished = false;
      let toolsRegistered = !this.mcp;
      const requests = new Map();
      const ready = () => {
        if(!greeted || !toolsRegistered || finished)return;
        clearTimeout(timer);this.state='ready';resolve();
      };
      const fail = code => {
        if (finished || this.runId !== runId) return;
        finished = true;
        clearTimeout(timer);
        this.event('connection_failure', { code });
        this.state = 'closed'; this.pending?.reject(new Error(code)); this.stream?.reject(new Error(code)); this.socket?.terminate();
        reject(new Error(code));
      };
      const runId = this.runId;
      const timer = setTimeout(() => fail('HELLO_TIMEOUT'), this.helloTimeoutMs);
      try { this.socket = this.socketFactory(url, { headers: { Authorization: `Bearer ${config.token}`, 'Protocol-Version': '1', 'Device-Id': this.identity.deviceId, 'Client-Id': this.identity.clientId, ...(config.agentId ? {'X-Agent-ID':config.agentId} : {}) }, followRedirects: false, maxPayload: 1024 * 1024, handshakeTimeout: this.helloTimeoutMs }); }
      catch { fail('CONNECT_FAILED'); return; }
      const socket = this.socket;
      socket.on('open', () => { socket.send(JSON.stringify({ type: 'hello', version: 1, ...(this.mcp ? {features:{mcp:true}} : {}), transport: 'websocket', audio_params: pcm }), error => { if (error) fail('HELLO_SEND_FAILED'); }); });
      socket.on('error', () => fail('SOCKET_ERROR'));
      socket.on('close', () => {
        if (this.runId !== runId) return;
        finished = true;
        clearTimeout(timer); this.state = 'closed'; this.event('closed');
        this.pending?.reject(new Error('CONNECTION_CLOSED')); this.stream?.reject(new Error('CONNECTION_CLOSED'));
        reject(new Error(greeted ? 'CONNECTION_CLOSED_BEFORE_READY' : 'CONNECTION_CLOSED_BEFORE_HELLO'));
      });
      socket.on('message', (raw, binary) => {
        if (finished || this.runId !== runId) return;
        if (binary) { if(this.suppressOutput)return;this.event('audio_received', { bytes: raw.length }); this.onAudio(Buffer.from(raw), { attemptId: this.pending?.attemptId ?? this.stream?.attemptId }); return; }
        let message; try { message = JSON.parse(raw.toString()); } catch { fail('INVALID_JSON'); return; }
        if (!message || typeof message !== 'object') { fail('INVALID_MESSAGE'); return; }
        if(message.type==='mcp' && this.mcp) {
          const request=message.payload;
          if(!request || request.jsonrpc!=='2.0' || !['string','number'].includes(typeof request.id) || typeof request.method!=='string')return;
          if(!requests.has(request.id)) {
            if(requests.size>=1024){fail('MCP_REQUEST_LIMIT');return;}
            const context={sessionId:this.sessionId,deviceId:this.identity.deviceId,agentId:config.agentId};
            requests.set(request.id,Promise.resolve().then(()=>this.mcp(request,context)).catch(()=>({error:{code:-32603,message:'Game tool unavailable'}})));
          }
          void requests.get(request.id).then(response=>{
            if(finished || this.runId!==runId || socket.readyState!==WebSocket.OPEN)return;
            const payload={jsonrpc:'2.0',id:request.id,...(response.error ? {error:response.error} : {result:response.result})};
            socket.send(JSON.stringify({type:'mcp',...(this.sessionId ? {session_id:this.sessionId} : {}),payload}),error=>{
              if(error){fail('MCP_SEND_FAILED');return;}
              if(request.method==='tools/list' && Array.isArray(response.result?.tools) && !response.error){toolsRegistered=true;ready();}
            });
          }).catch(()=>fail('MCP_RESPONSE_FAILED'));
          return;
        }
        if (!greeted) {
          if (message.type !== 'hello' || message.transport !== 'websocket') { fail('INVALID_HELLO'); return; }
          const a = message.audio_params;
          if (a?.format !== 'pcm' || a.sample_rate !== 16000 || a.channels !== 1 || (a.bit_depth !== undefined && a.bit_depth !== 16) || (a.endianness !== undefined && a.endianness !== 'little') || (a.frame_duration !== undefined && a.frame_duration !== 20) || (a.frame_size !== undefined && a.frame_size !== 320) || (a.sample_format !== undefined && a.sample_format !== 'signed_int16')) { fail('PCM_NOT_CONFIRMED'); return; }
          if (message.session_id !== undefined && (typeof message.session_id !== 'string' || !message.session_id.trim())) { fail('INVALID_SESSION'); return; }
          this.sessionId = message.session_id; this.audio = { format: 'pcm', sampleRate: 16000, channels: 1 };
          greeted = true; this.event('hello', { sessionPresent: Boolean(this.sessionId), ...this.audio }); ready(); return;
        }
        if (message.type === 'error') { fail('PLATFORM_ERROR'); return; }
        // A manual PCM relay is a pre-listen phase. Keep any early/late TTS
        // private until the explicit text cue starts the public turn.
        if(message.type==='stt' && !this.pending?.inputOnly && (this.pending?.sent || (this.stream && this.stream.listenMode !== 'manual')))this.suppressOutput=false;
        const suppressedTts = message.type === 'tts' && this.suppressOutput;
        if (!suppressedTts) this.onMessage(message);
        if (message.type === 'stt' && this.pending?.inputOnly && this.pending.sent) {
          if (typeof message.text !== 'string' || !message.text.trim()) { this.pending.reject(new Error('PUBLIC_AUDIO_EMPTY_TRANSCRIPT')); return; }
          this.pending.transcript = message.text.trim();
          this.cancelTurn();
        }
        if (message.type === 'stt') this.event('stt', { textLength: typeof message.text === 'string' ? message.text.length : 0, attemptId: this.pending?.attemptId ?? this.stream?.attemptId });
        if (message.type === 'tts' && ['start', 'stop', 'sentence_start'].includes(message.state)) {
          if (message.state === 'start' && this.pending?.sent) this.pending.ttsStarted = true;
          this.event(`tts_${message.state}`, { attemptId: this.pending?.attemptId ?? this.stream?.attemptId });
          if (message.state === 'stop') {
            if (this.pending?.inputOnly) return;
            const active = this.pending?.sent ? this.pending : this.stream;
            if (active) {
              // Linx may answer or abort an answer before manual input ends.
              // That output event must not terminate the incoming PCM relay.
              if (active === this.stream && active.listening && active.listenMode === 'manual') return;
              if (message.is_aborted && active === this.pending && !active.ttsStarted && !active.cancelled) return;
              if (message.is_aborted && !active.cancelled) active.reject(new Error('TURN_ABORTED'));
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
    if (mode === 'manual') this.suppressOutput = true;
    let timer;
    const completion = new Promise((resolve, reject) => { this.stream = { resolve, reject, done: null, attemptId, mode: 'stream', listenMode: mode, listening: true }; timer = setTimeout(() => reject(new Error('ACTION_TIMEOUT')), this.actionTimeoutMs); });
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
      this.event('input_start', { attemptId, mode });
      return { attemptId, send: frame => send(frame), done: completion };
    } catch (error) {
      this.stream = null; clearTimeout(timer); abort.abort(); this.close(); throw error;
    }
  }

  async stopRealtime({ waitForTts = true } = {}) {
    const stream = this.stream;
    if (!stream) throw new Error('没有实时监听');
    try {
      // Drop provider output generated while the stream was being stopped.
      // The next explicit detect input clears this after its STT event.
      this.suppressOutput = true;
      stream.listening = false;
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
  async send(wav, { timeoutMs = this.actionTimeoutMs, voiceId, inputOnly = false } = {}) {
    if (voiceId !== undefined && (typeof voiceId !== 'string' || !voiceId.trim() || voiceId.length > 128)) throw new Error('VOICE_ID_INVALID');
    const voice = voiceId ? { agent_params: { voice: { id: voiceId } } } : {};
    const text = typeof wav === 'string' ? wav.trim() : null;
    if (text !== null && (!text || text.length > 2000)) throw new Error('INVALID_TURN_CUE');
    const audio = text === null ? parseWav(wav) : null;
    if (this.state !== 'ready' || this.pending || this.stream) throw new Error('连接未准备或已有行动等待结束');
    const attemptId = randomUUID(), abort = new AbortController();
    if (inputOnly) this.suppressOutput = true;
    let timer;
    const completion = new Promise((resolve, reject) => { this.pending = { resolve, reject, sent: false, attemptId, inputOnly }; timer = setTimeout(() => reject(new Error('ACTION_TIMEOUT')), timeoutMs); });
    // Attach a handler immediately: a disconnect may occur while audio is still being sent.
    completion.catch(() => abort.abort());
    const control = (state) => JSON.stringify({ ...(this.sessionId ? { session_id: this.sessionId } : {}), type: 'listen', state, ...voice, ...(state === 'start' ? { mode: 'manual' } : {}) });
    const send = data => new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 640 * 50) { reject(new Error('SEND_BACKPRESSURE_OR_CLOSED')); return; }
      const cancelled = () => reject(new Error('SEND_CANCELLED'));
      if (abort.signal.aborted) { cancelled(); return; }
      abort.signal.addEventListener('abort', cancelled, { once: true });
      this.socket.send(data, error => { abort.signal.removeEventListener('abort', cancelled); error ? reject(new Error('SEND_FAILED')) : resolve(); });
    });
    try {
      const startedAt = Date.now();
      this.event('input_start', { attemptId, samples: audio ? audio.length / 2 : 0 });
      if (text !== null) {
        this.pending.sent = true;
        await send(JSON.stringify({ ...(this.sessionId ? { session_id: this.sessionId } : {}), type: 'listen', state: 'detect', text, ...voice }));
      } else {
        await send(control('start'));
        for (const frame of frames(audio)) { abort.signal.throwIfAborted(); await send(frame); await delay(20, undefined, { signal: abort.signal }); }
        this.pending.sent = true; await send(control('stop'));
      }
      this.event('input_stop', { attemptId });
      await completion; this.event('turn_finished', { attemptId, gameAccepted: 'unverified', durationMs: Date.now() - startedAt });
      return { attemptId, gameAccepted: 'unverified', ...(inputOnly ? { text: this.pending.transcript } : {}) };
    } catch (error) {
      const code = abort.signal.aborted ? 'ACTION_INTERRUPTED_OR_TIMEOUT' : (/^[A-Z_]+$/.test(error.message) ? error.message : 'SEND_FAILED');
      this.event('input_failure', { attemptId, code }); this.close(); throw new Error(code);
    } finally { clearTimeout(timer); abort.abort(); this.pending = null; }
  }
  cancelTurn() {
    const pending=this.pending;
    if(!pending)return;
    pending.cancelled=true;this.suppressOutput=true;
    // Abort has no documented acknowledgement. Finish after the frame is
    // written; discard old output until STT confirms the next input.
    try {this.socket.send(JSON.stringify({ ...(this.sessionId ? {session_id:this.sessionId} : {}),type:'abort',reason:'wake_word_detected' }),error=>{if(error)this.close();else pending.resolve();});}
    catch {this.close();}
  }
  close() {
    this.pending?.reject(new Error('CLIENT_CLOSED'));
    this.stream?.reject(new Error('CLIENT_CLOSED'));
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
    this.state = 'closed'; this.sessionId = undefined;
  }
}
