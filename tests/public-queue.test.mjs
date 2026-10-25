import assert from 'node:assert/strict';
import {HostPlayback} from '../apps/server/src/host-playback.mjs';
import {voiceConfig} from '../apps/server/src/voice-config.mjs';
import {createRoom,appendEvent} from '../packages/domain/src/model.mjs';
const env={LINX_PROFILES:'a,b',LINX_HOST_VOICE_ID:'host',LINX_PLAYER_VOICES:'{"a":"low","b":"high"}'};
assert.equal(voiceConfig(env).players.a,'low');
assert.throws(()=>voiceConfig({...env,LINX_HOST_VOICE_ID:'low'}));
assert.throws(()=>voiceConfig({...env,LINX_PLAYER_VOICES:'{}'}));
const room=createRoom();Object.assign(room,{phase:'SPEECH',gameId:'g',hostPlaybackEnabled:true,publicVoices:{HOST:'host',P2:'low',P3:'high'}});
room.seats[1].playerType='ai';room.seats[2].playerType='ai';
const seen=[];const playback=new HostPlayback({manager:{async ensureConnected(){},clientFor(){return{};}},speak:async(_,text,{voiceId})=>{seen.push({text,voiceId});return Buffer.from('wav');}});
for(const seatId of ['P2','P3']){room.speeches.push({speechId:seatId,seatId,text:'公开发言'});appendEvent(room,{type:'game.speech_submitted',data:{seatId,speechId:seatId}});appendEvent(room,{type:'game.phase_changed',data:{phase:'SPEECH',seatId}});}
playback.sync(room);await playback.running.get(room.roomId);
assert.equal(seen[0].voiceId,'low');const id=playback.state(room).task.id;
playback.sync(room);assert.equal(seen.length,1);playback.getAudio(room,id);assert.equal(seen.length,1);
playback.skip(room,id);assert.equal(room.hostTasks[0].status,'skipped');assert.throws(()=>playback.acknowledge(room,id));
await playback.running.get(room.roomId);assert.equal(seen[1].voiceId,'host');playback.acknowledge(room,playback.state(room).task.id);
await playback.running.get(room.roomId);assert.equal(seen[2].voiceId,'high');
assert.ok(!JSON.stringify(playback.state(room)).includes('voiceId'));
playback.cancel(room);assert.equal(playback.audio.size,0);
console.log('Public queue speech ordering, voice isolation, cached audio and explicit skip passed');

let finish;const pending=new HostPlayback({manager:{async ensureConnected(){},clientFor(){return{};}},speak:()=>new Promise(r=>{finish=r;})});
const late=createRoom();Object.assign(late,{phase:'VOTE',gameId:'g',hostPlaybackEnabled:true});appendEvent(late,{type:'game.phase_changed',data:{phase:'VOTE'}});
pending.sync(late);await new Promise(r=>setImmediate(r));const task=pending.state(late).task.id;pending.skip(late,task);finish(Buffer.from('late'));await pending.running.get(late.roomId);assert.equal(pending.audio.size,0);assert.equal(late.hostPlaybackBlocked,false);
const bounded=createRoom();Object.assign(bounded,{phase:'VOTE',gameId:'g',hostPlaybackEnabled:true});for(let i=0;i<45;i++)appendEvent(bounded,{type:'game.phase_changed',data:{phase:'VOTE'}});
playback.sync(bounded);assert.equal(bounded.hostTasks.length,40);assert.equal(bounded.hostPlaybackError,'HOST_QUEUE_FULL');await playback.running.get(bounded.roomId);playback.skip(bounded,playback.state(bounded).task.id);assert.equal(bounded.hostTasks.filter(t=>!['skipped','played'].includes(t.status)).length,40);playback.cancel(bounded);
console.log('Public queue bounds and skipped generation late-result rejection passed');
