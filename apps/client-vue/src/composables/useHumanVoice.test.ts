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

it.each(['manual', 'deadline'])('automatically submits final recognition once on %s stop', async (finish) => {
  const { ref } = await import('vue');const { vi } = await import('vitest');const { useHumanVoice }=await import('./useHumanVoice');
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval']});
  let socket:any,recognizer:any;const sent:any[]=[];
  vi.stubGlobal('SpeechRecognition',class {lang='';continuous=false;interimResults=false;onresult:any;onend:any;onerror:any;constructor(){recognizer=this;}start(){}stop(){this.onresult?.({results:[{0:{transcript:'五号值得怀疑'},isFinal:true}]});this.onend?.();}abort(){}});
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
  vi.stubGlobal('AudioContext',class {destination={};createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}async close(){}});
  vi.stubGlobal('WebSocket',class {static OPEN=1;readyState=1;onopen:any;onmessage:any;constructor(){socket=this;queueMicrotask(()=>this.onopen?.());}send(value:string){sent.push(JSON.parse(value));}close(){}addEventListener(){}});
  const transcribe=vi.fn();const client={recordingStart:async()=>({recordingId:'r',deadline:Date.now()+30000}),recordingCancel:async()=>{},voiceRealtimeUrl:()=> 'ws://test',transcribe};
  const voice=useHumanVoice({client:ref(client) as any,roomId:ref('room'),contextKey:()=> 'turn',canRecord:()=>true,realtime:true});
  try{
    await voice.start();recognizer.onresult({results:[{0:{transcript:'五号'},isFinal:false}]});
    expect(voice.draft.value.text).toBe('五号');
    await vi.advanceTimersByTimeAsync(180);expect(sent.find(m=>m.type==='transcript')).toMatchObject({recording_id:'r',text:'五号',revision:1});
    socket.onmessage({data:JSON.stringify({type:'transcript_saved',revision:1})});expect(voice.savedRevision.value).toBe(1);
    if(finish==='manual'){voice.stop();await vi.advanceTimersByTimeAsync(0);}else await vi.advanceTimersByTimeAsync(28620);
    voice.stop();
    expect(sent.filter(m=>m.type==='stop')).toEqual([expect.objectContaining({text:'五号值得怀疑',revision:2})]);
    expect(voice.draft.value.stage).toBe('transcribing');expect(transcribe).not.toHaveBeenCalled();
  }finally{await voice.cancel();vi.unstubAllGlobals();vi.useRealTimers();}
});
