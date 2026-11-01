import { computed, ref, type Ref } from 'vue';
import type { GameApiClient } from '../api/client';
import type { VoiceDraft } from '../../../../packages/protocol/src/types';

export type VoiceStage = VoiceDraft['stage'] | 'recording' | 'transcribing' | 'confirming';
export type VoiceDraftState = Omit<VoiceDraft, 'stage'> & { stage: VoiceStage };

export interface HumanVoiceOptions {
  client: Ref<GameApiClient | null>;
  roomId: Ref<string>;
  /** Changes whenever the room, phase, seat or turn changes. */
  contextKey: () => string;
  canRecord: () => boolean;
  onDraft?: (text: string) => void;
  onBusyStart?: () => void;
  onBusyEnd?: () => void;
  realtime?: boolean;
}

const emptyDraft = (): VoiceDraft => ({ recordingId: null, stage: 'idle', text: '', expiresAt: null, error: null });

/** Convert decoded browser audio to the PCM WAV accepted by the server. */
export function pcmToWav(samples: Float32Array, sampleRate = 16_000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true));
  return buffer;
}

export async function recordedBlobToWav(blob: Blob): Promise<ArrayBuffer> {
  const AudioContextCtor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const OfflineCtor = globalThis.OfflineAudioContext || (globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!AudioContextCtor || !OfflineCtor) throw new Error('当前浏览器不支持音频转换，请直接输入文字。');
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > 30.001) throw new Error('录音超过 30 秒，请缩短后重试。');
    const offline = new OfflineCtor(1, Math.max(1, Math.ceil(decoded.duration * 16_000)), 16_000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return pcmToWav((await offline.startRendering()).getChannelData(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function bytesToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

/** Browser microphone lifecycle. It only creates a draft; submitting text remains a normal game action. */
export function useHumanVoice(options: HumanVoiceOptions) {
  const draft = ref<VoiceDraftState>(emptyDraft());
  const remainingMs = ref(0);
  const busy = computed(() => ['recording', 'transcribing'].includes(draft.value.stage));
  let generation = 0;
  let recorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let abort: AbortController | null = null;
  let recordingKey = '';
  let realtimeSocket: WebSocket | null = null;
  let realtimeContext: AudioContext | null = null;
  let realtimeProcessor: ScriptProcessorNode | null = null;
  let realtimeSource: MediaStreamAudioSourceNode | null = null;
  let realtimeBytes = new Uint8Array(0);

  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; if (countdownTimer) clearInterval(countdownTimer); countdownTimer = null; };
  const closeStream = () => { mediaStream?.getTracks().forEach(track => track.stop()); mediaStream = null; };
  const stopRealtimeCapture = () => { realtimeProcessor?.disconnect(); realtimeSource?.disconnect(); realtimeProcessor = null; realtimeSource = null; void realtimeContext?.close().catch(() => undefined); realtimeContext = null; realtimeBytes = new Uint8Array(0); };
  const closeRealtime = () => { stopRealtimeCapture(); realtimeSocket?.close(); realtimeSocket = null; };
  const setError = (error: unknown) => {
    draft.value = { ...draft.value, stage: 'failed', error: error instanceof Error ? error.message : '录音或转写失败' };
  };

  const cancel = async (keepError = false) => {
    generation += 1;
    clearTimer();
    abort?.abort(); abort = null;
    const current = draft.value;
    recorder?.stop(); recorder = null;
    closeRealtime(); closeStream();
    if (current.recordingId && options.client.value && options.roomId.value) {
      await options.client.value.recordingCancel(options.roomId.value, current.recordingId).catch(() => undefined);
    }
    draft.value = keepError ? { ...draft.value, stage: 'failed' } : { ...emptyDraft(), stage: 'cancelled' };
    options.onBusyEnd?.();
  };

  const finishRecording = (run: number, chunks: Blob[], key: string) => {
    clearTimer(); closeStream();
    if (run !== generation || key !== options.contextKey()) return;
    const client = options.client.value;
    const roomId = options.roomId.value;
    if (!client || !roomId) return setError(new Error('房间连接已断开'));
    draft.value = { ...draft.value, stage: 'transcribing', error: null };
    void (async () => {
      try {
        const wav = await recordedBlobToWav(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
        if (run !== generation || key !== options.contextKey()) return;
        abort = new AbortController();
        const result = await client.transcribe(roomId, bytesToBase64(wav), draft.value.recordingId || undefined);
        if (run !== generation || key !== options.contextKey()) return;
        draft.value = { ...draft.value, stage: 'confirming', text: result.text, error: null };
        options.onDraft?.(result.text);
      } catch (error) {
        if (run === generation) setError(error);
      } finally { abort = null; options.onBusyEnd?.(); }
    })();
  };

  const start = async () => {
    await cancel();
    if (!options.canRecord()) throw new Error('当前不是你的发言窗口');
    const client = options.client.value;
    const roomId = options.roomId.value;
    if (!client || !roomId) throw new Error('请先连接房间');
    if (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error('浏览器不支持录音，请直接输入文字。');
    options.onBusyStart?.();
    const run = generation;
    const key = options.contextKey();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (run !== generation || key !== options.contextKey()) return closeStream();
      const recording = await client.recordingStart(roomId);
      if (run !== generation || key !== options.contextKey()) { closeStream(); return; }
      recordingKey = key;
      const deadline = Number(recording.deadline);
      draft.value = { recordingId: recording.recordingId, stage: 'recording', text: '', expiresAt: new Date(deadline).toISOString(), error: null };
      remainingMs.value = Math.max(0, deadline - Date.now());
      countdownTimer = setInterval(() => { remainingMs.value = Math.max(0, deadline - Date.now()); }, 250);
      if (options.realtime) {
        const context = new AudioContext({ sampleRate: 16_000 }); realtimeContext = context;
        const socket = new WebSocket(client.voiceRealtimeUrl(roomId, recording.recordingId)); realtimeSocket = socket; socket.binaryType = 'arraybuffer';
        socket.onmessage = event => { if (run !== generation || key !== options.contextKey()) return; if (typeof event.data !== 'string') return; let message: { type?: string; text?: string; message?: string }; try { message = JSON.parse(event.data); } catch { return; } if (message.type === 'accepted' && message.text) { options.onDraft?.(message.text); draft.value = { ...draft.value, stage: 'confirming', text: message.text }; markSubmitted(); } else if (message.type === 'error') setError(new Error(message.message || '实时语音失败')); };
        socket.onerror = () => { if (run === generation) setError(new Error('实时语音连接失败')); };
        await new Promise<void>((resolve, reject) => { socket.onopen = () => { socket.send(JSON.stringify({ type: 'start' })); resolve(); }; socket.addEventListener('error', () => reject(new Error('实时语音连接失败')), { once: true }); });
        if (run !== generation || key !== options.contextKey()) return;
        realtimeSource = context.createMediaStreamSource(mediaStream); realtimeProcessor = context.createScriptProcessor(4096, 1, 1);
        const send = (data: Uint8Array) => { if (socket.readyState === WebSocket.OPEN) socket.send(data); };
        realtimeProcessor.onaudioprocess = event => { if (run !== generation || socket.readyState !== WebSocket.OPEN) return; const input = event.inputBuffer.getChannelData(0); const ratio = event.inputBuffer.sampleRate / 16_000; const samples = new Int16Array(Math.floor(input.length / ratio)); for (let i = 0; i < samples.length; i += 1) { const value = input[Math.min(input.length - 1, Math.floor(i * ratio))]; samples[i] = Math.max(-1, Math.min(1, value)) * 32767; } const next = new Uint8Array(realtimeBytes.length + samples.byteLength); next.set(realtimeBytes); next.set(new Uint8Array(samples.buffer), realtimeBytes.length); realtimeBytes = next; while (realtimeBytes.length >= 640) { send(realtimeBytes.slice(0, 640)); realtimeBytes = realtimeBytes.slice(640); } };
        realtimeSource.connect(realtimeProcessor); realtimeProcessor.connect(context.destination);
        timer = setTimeout(() => stop(), Math.max(1, remainingMs.value - 200));
        return;
      }
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(mediaStream);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => { if (run === generation) finishRecording(run, chunks, recordingKey); };
      recorder.start();
      // Leave a small transport margin so encoded audio duration cannot exceed the server deadline.
      timer = setTimeout(() => recorder?.stop(), Math.max(1, remainingMs.value - 200));
    } catch (error) {
      closeStream(); setError(error); throw error;
    }
  };

  const stop = () => { clearTimer(); if (realtimeSocket) { if (realtimeSocket.readyState === WebSocket.OPEN) realtimeSocket.send(JSON.stringify({ type: 'stop' })); stopRealtimeCapture(); closeStream(); options.onBusyEnd?.(); setTimeout(() => { if (realtimeSocket) closeRealtime(); }, 10000); } else if (recorder?.state === 'recording') recorder.stop(); else closeStream(); };
  const reset = () => { void cancel(); draft.value = emptyDraft(); remainingMs.value = 0; };
  const markSubmitted = () => { clearTimer(); closeRealtime(); closeStream(); abort?.abort(); abort = null; draft.value = emptyDraft(); remainingMs.value = 0; };

  return { draft, remainingMs, busy, start, stop, cancel, reset, markSubmitted };
}
