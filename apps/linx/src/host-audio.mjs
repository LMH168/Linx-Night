import {wavFromPcm} from './voice.mjs';
// Host connection is already authenticated and bound. Only exact public text is returned.
export function speakPublic(client,text,{signal,timeoutMs=60000}={}) {
 if(client?.state!=='ready'||!text||text.length>1200)return Promise.reject(new Error('HOST_NOT_READY'));
 return new Promise((resolve,reject)=>{
  let spoken='',started=false,bytes=0,done=false;const chunks=[];
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);client.socket.off('message',message);client.socket.off('close',closed);client.socket.off('error',closed);signal?.removeEventListener('abort',closed);error?reject(error):resolve(value);};
  const closed=()=>finish(new Error('HOST_AUDIO_INTERRUPTED'));
  const message=(raw,binary)=>{
   if(binary){if(!started||!spoken||raw.length%2||(bytes+=raw.length)>32000*60)return finish(new Error('HOST_AUDIO_INVALID'));chunks.push(Buffer.from(raw));return;}
   let m;try{m=JSON.parse(raw.toString());}catch{return finish(new Error('HOST_AUDIO_INVALID'));}
   if(m.type==='error')return finish(new Error('HOST_AUDIO_FAILED'));
   if(m.type!=='tts')return;
   if(m.state==='start'){if(started)return finish(new Error('HOST_AUDIO_INVALID'));started=true;}
   if(m.state==='sentence_start'){if(!started||typeof m.text!=='string')return finish(new Error('HOST_TEXT_MISMATCH'));spoken+=m.text;if(!text.startsWith(spoken))finish(new Error('HOST_TEXT_MISMATCH'));}
   if(m.state==='stop'){if(m.is_aborted||spoken!==text||!bytes)return finish(new Error('HOST_TEXT_MISMATCH'));finish(null,wavFromPcm(Buffer.concat(chunks)));}
  };
  const timer=setTimeout(()=>finish(new Error('HOST_AUDIO_TIMEOUT')),timeoutMs);
  client.socket.on('message',message);client.socket.on('close',closed);client.socket.on('error',closed);signal?.addEventListener('abort',closed,{once:true});
  if(signal?.aborted)return closed();
  client.socket.send(JSON.stringify({session_id:client.sessionId,type:'listen',state:'detect',text:'公开事件播报',text_response:text}),e=>{if(e)closed();});
 });
}
