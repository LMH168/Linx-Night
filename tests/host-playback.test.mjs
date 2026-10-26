import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {HostPlayback} from '../apps/server/src/host-playback.mjs';import {speakPublic} from '../apps/linx/src/host-audio.mjs';import {createRoom,appendEvent} from '../packages/domain/src/model.mjs';import {actionAvailable} from '../packages/domain/src/turns.mjs';
let calls=0,fail=false;const manager={async ensureConnected(){},clientFor(){return {};},async retry(){}};
const host=new HostPlayback({manager,speak:async()=>{calls++;if(fail)throw Error('test');return Buffer.from('wav');}});
const room=createRoom();room.gameId='game';room.phase='SPEECH';room.hostPlaybackEnabled=true;appendEvent(room,{type:'game.phase_changed',data:{phase:'SPEECH',seatId:'P1'}});
host.sync(room);host.sync(room);await host.running.get(room.roomId);assert.equal(calls,1);assert.equal(host.state(room).task.status,'ready');assert.equal(room.hostPlaybackBlocked,true);
const id=host.state(room).task.id;assert.equal(host.getAudio(room,id).toString(),'wav');assert.throws(()=>host.acknowledge(room,'stale'));host.acknowledge(room,id,host.state(room).task.attemptId);assert.equal(room.hostPlaybackBlocked,false);assert.throws(()=>host.acknowledge(room,id));
fail=true;appendEvent(room,{type:'game.phase_changed',data:{phase:'VOTE'}});host.sync(room);while(host.running.has(room.roomId))await host.running.get(room.roomId);assert.equal(host.state(room).task.status,'failed');fail=false;await host.retry(room);await host.running.get(room.roomId);assert.equal(host.state(room).task.status,'ready');
room.phase='HUNTER_RESPONSE';room.hunterResponse={seatId:'P2',status:'open'};assert.equal(actionAvailable(room,{seatId:'P2',alive:false}),true);assert.equal(actionAvailable(room,{seatId:'P1',alive:true}),false);
host.cancel(room);assert.equal(host.audio.size,0);
for(const mismatch of [false,true]){const socket=new EventEmitter();socket.send=(data,cb)=>{const m=JSON.parse(data);queueMicrotask(()=>{socket.emit('message',Buffer.from(JSON.stringify({type:'tts',state:'start'})),false);socket.emit('message',Buffer.from(JSON.stringify({type:'tts',state:'sentence_start',text:mismatch?'私密错误':m.text_response})),false);socket.emit('message',Buffer.alloc(640),true);socket.emit('message',Buffer.from(JSON.stringify({type:'tts',state:'stop'})),false);});cb?.();};const work=speakPublic({state:'ready',socket,sessionId:'secret'},'公开事实');if(mismatch)await assert.rejects(work);else assert.equal((await work).length,684);assert.equal(socket.listenerCount('message'),0);}
console.log('Host queue once-only audio, playback gates, retry, hunter priority, cleanup and exact TTS passed');

const voiceSocket=new EventEmitter();let sent;
voiceSocket.send=(data,cb)=>{sent=JSON.parse(data);cb?.();queueMicrotask(()=>voiceSocket.emit('close'));};
await assert.rejects(speakPublic({state:'ready',socket:voiceSocket},'指定正文',{voiceId:'distinct-voice'}));
assert.equal(sent.agent_params.voice.id,'distinct-voice');assert.equal(sent.text_response,'指定正文');
