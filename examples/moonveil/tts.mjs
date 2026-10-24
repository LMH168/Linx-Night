import { randomBytes } from 'node:crypto';
import { loadState, connectionFor } from './linx-config.mjs';
import { exchange } from './linx.mjs';
export function opusSamples(packet) {
  if (packet.length < 1) throw Error('空 Opus 帧');
  const toc = packet[0],
    config = toc >> 3;
  const samples =
    config >= 16
      ? [120, 240, 480, 960][config & 3]
      : config >= 12
        ? [480, 960][config & 1]
        : [480, 960, 1920, 2880][config & 3];
  const code = toc & 3,
    count = code === 0 ? 1 : code === 3 ? packet[1] & 63 : 2;
  if (!count || samples * count > 5760) throw Error('Opus 帧时长无效');
  return samples * count;
}
export function crc32(data) {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 24;
    for (let i = 0; i < 8; i++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  }
  return crc >>> 0;
}
export function oggOpus(packets, params = {}) {
  if (!packets.length) throw Error('没有音频');
  const channels = params.channels || 1;
  if (channels !== 1) throw Error('只支持单声道音频');
  const serial = randomBytes(4).readUInt32LE(),
    pages = [];
  let seq = 0,
    granule = 0;
  const page = (packet, flags, position) => {
    const laces = [];
    let remaining = packet.length;
    while (remaining >= 255) {
      laces.push(255);
      remaining -= 255;
    }
    laces.push(remaining);
    if (laces.length > 255) throw Error('音频帧过大');
    const header = Buffer.alloc(27 + laces.length);
    header.write('OggS');
    header[4] = 0;
    header[5] = flags;
    header.writeBigUInt64LE(BigInt(position), 6);
    header.writeUInt32LE(serial, 14);
    header.writeUInt32LE(seq++, 18);
    header[26] = laces.length;
    Buffer.from(laces).copy(header, 27);
    const result = Buffer.concat([header, packet]);
    result.writeUInt32LE(crc32(result), 22);
    pages.push(result);
  };
  const head = Buffer.alloc(19);
  head.write('OpusHead');
  head[8] = 1;
  head[9] = channels;
  head.writeUInt32LE(params.sample_rate || 24000, 12);
  page(head, 2, 0);
  const vendor = Buffer.from('Moonveil');
  const tags = Buffer.alloc(16 + vendor.length);
  tags.write('OpusTags');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  page(tags, 0, 0);
  packets.forEach((packet, i) => {
    granule += opusSamples(packet);
    page(packet, i === packets.length - 1 ? 4 : 0, granule);
  });
  return Buffer.concat(pages);
}
export function audioFile(result) {
  const params = result.audioParams || {};
  if (params.format === 'pcm') {
    const pcm = Buffer.concat(result.packets),
      rate = params.sample_rate || 16000;
    const head = Buffer.alloc(44);
    head.write('RIFF');
    head.writeUInt32LE(pcm.length + 36, 4);
    head.write('WAVEfmt ', 8);
    head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20);
    head.writeUInt16LE(params.channels || 1, 22);
    head.writeUInt32LE(rate, 24);
    head.writeUInt32LE(rate * 2 * (params.channels || 1), 28);
    head.writeUInt16LE(2 * (params.channels || 1), 32);
    head.writeUInt16LE(16, 34);
    head.write('data', 36);
    head.writeUInt32LE(pcm.length, 40);
    return { type: 'audio/wav', data: Buffer.concat([head, pcm]) };
  }
  if (params.format !== 'opus') throw Error('服务返回了不支持的音频格式');
  return { type: 'audio/ogg', data: oggOpus(result.packets, params) };
}
export async function synthesize(seat, text, { signal } = {}) {
  if (
    !Number.isInteger(seat) ||
    seat < 2 ||
    seat > 9 ||
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 1200
  )
    throw Error('无效的玩家或发言');
  const state = await loadState(),
    player = state.players.find((p) => p.seat === seat);
  if (!player?.voiceId) throw Error('玩家尚未配置音色');
  const c = await connectionFor(player);
  const result = await exchange(c, { seat, name: player.name }, '朗读当前玩家发言', {
    captureAudio: true,
    textResponse: text,
    signal,
    timeoutMs: 90000,
  });
  return audioFile(result);
}
