export function resamplePCM(chunks, inputRate) {
  const count = chunks.reduce((n, c) => n + c.length, 0),
    input = new Float32Array(count);
  let pos = 0;
  for (const c of chunks) {
    input.set(c, pos);
    pos += c.length;
  }
  const length = Math.min(16000 * 60, Math.floor((count * 16000) / inputRate)),
    out = new ArrayBuffer(length * 2),
    view = new DataView(out),
    ratio = inputRate / 16000;
  for (let i = 0; i < length; i++) {
    const start = i * ratio,
      end = (i + 1) * ratio;
    let sum = 0,
      weight = 0;
    for (let j = Math.floor(start); j < Math.ceil(end) && j < input.length; j++) {
      const w = Math.min(end, j + 1) - Math.max(start, j);
      sum += input[j] * w;
      weight += w;
    }
    const x = Math.max(-1, Math.min(1, weight ? sum / weight : 0));
    view.setInt16(i * 2, Math.round(x < 0 ? x * 32768 : x * 32767), true);
  }
  return out;
}
export function microphoneError(e) {
  return (
    {
      NotAllowedError:
        '麦克风权限被拒绝。请在浏览器网站权限和系统麦克风设置中允许此应用访问麦克风。',
      NotFoundError: '没有找到麦克风，请连接或选择输入设备。',
      NotReadableError: '麦克风被其他应用占用，或系统禁止访问。请检查输入设备后重试。',
      SecurityError: '当前页面无法访问麦克风，请使用 localhost 或 HTTPS。',
      AbortError: '录音已取消。',
    }[e.name] ||
    e.message ||
    '无法启动麦克风'
  );
}
const processor = `class Capture extends AudioWorkletProcessor {process(inputs){const channels=inputs[0];if(channels?.length){const mono=new Float32Array(channels[0].length);for(const c of channels)for(let i=0;i<mono.length;i++)mono[i]+=c[i]/channels.length;this.port.postMessage(mono,[mono.buffer]);}return true;}}registerProcessor('moonveil-capture',Capture);`;
export class VoiceRecorder {
  constructor({ onState, onText, onError, endpoint }) {
    Object.assign(this, { onState, onText, onError, endpoint, state: 'idle', generation: 0 });
  }
  update(state, detail = {}) {
    this.state = state;
    this.onState(state, detail);
  }
  async start() {
    if (this.state !== 'idle') return;
    const generation = ++this.generation;
    this.update('starting');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw Error('当前浏览器不能访问麦克风。请用支持麦克风的浏览器打开 localhost 地址。');
      const response = await fetch(this.endpoint + '/status');
      const status = await response.json();
      if (!response.ok || !status.ready) throw Error('灵矽语音通道未就绪，请启动语音服务。');
      if (generation !== this.generation) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const Audio = window.AudioContext || window.webkitAudioContext;
      this.context = new Audio();
      await this.context.resume();
      if (generation !== this.generation) return this.cleanup();
      this.chunks = [];
      this.source = this.context.createMediaStreamSource(stream);
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      const collect = (data) => {
        if (this.state !== 'recording') return;
        this.chunks.push(data);
        let energy = 0;
        for (const x of data) energy += x * x;
        this.level = Math.sqrt(energy / data.length);
      };
      if (this.context.audioWorklet && window.AudioWorkletNode) {
        const url = URL.createObjectURL(new Blob([processor], { type: 'text/javascript' }));
        try {
          await this.context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        if (generation !== this.generation) return this.cleanup();
        this.node = new AudioWorkletNode(this.context, 'moonveil-capture');
        this.node.port.onmessage = (e) => collect(e.data);
      } else {
        this.node = this.context.createScriptProcessor(4096, 1, 1);
        this.node.onaudioprocess = (e) =>
          collect(new Float32Array(e.inputBuffer.getChannelData(0)));
      }
      this.source.connect(this.node);
      this.node.connect(this.gain);
      this.started = Date.now();
      this.update('recording', { seconds: 0, level: 0 });
      this.tick = setInterval(() => {
        const seconds = Math.floor((Date.now() - this.started) / 1000);
        this.onState('recording', { seconds, level: this.level || 0 });
        if (seconds >= 60) this.stop();
      }, 200);
    } catch (e) {
      if (generation !== this.generation) return;
      this.cleanup();
      this.update('idle');
      this.onError(microphoneError(e));
    }
  }
  cleanup() {
    clearInterval(this.tick);
    this.source?.disconnect();
    this.node?.disconnect();
    this.gain?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.context?.close().catch(() => {});
    this.stream = this.context = this.source = this.node = this.gain = null;
  }
  async stop() {
    if (this.state !== 'recording') return;
    const generation = this.generation,
      rate = this.context.sampleRate,
      chunks = this.chunks;
    this.cleanup();
    this.chunks = [];
    this.update('transcribing');
    this.abort = new AbortController();
    try {
      const pcm = resamplePCM(chunks, rate);
      if (pcm.byteLength < 3200) throw Error('录音太短，请至少说一句完整的话。');
      const r = await fetch(this.endpoint + '/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pcm,
        signal: this.abort.signal,
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || '识别失败');
      if (generation !== this.generation) return;
      this.onText(data.text);
    } catch (e) {
      if (generation === this.generation && e.name !== 'AbortError')
        this.onError(microphoneError(e));
    } finally {
      if (generation === this.generation) this.update('idle');
    }
  }
  cancel() {
    this.generation++;
    this.abort?.abort();
    this.cleanup();
    this.chunks = [];
    this.update('idle');
  }
}
