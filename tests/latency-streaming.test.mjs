import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {AudioStream} from '../apps/server/src/audio-stream.mjs';
import {speakPublic} from '../apps/linx/src/host-audio.mjs';
import {HostPlayback} from '../apps/server/src/host-playback.mjs';
import {createRoom,appendEvent} from '../packages/domain/src/model.mjs';
import {createApiServer,rooms} from '../apps/server/src/api.mjs';
import {addPlayer,fillAiSeats} from '../packages/domain/src/model.mjs';
import {submitSpeech} from '../packages/domain/src/engine.mjs';
import {actionAvailable} from '../packages/domain/src/turns.mjs';
const ids={gameId:'g',taskId:'t',attemptId:'a'};
const stream=new AudioStream(ids),live=[];stream.subscribe(m=>live.push(m));stream.append(Buffer.alloc(8000));
assert.deepEqual(live.map(m=>m.type),['start','audio']);stream.end();assert.equal(live.at(-1).samples,4000);
assert.throws(()=>stream.append(Buffer.alloc(2)));assert.equal(stream.listeners.size,0);
const socket=new EventEmitter();socket.send=(_,cb)=>cb?.();let first=false,resolved=false;
const synthesis=speakPublic({state:'ready',socket},'公开文本',{onAudio:()=>first=true}).then(w=>{resolved=true;return w;});
const event=(state,text)=>socket.emit('message',Buffer.from(JSON.stringify({type:'tts',state,text})),false);
event('start');event('sentence_start','公开文本');socket.emit('message',Buffer.alloc(8000),true);
assert.equal(first,true);assert.equal(resolved,false);event('stop');await synthesis;
// Deterministic browser: scheduled sources finish only when this test says so.
const sources=[];const context={currentTime:0,destination:{},async resume(){},createBuffer(_,n,rate){return {duration:n/rate,getChannelData:()=>new Float32Array(n)};},createBufferSource(){const s={connect(){},start(){sources.push(s);},stop(){}};return s;}};
const sandbox={window:{},TextDecoder,Uint8Array,DataView,performance,atob};vm.runInNewContext(await readFile(new URL('../apps/client/pcm-stream.js',import.meta.url),'utf8'),sandbox);
const encode=m=>new TextEncoder().encode(JSON.stringify(m)+'\n');
let controller;const response={body:new ReadableStream({start(c){controller=c;}})};let completed=false,started=0;
const play=sandbox.window.playPcmStream(response,context,{ids,onStart:()=>{started++;}}).then(()=>completed=true);
controller.enqueue(encode(stream.messages[0]));controller.enqueue(encode(stream.messages[1]));
await new Promise(r=>setImmediate(r));assert.equal(started,1);assert.equal(sources.length,1);assert.equal(completed,false);
controller.enqueue(encode(stream.messages[2]));controller.close();await new Promise(r=>setImmediate(r));assert.equal(completed,false);sources[0].onended();await play;assert.equal(completed,true);
for(const messages of [stream.messages.slice(0,2),[stream.messages[0],{...stream.messages[1],seq:7}],[stream.messages[0],{...stream.messages[1],attemptId:'old'}],[...stream.messages.slice(0,2),{...stream.messages[2],samples:1}]]){
 const body=new ReadableStream({start(c){for(const m of messages)c.enqueue(encode(m));c.close();}});
 await assert.rejects(sandbox.window.playPcmStream({body},context,{ids}));
}
// Attempt validation and failure after browser playback starts must never auto-retry.
let release;const manager={async ensureConnected(){},clientFor(){return {close(){}};},async retry(){}};
const host=new HostPlayback({manager,speak:async(_c,_t,{onAudio})=>{onAudio(Buffer.alloc(8000));await new Promise((_,reject)=>release=reject);}});
const room=createRoom();room.gameId='g';room.phase='SPEECH';room.hostPlaybackEnabled=true;appendEvent(room,{type:'game.phase_changed',data:{phase:'SPEECH',seatId:'P1'}});host.sync(room);
await new Promise(r=>setImmediate(r));const task=host.state(room).task;host.playbackStarted(room,task.id,task.attemptId);
assert.throws(()=>host.acknowledge(room,task.id,'old'));assert.throws(()=>host.acknowledge(room,task.id,task.attemptId));release(Error('NETWORK'));await host.running.get(room.roomId);
assert.equal(host.state(room).task.status,'failed');assert.equal(host.state(room).task.attemptId,task.attemptId);host.cancel(room);assert.equal(host.streams.size,0);
console.log('Streaming before stop, bounded cache, browser end gate, malformed streams, attempt checks and post-start pause passed');

// Real HTTP transport: headers require a participant, subscription never synthesizes.
const httpRoom=createRoom({hostPlayerId:'human'});httpRoom.seats[0].playerId='human';httpRoom.seats[0].playerType='human';
Object.assign(httpRoom,{gameId:'http-game',phase:'SPEECH',hostPlaybackEnabled:true});
appendEvent(httpRoom,{type:'game.phase_changed',data:{phase:'SPEECH',seatId:'P1'}});
let finishSynthesis,generated=0;const transport=new HostPlayback({manager,speak:async(_c,_t,{onAudio})=>{generated++;onAudio(Buffer.alloc(8000));await new Promise(r=>finishSynthesis=r);return Buffer.alloc(44);}});
rooms.set(httpRoom.roomId,httpRoom);transport.sync(httpRoom);await new Promise(r=>setImmediate(r));
const api=createApiServer({hostPlayback:transport}).server;await new Promise(r=>api.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${api.address().port}/api/rooms/${httpRoom.roomId}/host`,task2=transport.state(httpRoom).task;
try{
 assert.equal((await fetch(base+'/stream?task_id='+task2.id)).status,403);
 const response=await fetch(base+'/stream?task_id='+task2.id,{headers:{'x-player-id':'human'}});assert.equal(response.status,200);
 const reader=response.body.getReader(),first=await reader.read();assert.match(new TextDecoder().decode(first.value),/"type":"audio"/);assert.equal(generated,1);
 assert.equal(httpRoom.hostTasks[0].status,'generating');finishSynthesis();await transport.running.get(httpRoom.roomId);
 let rest='';while(true){const chunk=await reader.read();if(chunk.done)break;rest+=new TextDecoder().decode(chunk.value);}assert.match(rest,/"type":"end"/);
 const post=body=>fetch(base+'/played',{method:'POST',headers:{'x-player-id':'human','content-type':'application/json'},body:JSON.stringify(body)});
 const version=httpRoom.version;assert.equal((await post({task_id:task2.id,attempt_id:'old'})).status,400);assert.equal(httpRoom.version,version);
 assert.equal((await post({task_id:task2.id,attempt_id:task2.attemptId})).status,200);assert.equal((await post({task_id:task2.id,attempt_id:task2.attemptId})).status,400);
}finally{transport.cancel(httpRoom);rooms.delete(httpRoom.roomId);api.closeAllConnections();await new Promise(r=>api.close(r));}
console.log('Authenticated HTTP chunks arrive before synthesis completion; stale and duplicate acknowledgements rejected');

// Every AI seat stays current through synthesis AND actual browser completion.
const serial=createRoom({hostPlayerId:'h'});addPlayer(serial,{playerId:'h',displayName:'h'});fillAiSeats(serial);
Object.assign(serial,{phase:'SPEECH',gameId:'serial',currentSeatId:'P2',hostPlaybackEnabled:true});serial.seats[0].alive=false;serial.seats.slice(1).forEach(s=>s.controlSource='linx');
const serialHost=new HostPlayback({manager,speak:async(_c,_t,{onAudio})=>{onAudio(Buffer.alloc(8000));return Buffer.alloc(44);}});
for(let i=2;i<=9;i++){
 serial.hostEventCursor=serial.version;submitSpeech(serial,'P'+i,'公开发言','speech-'+i);serialHost.sync(serial);await serialHost.running.get(serial.roomId);
 // Consume preceding phase narration without changing the speech gate.
 while(serialHost.state(serial).task?.kind==='host'){const t=serialHost.state(serial).task;serialHost.acknowledge(serial,t.id,t.attemptId);await serialHost.running.get(serial.roomId);}
 const t=serialHost.state(serial).task;assert.equal(serial.currentSeatId,'P'+i);assert.equal(serial.phase,'SPEECH');assert.equal(serial.speechPlayback.status,'pending');assert.equal(actionAvailable(serial,serial.seats[Math.min(i,8)]),false);
 const snapshot=JSON.stringify(serial);assert.throws(()=>serialHost.acknowledge(serial,t.id,'stale'));assert.equal(JSON.stringify(serial),snapshot);
 serialHost.acknowledge(serial,t.id,t.attemptId);assert.equal(serial.phase,i===9?'VOTE':'SPEECH');assert.equal(serial.currentSeatId,i===9?null:'P'+(i+1));
}
serialHost.cancel(serial);console.log('Eight AI seats remain strictly serial; only final playback acknowledgement enters VOTE');

let failures=0;const automatic=new HostPlayback({manager,speak:async()=>{failures++;throw Error('NETWORK');}}),retryRoom=createRoom();
Object.assign(retryRoom,{gameId:'retry',phase:'VOTE',hostPlaybackEnabled:true});appendEvent(retryRoom,{type:'game.phase_changed',data:{phase:'VOTE'}});automatic.sync(retryRoom);
while(automatic.running.has(retryRoom.roomId))await automatic.running.get(retryRoom.roomId);
assert.equal(failures,2);assert.equal(automatic.state(retryRoom).task.status,'failed');const oldAttempt=automatic.state(retryRoom).task.attemptId;
automatic.speak=async(_c,_t,{onAudio})=>{onAudio(Buffer.alloc(100));return Buffer.alloc(44);};await automatic.retry(retryRoom);await automatic.running.get(retryRoom.roomId);
const fresh=automatic.state(retryRoom).task;assert.notEqual(fresh.attemptId,oldAttempt);const frozen=JSON.stringify(retryRoom);assert.throws(()=>automatic.acknowledge(retryRoom,fresh.id,oldAttempt));assert.equal(JSON.stringify(retryRoom),frozen);automatic.cancel(retryRoom);
// Underrun waits for the next chunk; short final audio flushes only at end.
let feed;const short={body:new ReadableStream({start(c){feed=c;}})},count=sources.length;
const shortPlay=sandbox.window.playPcmStream(short,context,{ids});feed.enqueue(encode(stream.messages[0]));feed.enqueue(encode({...stream.messages[1],data:Buffer.alloc(100).toString('base64')}));await new Promise(r=>setImmediate(r));assert.equal(sources.length,count);
feed.enqueue(encode({...stream.messages[2],samples:50}));feed.close();await new Promise(r=>setImmediate(r));assert.equal(sources.length,count+1);sources.at(-1).onended();await shortPlay;
console.log('One pre-start automatic retry, manual replay attempt isolation and short-stream buffering passed');
