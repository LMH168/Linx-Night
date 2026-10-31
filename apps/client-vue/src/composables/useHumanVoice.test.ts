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
