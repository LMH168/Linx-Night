import { describe, expect, it } from 'vitest';
import { bytesToBase64, pcmToWav } from './useHumanVoice';

describe('human voice encoding', () => {
  it('writes mono 16-bit PCM WAV headers accepted by the server', () => {
    const wav = pcmToWav(new Float32Array([0, 1, -1, 0.5]));
    const view = new DataView(wav);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(bytesToBase64(wav)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

it('accepts a realtime recording before any transcript exists', async () => {
  const { ref } = await import('vue');
  const { vi } = await import('vitest');
  const { useHumanVoice } = await import('./useHumanVoice');
  let socket: any;
  const track = { stop: vi.fn() };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  vi.stubGlobal('AudioContext', class {
    destination = {};
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {} }; }
    async close() {}
  });
  vi.stubGlobal('WebSocket', class {
    static OPEN = 1;
    readyState = 1;
    onopen: any;
    onmessage: any;
    constructor() { socket = this; queueMicrotask(() => this.onopen?.()); }
    send() {}
    close() {}
    addEventListener() {}
  });
  const client = { recordingStart: async () => ({ recordingId: 'r1', deadline: Date.now() + 30000 }), recordingCancel: async () => {}, voiceRealtimeUrl: () => 'ws://test' };
  const voice = useHumanVoice({ client: ref(client) as any, roomId: ref('room'), contextKey: () => 'turn', canRecord: () => true, realtime: true });
  try {
    await voice.start();
    socket.onmessage({ data: JSON.stringify({ type: 'accepted', text: '', audio_id: 'recorded' }) });
    expect(voice.draft.value.stage).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
    expect(voice.draft.value.error).toBeNull();
  } finally { await voice.cancel(); vi.unstubAllGlobals(); }
});
