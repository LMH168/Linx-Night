import { computed, ref, type Ref } from 'vue';
import type { GameApiClient, HostStateResponse } from '../api/client';
import type { HostTask } from '../../../../packages/protocol/src/types';

export type PlaybackTask = HostTask;

export interface PcmPlaybackOptions {
  signal?: AbortSignal;
  ids: { gameId?: string; taskId: string; attemptId: string };
  valid?: () => boolean;
  onStart?: () => Promise<void> | void;
  onStatus?: (status: string) => void;
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('播放已取消', 'AbortError');
}

/** Validate and play the server's bounded NDJSON PCM stream. */
export async function playPcmStream(response: Response, context: AudioContext, options: PcmPlaybackOptions): Promise<{ samples: number; firstPlayMs?: number; playbackMs?: number }> {
  if (!response.body) throw new Error('音频流为空');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const sources = new Set<AudioBufferSourceNode>();
  let line = '';
  let chunks = 0;
  let samples = 0;
  let ended = false;
  let gotStart = false;
  let started = false;
  let nextTime = 0;
  let lastEnd = Promise.resolve();
  let firstChunkAt = 0;
  let firstPlayMs: number | undefined;
  let playStartedAt: number | undefined;
  const queue: Uint8Array[] = [];
  let queuedSamples = 0;
  const valid = options.valid || (() => true);
  const stopSources = () => {
    for (const source of sources) { try { source.stop(); } catch { /* already ended */ } }
    sources.clear(); void reader.cancel().catch(() => undefined);
  };
  const onAbort = () => stopSources();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const schedule = async () => {
    if (!queue.length) return;
    await context.resume(); abortIfNeeded(options.signal); if (!valid()) throw new Error('播放已取消');
    if (!started) {
      await options.onStart?.(); abortIfNeeded(options.signal); if (!valid()) throw new Error('播放已取消');
      firstPlayMs = performance.now() - firstChunkAt; playStartedAt = performance.now(); started = true; options.onStatus?.('播放中');
    }
    for (const pcm of queue.splice(0)) {
      const audio = context.createBuffer(1, pcm.length / 2, 16_000);
      const channel = audio.getChannelData(0); const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      for (let i = 0; i < channel.length; i += 1) channel[i] = view.getInt16(i * 2, true) / 32768;
      const source = context.createBufferSource(); source.buffer = audio; source.connect(context.destination); sources.add(source);
      lastEnd = new Promise(resolve => { source.onended = () => { sources.delete(source); resolve(); }; });
      nextTime = Math.max(nextTime, context.currentTime + 0.015); source.start(nextTime); nextTime += audio.duration;
    }
    queuedSamples = 0;
  };
  try {
    while (true) {
      abortIfNeeded(options.signal); if (!valid()) throw new Error('播放已取消');
      const part = await reader.read(); if (part.done) break; line += decoder.decode(part.value, { stream: true });
      if (line.length > 3_000_000) throw new Error('音频消息过长');
      let index = -1;
      while ((index = line.indexOf('\n')) >= 0) {
        const raw = line.slice(0, index); line = line.slice(index + 1); if (!raw.trim()) continue;
        let message: Record<string, unknown>;
        try { message = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error('音频消息格式错误'); }
        for (const key of ['gameId', 'taskId', 'attemptId']) if (message[key] !== options.ids[key as keyof typeof options.ids]) throw new Error('音频任务不匹配');
        if (message.type === 'error') throw new Error(String(message.code || '音频中断'));
        if (message.type === 'start') {
          if (gotStart || started || chunks || samples || message.sampleRate !== 16_000 || message.channels !== 1 || message.format !== 's16le') throw new Error('音频格式错误');
          gotStart = true; continue;
        }
        if (message.type === 'audio') {
          if (!gotStart) throw new Error('缺少音频起点');
          if (typeof message.seq !== 'number' || message.seq !== chunks || typeof message.data !== 'string') throw new Error('音频块顺序错误');
          let pcm: Uint8Array; try { const binary = atob(message.data); pcm = Uint8Array.from(binary, char => char.charCodeAt(0)); } catch { throw new Error('音频块编码错误'); }
          if (!pcm.length || pcm.length % 2) throw new Error('音频长度错误'); chunks += 1; samples += pcm.length / 2;
          if (samples > 960_000) throw new Error('单条音频超过 60 秒'); firstChunkAt ||= performance.now(); queue.push(pcm); queuedSamples += pcm.length / 2;
          if (queuedSamples >= 4_000) await schedule();
        } else if (message.type === 'end') {
          if (!chunks || message.chunks !== chunks || message.samples !== samples) throw new Error('音频不完整'); ended = true; await schedule();
        } else throw new Error('未知音频消息');
      }
    }
    if (!gotStart || !ended || line.trim()) throw new Error('音频流截断'); await schedule(); await lastEnd; abortIfNeeded(options.signal); if (!valid()) throw new Error('播放已取消');
    return { samples, firstPlayMs, playbackMs: playStartedAt === undefined ? undefined : performance.now() - playStartedAt };
  } finally { stopSources(); options.signal?.removeEventListener('abort', onAbort); reader.releaseLock(); }
}

export interface HostPlaybackOptions {
  client: Ref<GameApiClient | null>;
  roomId: Ref<string>;
  isHost: () => boolean;
  suspended?: () => boolean;
}

/** Public host/player voice queue. The server remains the source of task text and ordering. */
export function useHostPlayback(options: HostPlaybackOptions) {
  const enabled = ref(false);
  const status = ref('开始前请启用公共声音。');
  const error = ref<string | null>(null);
  const task = ref<PlaybackTask | null>(null);
  const busy = ref(false);
  const canManage = computed(() => Boolean(options.isHost() && task.value));
  let interval: ReturnType<typeof setInterval> | null = null;
  let abort: AbortController | null = null;
  let audioContext: AudioContext | null = null;
  let epoch = 0;
  const completed = new Set<string>();
  const pendingAcks = new Map<string, { firstPlayMs?: number; playbackMs?: number }>();

  const stop = () => { enabled.value = false; epoch += 1; abort?.abort(); abort = null; busy.value = false; void audioContext?.close().catch(() => undefined); audioContext = null; status.value = '公共声音已停止；重新启用后继续当前任务。'; };
  const suspend = () => { if (!enabled.value) return; epoch += 1; abort?.abort(); abort = null; busy.value = false; status.value = '录音或转写进行中，公共声音暂时暂停。'; };
  const resume = () => { if (enabled.value) void poll(); };
  const poll = async () => {
    const client = options.client.value; const roomId = options.roomId.value;
    if (!enabled.value || busy.value || !client || !roomId || options.suspended?.()) return;
    const run = epoch; busy.value = true; let playbackFinished = false;
    try {
      const state: HostStateResponse = await client.hostState(roomId); if (!enabled.value || run !== epoch) return;
      task.value = state.task as PlaybackTask | null;
      if (!task.value) { status.value = '等待下一条公开播报。'; return; }
      const current = task.value; status.value = current.status === 'generating' ? '主持正在生成音频……' : `${current.seatId || '主持'}：${current.text}`;
      if (current.status === 'failed') { error.value = current.errorCode || '公共音频生成失败'; status.value = `音频失败：${error.value}`; return; }
      if (!['ready', 'generating'].includes(current.status) || current.status !== 'ready' || !current.attemptId) return;
      const attempt = current.attemptId; const key = `${current.id}:${attempt}`;
      const previousMetrics = pendingAcks.get(key);
      if (previousMetrics && options.isHost()) {
        try { await client.hostPlayed(roomId, current.id, attempt, previousMetrics); pendingAcks.delete(key); completed.add(key); status.value = '播报完成，等待下一条。'; }
        catch (cause) { error.value = cause instanceof Error ? cause.message : '播放完成确认失败'; status.value = `播放已完成，等待确认：${error.value}`; }
        return;
      }
      if (completed.has(key)) return;
      const controller = new AbortController(); abort = controller;
      const contextCtor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!contextCtor) throw new Error('浏览器不支持公共声音');
      const context = audioContext || (audioContext = new contextCtor());
      try {
        const response = await client.hostStream(roomId, current.id, controller.signal);
        const result = await playPcmStream(response, context, { signal: controller.signal, ids: { gameId: current.gameId, taskId: current.id, attemptId: attempt }, valid: () => enabled.value && run === epoch && options.roomId.value === roomId, onStart: async () => { if (options.isHost()) await client.hostStarted(roomId, current.id, attempt, controller.signal); }, onStatus: value => { status.value = `${current.seatId || '主持'}：${value}`; } });
        if (!enabled.value || run !== epoch || options.roomId.value !== roomId) return;
        playbackFinished = true;
        if (options.isHost()) {
          try { await client.hostPlayed(roomId, current.id, attempt, result); }
          catch (cause) { pendingAcks.set(key, result); error.value = cause instanceof Error ? cause.message : '播放完成确认失败'; status.value = `播放已完成，等待确认：${error.value}`; return; }
        }
        completed.add(key); if (completed.size > 80) completed.delete(completed.values().next().value as string);
        error.value = null; status.value = '播报完成，等待下一条。';
      } finally { /* keep the user activated context for the next public task */ }
    } catch (cause) {
      if (run === epoch && enabled.value && !String((cause as Error)?.name).includes('Abort')) {
        error.value = cause instanceof Error ? cause.message : '公共播放失败'; status.value = `播放失败：${error.value}`;
        if (!playbackFinished && task.value && options.isHost() && task.value.attemptId) await client.hostInterrupted(roomId, task.value.id, task.value.attemptId).catch(() => undefined);
      }
    } finally { if (run === epoch) { busy.value = false; abort = null; } }
  };
  const start = () => {
    if (enabled.value) return;
    const contextCtor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!contextCtor) { error.value = '浏览器不支持公共声音'; status.value = `播放失败：${error.value}`; return; }
    audioContext = new contextCtor();
    void audioContext.resume().catch(() => undefined);
    enabled.value = true; epoch += 1; error.value = null; status.value = '正在连接公共声音……'; if (!interval) interval = setInterval(() => void poll(), 1000); void poll();
  };
  const retry = async () => { const client = options.client.value; const roomId = options.roomId.value; if (!client || !roomId) return; await client.hostRetry(roomId); error.value = null; void poll(); };
  const skip = async () => { const client = options.client.value; const roomId = options.roomId.value; if (!client || !roomId || !task.value) return; await client.hostSkip(roomId, task.value.id); error.value = null; status.value = '已跳过当前音频。'; void poll(); };
  const notify = () => { void poll(); };
  const cleanup = () => { stop(); if (interval) clearInterval(interval); interval = null; };
  return { enabled, status, error, task, busy, canManage, start, stop, suspend, resume, retry, skip, notify, cleanup };
}
