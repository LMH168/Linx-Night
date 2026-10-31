import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { playPcmStream, useHostPlayback } from './useHostPlayback';

class FakeSource {
  onended: (() => void) | null = null;
  buffer = { duration: 0.02 };
  connect() { return this; }
  start() { queueMicrotask(() => this.onended?.()); }
  stop() { this.onended?.(); }
}
class FakeContext {
  currentTime = 0;
  destination = {};
  async resume() {}
  createBuffer(_channels: number, samples: number) { return { duration: samples / 16000, getChannelData: () => new Float32Array(samples) }; }
  createBufferSource() { return new FakeSource(); }
  async close() {}
}

function stream(lines: string[]) {
  let index = 0;
  return { body: { getReader: () => ({ read: async () => index < lines.length ? { value: new TextEncoder().encode(lines[index++]), done: false } : { value: undefined, done: true }, cancel: async () => {}, releaseLock: () => {} }) } } as unknown as Response;
}

describe('host PCM playback validation', () => {
  it('validates task IDs, ordering and reports playback metrics', async () => {
    const ids = { gameId: 'g', taskId: 't', attemptId: 'a' };
    const pcm = btoa(String.fromCharCode(...new Uint8Array(640)));
    const lines = [
      JSON.stringify({ type: 'start', ...ids, sampleRate: 16000, channels: 1, format: 's16le' }) + '\n',
      JSON.stringify({ type: 'audio', ...ids, seq: 0, data: pcm }) + '\n',
      JSON.stringify({ type: 'end', ...ids, chunks: 1, samples: 320 }) + '\n'
    ];
    let started = 0;
    const result = await playPcmStream(stream(lines), new FakeContext() as unknown as AudioContext, { ids, onStart: () => { started += 1; } });
    expect(started).toBe(1);
    expect(result.samples).toBe(320);
  });

  it('rejects a stream without the start frame', async () => {
    const ids = { gameId: 'g', taskId: 't', attemptId: 'a' };
    const pcm = btoa(String.fromCharCode(...new Uint8Array(2)));
    await expect(playPcmStream(stream([JSON.stringify({ type: 'audio', ...ids, seq: 0, data: pcm }) + '\n']), new FakeContext() as unknown as AudioContext, { ids })).rejects.toThrow('缺少音频起点');
  });

  it('clears busy when stopping an in-flight poll', async () => {
    const previous = globalThis.AudioContext;
    (globalThis as typeof globalThis & { AudioContext: typeof AudioContext }).AudioContext = FakeContext as unknown as typeof AudioContext;
    let resolveState: ((value: { task: null }) => void) | undefined;
    const client = { hostState: () => new Promise<{ task: null }>(resolve => { resolveState = resolve; }) } as never;
    const playback = useHostPlayback({ client: ref(client), roomId: ref('room'), isHost: () => false });
    playback.start();
    await Promise.resolve();
    expect(playback.busy.value).toBe(true);
    playback.stop();
    expect(playback.busy.value).toBe(false);
    resolveState?.({ task: null });
    await Promise.resolve();
    playback.cleanup();
    (globalThis as typeof globalThis & { AudioContext: typeof AudioContext }).AudioContext = previous;
  });
});
