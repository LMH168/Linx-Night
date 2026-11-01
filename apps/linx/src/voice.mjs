import { LinxClient } from './client.mjs';
import { ota } from './ota.mjs';
import { readProfile } from './profile.mjs';
import { parseWav } from './wav.mjs';

export function wavFromPcm(pcm) {
  const b=Buffer.alloc(44+pcm.length); b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);pcm.copy(b,44);return b;
}

// This connection never receives a game binding. Raw replies stay in this scope.
export function createVoiceService({env=process.env,readIdentity=readProfile,connectInfo=ota,clientFactory=identity=>new LinxClient(identity),timeoutMs=60000}={}) {
  let busy=false;
  return async ({kind,wav,text,signal}) => {
    const profile=env.LINX_VOICE_PROFILE;
    if(!profile || profile===env.LINX_HOST_PROFILE || String(env.LINX_PROFILES||'player-a,player-b').split(',').map(s=>s.trim()).includes(profile)) throw new Error('请配置独立 LINX_VOICE_PROFILE');
    if(busy) throw new Error('语音服务忙，请稍后重试');
    if(kind==='transcribe')parseWav(wav);
    else if(kind!=='speak' || typeof text!=='string' || !text.trim() || text.length>1200)throw new Error('无效播报请求');
    busy=true;let client,timer,abortHandler;
    const bounded=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
    try {
      const identity=await readIdentity(profile);bounded.throwIfAborted();
      const config=await connectInfo(identity,{signal:bounded});if(config.state!=='bound')throw new Error('语音身份尚未激活');
      bounded.throwIfAborted();client=clientFactory(identity);await client.connect(config);bounded.throwIfAborted();
      return await new Promise((resolve,reject)=>{
        let spoken='',started=false,bytes=0;const chunks=[];
        const fail=()=>reject(new Error('语音返回未通过校验或连接中断'));
        abortHandler=()=>reject(new Error('语音已取消或超时'));bounded.addEventListener('abort',abortHandler,{once:true});
        if(bounded.aborted){abortHandler();return;}
        timer=setTimeout(abortHandler,timeoutMs);
        client.socket.on('close',fail);client.socket.on('error',fail);
        client.socket.on('message',(raw,binary)=>{
          if(binary){if(kind!=='speak')return;if(!started || !spoken || raw.length%2 || (bytes+=raw.length)>32000*60){fail();return;}chunks.push(Buffer.from(raw));return;}
          let m;try{m=JSON.parse(raw.toString());}catch{fail();return;}
          if(m.type==='error'){fail();return;}
          if(kind==='transcribe' && m.type==='stt'){
            if(typeof m.text!=='string' || !m.text.trim() || m.text.length>2000){fail();return;}
            resolve({text:m.text.trim()});return;
          }
          if(kind!=='speak' || m.type!=='tts')return;
          if(m.state==='start'){if(started){fail();return;}started=true;}
          if(m.state==='sentence_start'){
            if(!started || typeof m.text!=='string'){fail();return;}
            spoken+=m.text;if(!text.startsWith(spoken))fail();
          }
          if(m.state==='stop'){
            if(m.is_aborted || spoken!==text || !bytes){fail();return;}
            resolve({wav:wavFromPcm(Buffer.concat(chunks))});
          }
        });
        if(kind==='transcribe')client.send(wav).catch(fail);
        else client.socket.send(JSON.stringify({session_id:client.sessionId,type:'listen',state:'detect',text:'公开事件播报',text_response:text}),error=>{if(error)fail();});
      });
    } catch { throw new Error('灵矽语音未完成，请重试或使用文字'); }
    finally {clearTimeout(timer);if(abortHandler)bounded.removeEventListener('abort',abortHandler);client?.close();busy=false;}
  };
}

/** Opens one long-lived realtime microphone session for a human speaker. */
export function createRealtimeVoiceService({env=process.env,readIdentity=readProfile,connectInfo=ota,clientFactory=identity=>new LinxClient(identity),timeoutMs=60000}={}) {
  return async ({onAudio=()=>{},onMessage=()=>{},signal}={}) => {
    const profile=env.LINX_VOICE_PROFILE;
    if(!profile || profile===env.LINX_HOST_PROFILE || String(env.LINX_PROFILES||'player-a,player-b').split(',').map(s=>s.trim()).includes(profile)) throw new Error('请配置独立 LINX_VOICE_PROFILE');
    const bounded=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
    const identity=await readIdentity(profile); bounded.throwIfAborted();
    const config=await connectInfo(identity,{signal:bounded}); if(config.state!=='bound')throw new Error('语音身份尚未激活');
    const client=clientFactory(identity); client.onAudio=onAudio; client.onMessage=onMessage; await client.connect(config); bounded.throwIfAborted();
    const stream=await client.startRealtime();
    return { client, attemptId:stream.attemptId, send:stream.send, stop:()=>client.stopRealtime(), close:()=>client.close() };
  };
}
