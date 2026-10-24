import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createVoiceService,wavFromPcm} from '../src/voice.mjs';
import {parseWav} from '../src/wav.mjs';
const wav=wavFromPcm(Buffer.alloc(640));
function service(reply,timeoutMs=100){let closed=0,calls=0;const socket=new EventEmitter();socket.send=(_data,callback)=>{calls++;callback?.();queueMicrotask(()=>reply(socket));};
 const client={socket,sessionId:'test',async connect(){},async send(){calls++;queueMicrotask(()=>reply(socket));},close(){closed++;}};
 return {get closed(){return closed;},get calls(){return calls;},run:createVoiceService({env:{LINX_VOICE_PROFILE:'voice'},readIdentity:async()=>({}),connectInfo:async()=>({state:'bound'}),clientFactory:()=>client,timeoutMs})};
}
const msg=(s,m)=>s.emit('message',Buffer.from(JSON.stringify(m)),false);
test('transcription returns only STT, closes connection and rejects concurrent usage',async()=>{
 const x=service(s=>{msg(s,{type:'stt',text:'公开草稿'});s.emit('message',Buffer.from('private audio'),true);});
 const first=x.run({kind:'transcribe',wav});await assert.rejects(x.run({kind:'transcribe',wav}),/忙/);assert.deepEqual(await first,{text:'公开草稿'});assert.equal(x.closed,1);
 assert.equal(parseWav(wav).length,640);
});
test('public playback requires exact cumulative sentence text and complete PCM',async()=>{
 const x=service(s=>{msg(s,{type:'tts',state:'start'});msg(s,{type:'tts',state:'sentence_start',text:'天亮了。'});s.emit('message',Buffer.alloc(640),true);msg(s,{type:'tts',state:'stop'});});
 assert.equal(parseWav((await x.run({kind:'speak',text:'天亮了。'})).wav).length,640);assert.equal(x.closed,1);
});
test('unmatched text, premature audio, aborted TTS and missing completion fail closed',async()=>{
 for(const mode of ['wrong','early','abort','timeout']){
 const x=service(s=>{if(mode==='timeout')return;if(mode==='early'){s.emit('message',Buffer.alloc(640),true);return;}
 msg(s,{type:'tts',state:'start'});msg(s,{type:'tts',state:'sentence_start',text:mode==='wrong'?'私密回复':'天亮了。'});s.emit('message',Buffer.alloc(640),true);msg(s,{type:'tts',state:'stop',is_aborted:mode==='abort'});},10);
 await assert.rejects(x.run({kind:'speak',text:'天亮了。'}));assert.equal(x.closed,1);
 }
});
test('cancellation, invalid WAV and reused game profile do not expose credentials',async()=>{
 const x=service(()=>{});const abort=new AbortController();const work=x.run({kind:'transcribe',wav,signal:abort.signal});setImmediate(()=>abort.abort());await assert.rejects(work);assert.equal(x.closed,1);
 await assert.rejects(x.run({kind:'transcribe',wav:Buffer.alloc(0)}));
 const wrong=createVoiceService({env:{LINX_VOICE_PROFILE:'player-a'}});await assert.rejects(wrong({kind:'speak',text:'hello'}),/独立/);
});
