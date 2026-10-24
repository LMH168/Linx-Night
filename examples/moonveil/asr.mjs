import https from 'node:https';
import { randomBytes, createHash } from 'node:crypto';
import { frame, FrameReader } from './linx.mjs';
import { loadState, connectionFor } from './linx-config.mjs';
export const MAX_PCM_BYTES = 16000 * 2 * 60;
export function validatePCM(pcm) {
  if (!Buffer.isBuffer(pcm) || pcm.length < 3200 || pcm.length % 2 || pcm.length > MAX_PCM_BYTES)
    throw Error('请录制 0.1–60 秒音频后重试');
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
  if (Math.sqrt(energy / (pcm.length / 2)) < 12)
    throw Error('没有检测到声音，请检查麦克风输入设备并靠近麦克风');
}
export async function transcribe(pcm, { signal } = {}) {
  validatePCM(pcm);
  const state = await loadState();
  if (!state.asr?.ready) throw Error('语音通道未配置，请运行 npm run linx:asr');
  const connection = await connectionFor(state.asr);
  return recognize(connection, pcm, { signal });
}
export function recognize(
  connection,
  pcm,
  {
    signal,
    requestImpl = https.request,
    paceMs = 20,
    timeoutMs = Math.ceil(pcm.length / 32) + 25000,
  } = {},
) {
  return new Promise((resolve, reject) => {
    let socket,
      request,
      timer,
      pump,
      finished = false,
      hello = false,
      session,
      offset = 0,
      stopped = false;
    const key = randomBytes(16).toString('base64');
    const finish = (error, text) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(pump);
      signal?.removeEventListener('abort', abort);
      socket?.destroy();
      request?.destroy();
      error ? reject(error) : resolve(text);
    };
    const abort = () => finish(Error('语音识别已取消'));
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(Error('灵矽语音识别超时，请重试')), timeoutMs);
    const send = (o) => socket.write(frame(JSON.stringify(o)));
    const stream = () => {
      if (finished) return;
      if (offset < pcm.length) {
        const part = Buffer.alloc(640);
        pcm.copy(part, 0, offset, Math.min(offset + 640, pcm.length));
        offset += 640;
        socket.write(frame(part, 2));
        pump = setTimeout(stream, paceMs);
      } else {
        stopped = true;
        send({ session_id: session, type: 'listen', state: 'stop' });
      }
    };
    const reader = new FrameReader(
      (raw, op) => {
        if (finished || op !== 1) return;
        let d;
        try {
          d = JSON.parse(raw.toString());
        } catch {
          return finish(Error('语音服务返回无效数据'));
        }
        if (d.type === 'hello' && !hello) {
          if (d.transport !== 'websocket') return finish(Error('语音握手失败'));
          hello = true;
          session = d.session_id;
          send({ session_id: session, type: 'listen', state: 'start', mode: 'manual' });
          pump = setTimeout(stream, 100);
          return;
        }
        if (!hello || (d.session_id && session && d.session_id !== session)) return;
        if (d.type === 'stt' && typeof d.text === 'string') {
          const text = d.text.trim();
          send({ session_id: session, type: 'abort', reason: 'wake_word_detected' });
          finish(text ? null : Error('没有识别到清晰语音，请重试'), text);
        }
        if (d.type === 'error') finish(Error('灵矽识别服务异常，请重试'));
        if (stopped && d.type === 'tts' && d.state === 'stop')
          finish(Error('未收到语音转写结果，请重试'));
      },
      (data) => socket.write(frame(data, 10)),
      () => finish(Error('语音连接提前关闭')),
    );
    try {
      const url = new URL(connection.url);
      url.protocol = 'https:';
      request = requestImpl(url, {
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': key,
          Authorization: `Bearer ${connection.token}`,
          'Device-Id': connection.deviceId,
          'Client-Id': connection.clientId,
          'Protocol-Version': '1',
        },
      });
      request.on('error', () => finish(Error('无法连接灵矽语音服务')));
      request.on('response', (r) => {
        r.resume();
        finish(Error(`语音鉴权失败 HTTP ${r.statusCode}`));
      });
      request.on('upgrade', (res, s, head) => {
        socket = s;
        if (finished) {
          s.destroy();
          return;
        }
        const expected = createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');
        if (res.headers['sec-websocket-accept'] !== expected)
          return finish(Error('语音连接校验失败'));
        s.on('data', (data) => {
          try {
            reader.push(data);
          } catch {
            finish(Error('语音数据解析失败'));
          }
        });
        s.on('error', () => finish(Error('语音连接中断')));
        s.on('close', () => finish(Error('语音连接关闭')));
        send({
          type: 'hello',
          version: 1,
          transport: 'websocket',
          features: { mcp: false },
          audio_params: {
            format: 'pcm',
            sample_rate: 16000,
            channels: 1,
            bit_depth: 16,
            endianness: 'little',
            frame_duration: 20,
            frame_size: 320,
            sample_format: 'signed_int16',
            play_buffer_duration: 1000,
          },
        });
        if (head.length) reader.push(head);
      });
      request.end();
    } catch {
      finish(Error('无法启动语音识别'));
    }
  });
}
