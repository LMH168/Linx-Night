import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HumanTranscriptions, updateTranscript } from '../src/human-transcription.mjs';
import { createRoom, addPlayer } from '../../../packages/domain/src/model.mjs';
import { publicConversation, syncPublicContextClocks, pendingPublicContext } from '../../../packages/domain/src/public-conversation.mjs';
const dir=await mkdtemp(join(tmpdir(),'transcription-')), audioPath=join(dir,'voice.wav');await writeFile(audioPath,Buffer.alloc(100));
const fixture=(kind='speech')=>{const room=createRoom();addPlayer(room,{playerId:room.hostPlayerId});room.gameId='g';room.phase='NIGHT_WOLF';room.nightWindow={phase:room.phase,expiresAt:10000};const record={seatId:'P1',round:1,text:'',audioId:'audio',audioPath,durationMs:1,...(kind==='speech'?{speechId:'s'}:{lastWordsId:'l'})};(kind==='speech'?room.speeches:room.lastWordsHistory).push(record);room.events.push({type:kind==='speech'?'game.speech_submitted':'game.last_words_submitted',version:++room.version,data:kind==='speech'?{speechId:'s'}:{lastWordsId:'l'}});return {room,record};};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
 for(const kind of ['speech','lastwords']) {
  const {room,record}=fixture(kind);let calls=0,active=0,maxActive=0;
  const queue=new HumanTranscriptions({retryMs:1,voice:async()=>{maxActive=Math.max(maxActive,++active);active--;if(++calls===1)throw Error('private provider message');return {text:'五号值得怀疑'};}});
  queue.enqueue(room,record,kind);assert.equal(record.transcriptionStatus,'pending');assert.ok(pendingPublicContext(room));assert.ok(room.nightWindow.publicContextPausedAt);
  await queue.tail;assert.equal(calls,2);assert.equal(maxActive,1);assert.equal(record.text,'五号值得怀疑');assert.equal(record.transcriptionStatus,'completed');assert.equal(room.nightWindow.publicContextPausedAt,undefined);
  assert.equal(publicConversation(room)[0].text,'五号值得怀疑');assert.equal(publicConversation(room)[0].kind,kind);assert.doesNotMatch(JSON.stringify(publicConversation(room)),/audioPath/);
 }
 const {room,record}=fixture();let release,calls=0;
 const queue=new HumanTranscriptions({deadlineMs:25,retryMs:1,voice:()=>{calls++;return new Promise(r=>release=r);}});
 queue.enqueue(room,record,'speech');await wait(40);assert.equal(record.transcriptionStatus,'failed');await queue.tail;
 updateTranscript(room,record,'speech','completed','玩家补充','player_supplement');release({text:'迟到结果'});await wait(5);assert.equal(record.text,'玩家补充');assert.equal(calls,1);
 const empty=fixture('lastwords');const emptyQueue=new HumanTranscriptions({retryMs:1,voice:async()=>({text:' '})});emptyQueue.enqueue(empty.room,empty.record,'lastwords');await emptyQueue.tail;assert.equal(empty.record.transcriptionStatus,'failed');assert.equal(empty.record.text,'');
 const cancelled=fixture();let finish;const cancelQueue=new HumanTranscriptions({voice:()=>new Promise(r=>finish=r)});cancelQueue.enqueue(cancelled.room,cancelled.record,'speech');await wait(5);cancelQueue.cancel(cancelled.room);finish({text:'不允许写入'});await cancelQueue.tail;assert.equal(cancelled.record.text,'');
 const serial=new HumanTranscriptions({voice:async()=>{await wait(5);return {text:'串行'};}});const a=fixture(),b=fixture();serial.enqueue(a.room,a.record,'speech');serial.enqueue(b.room,b.record,'speech');await serial.tail;assert.equal(b.record.transcriptionStatus,'completed');
 const clocks=fixture().room;clocks.speeches[0].transcriptionStatus='pending';syncPublicContextClocks(clocks,100);clocks.speeches[0].transcriptionStatus='failed';syncPublicContextClocks(clocks,900);assert.equal(clocks.nightWindow.expiresAt,10800);
 console.log('Human transcription: speech/lastwords, retry, empty, deadline, late-result, supplement preservation, cancellation, serial queue and paused clock passed');
} finally {await rm(dir,{recursive:true,force:true});}
