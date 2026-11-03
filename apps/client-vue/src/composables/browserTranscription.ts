export interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export function browserRecognitionConstructor() {
  const scope = globalThis as typeof globalThis & { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition;
}

/** Recognition runs alongside microphone streaming; only text snapshots cross our socket. */
export function startBrowserTranscription({ onText, onWarning, valid }: { onText: (text: string) => void; onWarning: (message: string) => void; valid: () => boolean }) {
  const Constructor = browserRecognitionConstructor();
  if (!Constructor) { onWarning('当前浏览器不支持语音识别，请输入文字。原声仍会实时广播。'); return null; }
  let recognition: BrowserRecognition;
  try { recognition = new Constructor(); } catch { onWarning('浏览器语音识别无法启动，请输入文字。原声仍会广播。'); return null; }
  recognition.lang = 'zh-CN'; recognition.continuous = true; recognition.interimResults = true;
  let prefix = '', latest = '', stopping = false, active = true, fatal = false, restarts = 0, listening = false;
  let ended: (() => void) | undefined;
  const silenceTimer = setTimeout(() => { if(active && valid() && !latest)onWarning('尚未获得识别文字，请检查识别服务或直接输入文字。原声仍会广播。'); }, 6000);
  recognition.onresult = event => {
    if (!active || !valid()) return;
    latest = prefix + Array.from(event.results, result => result[0].transcript).join('');
    onText(latest.trim());
  };
  recognition.onerror = event => {
    if (!active || !valid()) return;
    fatal = event.error !== 'no-speech';
    onWarning(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? '浏览器未允许语音识别，请输入文字。原声仍会广播。' : '浏览器语音识别中断，已保存收到的文字，请检查或补充。');
  };
  recognition.onend = () => {
    listening = false;
    if (stopping || !active || !valid() || fatal) { ended?.(); return; }
    if (++restarts > 3) { onWarning('浏览器语音识别已停止，请输入文字。'); return; }
    prefix = latest;
    try { recognition.start(); listening = true; } catch { onWarning('浏览器语音识别无法继续，请输入文字。'); }
  };
  try { recognition.start(); listening = true; }
  catch { active = false; onWarning('浏览器语音识别无法启动，请输入文字。原声仍会广播。'); }
  const abort = () => { clearTimeout(silenceTimer); active = false; stopping = true; ended?.(); recognition.onresult = null; recognition.onerror = null; recognition.onend = null; try { recognition.abort(); } catch {} };
  return {
    abort,
    async stop() {
      if (!active || !listening) { abort(); return; }
      stopping = true;
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 1000);
        ended = () => { clearTimeout(timer); resolve(); };
        try { recognition.stop(); } catch { ended(); }
      });
      abort();
    }
  };
}
