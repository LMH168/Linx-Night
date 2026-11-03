import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createApiServer, rooms } from '../src/api.mjs';
import { createRoom, addPlayer, publicState } from '../../../packages/domain/src/model.mjs';
import { HostPlayback } from '../src/host-playback.mjs';

const root = await mkdtemp(join(tmpdir(), 'human-audio-'));
process.env.LINX_PUBLIC_AUDIO_DIR = root;
const room = createRoom({hostPlayerId:'human'});
addPlayer(room,{playerId:'human',displayName:'真人'});
addPlayer(room,{playerId:'listener',displayName:'另一位真人'});
room.gameId='direct-game'; room.phase='SPEECH'; room.currentSeatId='P1'; room.hostPlaybackEnabled=true;
rooms.set(room.roomId,room);
let privateCalls=0,transcriptionCalls=0;
const playback=new HostPlayback({manager:{ensureConnected(){privateCalls++;throw Error('No Linx for human audio');}}});
const {server}=createApiServer({hostPlayback:playback, voice: async () => { transcriptionCalls++; throw Error('Transcription unavailable'); }, realtimeVoice:()=>{privateCalls++;throw Error('Not activated');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/api/rooms/${room.roomId}`;
const post=(path,body)=>fetch(base+'/'+path,{method:'POST',headers:{'content-type':'application/json','x-player-id':'human'},body:JSON.stringify(body)});
const sockets=[];
async function speak(pcm,mode='speech',text,ending='stop'){
 const recording=await (await post('voice/recording-start',{})).json();
 const ws=new WebSocket(base.replace('http:','ws:')+`/voice/realtime?player_id=human&mode=${mode}&recording_id=${recording.recordingId}`);sockets.push(ws);
 await once(ws,'open');
 const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));
 ws.send(JSON.stringify({type:'start'}));
 if(pcm)ws.send(pcm);
 if(text){
  ws.send(JSON.stringify({type:'transcript',recording_id:recording.recordingId,text,revision:2,source:'browser_transcription'}));
  await new Promise(resolve=>ws.on('message',raw=>{if(JSON.parse(raw).type==='transcript_saved')resolve();}));
  const partial=publicState(room).records.at(-1);
  assert.equal(partial.text,text);assert.equal(partial.transcriptionStatus,'processing');
  ws.send(JSON.stringify({type:'transcript',recording_id:recording.recordingId,text:'过期内容',revision:1,source:'browser_transcription'}));
 }
 const closed=once(ws,'close');if(ending==='disconnect')ws.close();else ws.send(JSON.stringify({type:ending}));
 await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('socket did not close')),2000).unref())]);
 return messages;
}
try{
 const pcm=Buffer.alloc(640);pcm.writeInt16LE(5000,0);
 const messages=await speak(pcm);
 assert.ok(messages.some(m=>m.type==='accepted'));
 assert.equal(privateCalls,0);
 assert.equal(room.speeches.length,1);
 const speech=room.speeches[0];assert.ok(speech.audioId);assert.ok(speech.audioPath);
 assert.equal(speech.text,'');
 const wav=await readFile(speech.audioPath);assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.deepEqual(wav.subarray(44),pcm);
 playback.sync(room);await playback.running.get(room.roomId);
 assert.equal(playback.state(room).task.status,'ready');assert.equal(privateCalls,0);
 assert.deepEqual(playback.getAudio(room,playback.state(room).task.id),wav);
 assert.deepEqual(Buffer.from(await (await fetch(base+'/voice/audio?audio_id='+speech.audioId,{headers:{'x-player-id':'listener'}})).arrayBuffer()),wav);
 const task=playback.state(room).task;room.hostPlaybackEnabled=false;playback.acknowledge(room,task.id,task.attemptId);
 assert.equal(room.currentSeatId,'P2');
 const pub=publicState(room);assert.equal(pub.speeches[0].audioId,speech.audioId);assert.doesNotMatch(JSON.stringify(pub),/audioPath|human-audio-/);
 assert.equal((await fetch(base+'/voice/audio?audio_id='+speech.audioId)).status,403);
 assert.equal((await fetch(base+'/voice/audio?audio_id='+speech.audioId,{headers:{'x-player-id':'human'}})).status,200);
 for(let i=0;i<100 && speech.transcriptionStatus!=='failed';i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(speech.transcriptionStatus,'failed');
 const supplement=(player,text)=>fetch(base+'/voice/supplement',{method:'POST',headers:{'content-type':'application/json','x-player-id':player},body:JSON.stringify({kind:'speech',record_id:speech.speechId,text})});
 assert.equal((await supplement('listener','篡改')).status,403);
 assert.notEqual((await supplement('human','字'.repeat(1201))).status,200);
 assert.equal((await supplement('human','五号值得怀疑')).status,200);
 assert.equal(publicState(room).records[0].text,'五号值得怀疑');assert.equal(publicState(room).records[0].textSource,'player_supplement');
 assert.notEqual((await supplement('human','重复修改')).status,200);

 room.phase='SPEECH';room.currentSeatId='P1';room.speechClock=null;room.hostPlaybackBlocked=false;
 await speak(pcm,'speech','我认为五号值得怀疑');assert.equal(room.speeches.length,2);
 assert.equal(room.speeches.at(-1).text,'我认为五号值得怀疑');assert.equal(room.speeches.at(-1).transcriptionStatus,'completed');assert.equal(transcriptionCalls,0);
 assert.equal(publicState(room).records.filter(r=>r.text==='我认为五号值得怀疑').length,1);
 playback.cancel(room);
 room.phase='SPEECH';room.currentSeatId='P1';room.speechClock=null;room.hostPlaybackBlocked=false;
 await speak(null);assert.equal(room.speeches.length,2);assert.equal(room.currentSeatId,'P2');
 room.phase='SPEECH';room.currentSeatId='P1';room.speechClock=null;room.hostPlaybackBlocked=false;
 await speak(pcm,'speech','应该取消','cancel');assert.equal(room.speeches.length,2);assert.equal(room.liveTranscript,undefined);assert.equal(room.currentSeatId,'P1');
 assert.equal(room.speechClock.stage,'speaking');
 await speak(null,'speech','直接输入文字');assert.equal(room.speeches.at(-1).text,'直接输入文字');assert.equal(room.speeches.at(-1).audioId,undefined);
 room.phase='SPEECH';room.currentSeatId='P1';room.speechClock=null;room.hostPlaybackBlocked=false;
 await speak(pcm,'speech','断线前已保存文字','disconnect');
 for(let i=0;i<100 && room.speeches.length<4;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(room.speeches.at(-1).text,'断线前已保存文字');assert.equal(room.liveTranscript,undefined);playback.cancel(room);
 room.seats.forEach((s,i)=>{s.camp=i===1?'werewolf':'good';s.role=i===1?'werewolf':'villager';});room.phase='LAST_WORDS';room.currentSeatId='P1';room.lastWords={windowId:'w',lastWordsId:'w',seatId:'P1',round:0,cause:'vote',status:'open',expiresAt:new Date(Date.now()+30000).toISOString()};room.lastWordsContinuation='NIGHT_WOLF';
 await speak(pcm,'lastwords','请重点观察五号');assert.equal(room.lastWords,null);assert.ok(room.lastWordsHistory.at(-1).audioId);assert.equal(room.lastWordsHistory.at(-1).text,'请重点观察五号');assert.equal(transcriptionCalls,0);assert.equal(room.phase,'NIGHT_ANNOUNCEMENT');assert.equal(privateCalls,0);
 assert.doesNotMatch(JSON.stringify(publicState(room)),/audioPath|human-audio-/);
 console.log('Direct human PCM: no Linx dependency, exact saved WAV, public playback, replay authorization, silent finish and microphone last words passed');
}finally{for(const ws of sockets)ws.terminate();rooms.clear();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});delete process.env.LINX_PUBLIC_AUDIO_DIR;}
