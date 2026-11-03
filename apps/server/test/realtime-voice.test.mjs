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
room.gameId='direct-game'; room.phase='SPEECH'; room.currentSeatId='P1'; room.hostPlaybackEnabled=true;
rooms.set(room.roomId,room);
let privateCalls=0;
const playback=new HostPlayback({manager:{ensureConnected(){privateCalls++;throw Error('No Linx for human audio');}}});
const {server}=createApiServer({hostPlayback:playback, voice: async ({kind}) => ({text: kind === 'transcribe' ? '真人测试发言' : ''}), realtimeVoice:()=>{privateCalls++;throw Error('Not activated');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/api/rooms/${room.roomId}`;
const post=(path,body)=>fetch(base+'/'+path,{method:'POST',headers:{'content-type':'application/json','x-player-id':'human'},body:JSON.stringify(body)});
const sockets=[];
async function speak(pcm,mode='speech'){
 const recording=await (await post('voice/recording-start',{})).json();
 const ws=new WebSocket(base.replace('http:','ws:')+`/voice/realtime?player_id=human&mode=${mode}&recording_id=${recording.recordingId}`);sockets.push(ws);
 await once(ws,'open');
 const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));
 ws.send(JSON.stringify({type:'start'}));
 if(pcm)ws.send(pcm);
 const closed=once(ws,'close');ws.send(JSON.stringify({type:'stop'}));
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
 assert.equal(speech.text,'真人测试发言');
 const wav=await readFile(speech.audioPath);assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.deepEqual(wav.subarray(44),pcm);
 playback.sync(room);await playback.running.get(room.roomId);
 assert.equal(playback.state(room).task.status,'ready');assert.equal(privateCalls,0);
 assert.deepEqual(playback.getAudio(room,playback.state(room).task.id),wav);
 const task=playback.state(room).task;room.hostPlaybackEnabled=false;playback.acknowledge(room,task.id,task.attemptId);
 assert.equal(room.currentSeatId,'P2');
 const pub=publicState(room);assert.equal(pub.speeches[0].audioId,speech.audioId);assert.doesNotMatch(JSON.stringify(pub),/audioPath|human-audio-/);
 assert.equal((await fetch(base+'/voice/audio?audio_id='+speech.audioId)).status,403);
 assert.equal((await fetch(base+'/voice/audio?audio_id='+speech.audioId,{headers:{'x-player-id':'human'}})).status,200);
 room.phase='SPEECH';room.currentSeatId='P1';room.speechClock=null;room.hostPlaybackBlocked=false;
 await speak(null);assert.equal(room.speeches.length,1);assert.equal(room.currentSeatId,'P2');
 room.seats.forEach((s,i)=>{s.camp=i===1?'werewolf':'good';s.role=i===1?'werewolf':'villager';});room.phase='LAST_WORDS';room.currentSeatId='P1';room.lastWords={windowId:'w',lastWordsId:'w',seatId:'P1',round:0,cause:'vote',status:'open',expiresAt:new Date(Date.now()+30000).toISOString()};room.lastWordsContinuation='NIGHT_WOLF';
 await speak(pcm,'lastwords');assert.equal(room.lastWords,null);assert.ok(room.lastWordsHistory.at(-1).audioId);assert.equal(room.lastWordsHistory.at(-1).text,'真人测试发言');assert.equal(room.phase,'NIGHT_ANNOUNCEMENT');assert.equal(privateCalls,0);
 assert.doesNotMatch(JSON.stringify(publicState(room)),/audioPath|human-audio-/);
 console.log('Direct human PCM: no Linx dependency, exact saved WAV, public playback, replay authorization, silent finish and microphone last words passed');
}finally{for(const ws of sockets)ws.terminate();rooms.clear();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});delete process.env.LINX_PUBLIC_AUDIO_DIR;}
