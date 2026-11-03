import assert from 'node:assert/strict';
import { HostPlayback } from '../apps/server/src/host-playback.mjs';
import { createRoom } from '../packages/domain/src/model.mjs';
const room=createRoom();room.phase='SPEECH';room.gameId='g';let now=1000;
const playback=new HostPlayback({now:()=>now});
for(let i=0;i<81;i++){
 const live=playback.beginHuman(room,'P1','lastwords');live.stream.append(Buffer.alloc(640));playback.finishHuman(room,live,'e'+i,{path:'retained.wav',wav:Buffer.alloc(684)});live.task.kind='host'; // Exercise cache lifecycle independently of domain last-words progression.
 playback.acknowledge(room,live.task.id,live.task.attemptId);
 assert.ok(playback.streams.has(live.task.id),'Host confirmation preserves listener cache');
}
let history=playback.tasks(room);assert.equal(history.tasks.length,80);assert.equal(history.oldestSequence,2);assert.equal(history.latestSequence,81);assert.equal(playback.streams.size,80);assert.equal(playback.tasks(room,80).tasks.length,1);assert.throws(()=>playback.tasks(room,-1));
now+=600000;history=playback.tasks(room);assert.equal(history.tasks.length,0);assert.equal(playback.streams.size,0);assert.equal(playback.audio.size,0);assert.equal(history.oldestSequence,82);
console.log('Independent task sequences, host-ack cache preservation, last80 retention and 10minute TTL passed');
