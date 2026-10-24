export function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(4) + 8 !== buffer.length) throw new Error('无效 RIFF WAV 文件');
  let format, audio;
  for (let offset = 12; offset < buffer.length;) {
    if (offset + 8 > buffer.length) throw new Error('WAV 块头截断');
    const size = buffer.readUInt32LE(offset + 4), start = offset + 8, end = start + size;
    if (end > buffer.length) throw new Error('WAV 块截断');
    const type = buffer.toString('ascii', offset, offset + 4);
    if (type === 'fmt ') {
      if (format || size < 16) throw new Error('WAV 格式块无效');
      format = buffer.subarray(start, end);
    } else if (type === 'data') {
      if (audio) throw new Error('WAV 重复音频块');
      audio = buffer.subarray(start, end);
    }
    offset = end + (size % 2);
    if (offset > buffer.length) throw new Error('WAV 填充截断');
  }
  if (!format || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt32LE(4) !== 16000 || format.readUInt32LE(8) !== 32000 || format.readUInt16LE(12) !== 2 || format.readUInt16LE(14) !== 16) throw new Error('仅接受单声道 16kHz 16 位 PCM WAV');
  if (!audio?.length || audio.length % 2 || audio.length > 32000 * 30) throw new Error('音频必须非空、完整采样且不超过 30 秒');
  return audio;
}
export function* frames(audio) {
  for (let offset = 0; offset < audio.length; offset += 640) {
    const frame = Buffer.alloc(640); audio.copy(frame, 0, offset, Math.min(offset + 640, audio.length)); yield frame;
  }
}

export function parseTriggerWav(buffer) {
  const audio = parseWav(buffer);
  if (audio.length > 32000 * 5) throw new Error('行动触发音频不得超过 5 秒，请重新生成短音频');
  return audio;
}
