import assert from 'node:assert/strict';
import {createLinxControllerManager} from '../src/linx-manager.mjs';
import {HostPlayback} from '../src/host-playback.mjs';
import {LinxTurnRuntime} from '../../scheduler/src/linx-runtime.mjs';
import {createRoom,addPlayer,fillAiSeats,beginControllerPreparation} from '../../../packages/domain/src/model.mjs';
import {wavFromPcm} from '../../linx/src/voice.mjs';
for (const limited of [false, true]) {
const room=createRoom({hostPlayerId:'human'});
addPlayer(room,{playerId:'human',displayName:'真人'});fillAiSeats(room);
beginControllerPreparation(room,{aiSeatIds:['P2','P3']});
let releaseVoice;const voiceEnd=new Promise(resolve=>{releaseVoice=resolve;});
const clients=new Map(),received=[];let sends=0,lateMessage,lateAudio;
let playback,runtime;
const manager=createLinxControllerManager({
 env:{LINX_AGENT_ID:'agent',LINX_PROFILES:'a,b',LINX_MCP_ADMIN_URL:'http://test',LINX_MCP_ADMIN_TOKEN:'test'},
 loadAudio:async()=>wavFromPcm(Buffer.alloc(640)),readIdentity:async name=>({deviceId:name}),
 fetchImpl:async url=>Response.json(url.endsWith('/admin/diagnostics')?{requests:[...clients.keys()].map(id=>({authenticated:true,status:200,method:'tools/call',tool:'get_my_private_state',resultCode:'OK',sessionId:id,deviceId:id,agentId:'agent'}))}:url.includes('/ota')?{websocket:{url:'wss://xrobo-io.qiniuapi.com/v1/ws/',token:'test'}}:{}),
 onChange:()=>{playback?.sync(room);runtime?.wake(room);},
 clientFactory:identity=>{const client={state:'closed',sessionId:identity.deviceId,onAudio:()=>{},onMessage:()=>{},
  async connect(){this.state='ready';},cancelTurn(){},close(){this.state='closed';},
  async startRealtime(){return {send:async frame=>{received.push(frame.length);}};},
  async stopRealtime(){},
  async send(cue){
   if(cue.includes('会话准备'))return;
   sends++;assert.equal(identity.deviceId,'a','next seat must wait for browser playback and host narration');
   assert.match(cue,/不要调用 submit_speech/);
   this.onMessage({type:'tts',state:'sentence_start',text:'我听到了上一位发言。'});
   this.onAudio(Buffer.alloc(640));
   lateMessage=this.onMessage;lateAudio=this.onAudio;
   await voiceEnd;
   if (limited) throw Error('SPEECH_LIMIT');
   this.onMessage({type:'tts',state:'sentence_start',text:'请大家继续观察投票。'});
   this.onAudio(Buffer.alloc(640));
   return {attemptId:'voice'};
  }};clients.set(identity.deviceId,client);return client;},
});
await manager.prepare(room);
Object.assign(room,{phase:'SPEECH',currentSeatId:'P2',preparing:false,requireActionLease:true,hostPlaybackEnabled:true});
room.seats[1].controlSource='linx';room.seats[2].controlSource='linx';
playback=new HostPlayback({manager,speak:async()=>{throw Error('public AI speech must not be synthesized again');},publish:()=>runtime?.wake(room)});
runtime=new LinxTurnRuntime({manager,publish:()=>playback.sync(room),timeoutMs:5000});
try {
 const work=runtime.tick(room);
 for(let i=0;i<10&&!room.speeches.length;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(room.speeches[0].text,'我听到了上一位发言。');
 assert.equal(room.turns[0].status,'active');
 assert.equal(playback.state(room).task.status,'generating');
 assert.equal(room.currentSeatId,'P2');
 for(let i=0;i<10&&!received.length;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(received,[640],'next session receives PCM while speaker is still generating');
 assert.equal(sends,1);
 releaseVoice();await work;await playback.running.get(room.roomId);
 assert.equal(room.turns[0].status,'completed');
 assert.equal(room.speeches[0].text,limited?'我听到了上一位发言。':'我听到了上一位发言。请大家继续观察投票。');
 assert.equal(playback.state(room).task.status,'ready');
 assert.equal(room.currentSeatId,'P2','TTS completion cannot bypass browser playback');
 const before=room.speeches[0].text,bytes=room.speechAudioRelay.bytes;
 lateMessage({type:'tts',state:'sentence_start',text:'迟到的私有消息'});lateAudio(Buffer.alloc(640));
 assert.equal(room.speeches[0].text,before);assert.equal(room.speechAudioRelay.bytes,bytes);
 // Block the next public turn until the host has finished its own narration.
 const task=playback.state(room).task;
 playback.acknowledge(room,task.id,task.attemptId);
 assert.equal(room.currentSeatId,'P3');
 assert.equal(room.hostPlaybackBlocked,true);
 await runtime.tick(room);assert.equal(sends,1);
} finally {room.invalidated=true;releaseVoice();playback.cancel(room);await manager.release(room);}
}
console.log('TTS alone streams public PCM, records transcript, prewarms next seat and waits for playback without MCP speech');
