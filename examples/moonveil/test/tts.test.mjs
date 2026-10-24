import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oggOpus, opusSamples, crc32, audioFile } from '../tts.mjs';
test('Opus duration supports SILK, hybrid and CELT', () => {
  assert.equal(opusSamples(Buffer.from([0])), 480);
  assert.equal(opusSamples(Buffer.from([24])), 2880);
  assert.equal(opusSamples(Buffer.from([128])), 120);
  assert.equal(opusSamples(Buffer.from([152])), 960);
  assert.throws(() => opusSamples(Buffer.from([])));
});
test('Ogg pages carry headers, valid CRC and 48k granule positions', () => {
  const b = oggOpus([Buffer.from([152, 1, 2]), Buffer.from([152, 3, 4])], {
    format: 'opus',
    sample_rate: 24000,
    channels: 1,
  });
  let offset = 0,
    pages = [];
  while (offset < b.length) {
    assert.equal(b.toString('ascii', offset, offset + 4), 'OggS');
    const segments = b[offset + 26];
    let size = 27 + segments;
    for (let i = 0; i < segments; i++) size += b[offset + 27 + i];
    const page = Buffer.from(b.subarray(offset, offset + size));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    assert.equal(crc32(page), crc);
    pages.push(page);
    offset += size;
  }
  assert.equal(pages.length, 4);
  assert.equal(pages[0][5], 2);
  assert.equal(pages.at(-1)[5], 4);
  assert.equal(pages.at(-1).readBigUInt64LE(6), 1920n);
  assert.ok(b.includes(Buffer.from('OpusHead')));
  assert.ok(b.includes(Buffer.from('OpusTags')));
});
test('PCM responses become valid wave files, unknown formats fail', () => {
  const result = audioFile({
    audioParams: { format: 'pcm', sample_rate: 16000, channels: 1 },
    packets: [Buffer.alloc(320)],
  });
  assert.equal(result.type, 'audio/wav');
  assert.equal(result.data.readUInt32LE(40), 320);
  assert.equal(result.data.readUInt32LE(24), 16000);
  assert.throws(() => audioFile({ audioParams: { format: 'unknown' }, packets: [] }));
});
