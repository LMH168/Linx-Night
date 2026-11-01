import {AudioStream} from './audio-stream.mjs';
import {randomUUID} from 'node:crypto';
import {publicNarration} from './voice.mjs';
import {speakPublic} from '../../linx/src/host-audio.mjs';
import {recordTurn} from './turn-diagnostics.mjs';
import {completeSpeechPlayback, pauseSpeechPlayback, retrySpeechPlayback} from '../../../packages/domain/src/engine.mjs';
import { wavFromPcm } from '../../linx/src/voice.mjs';

const done = task => ['played','skipped'].includes(task.status);
const current = room => room.hostTasks?.find(t => !done(t));

export class HostPlayback {
 constructor({manager,publish=()=>{},speak=speakPublic,watchdogMs=Number(process.env.HOST_PLAYBACK_WATCHDOG_MS||90000),now=Date.now}={}){
  this.manager=manager;this.publish=publish;this.speak=speak;this.watchdogMs=Number.isFinite(watchdogMs)&&watchdogMs>0?watchdogMs:90000;this.now=now;
  this.running=new Map();this.audio=new Map();this.aborts=new Map();this.streams=new Map();
 }
 sync(room){
  if(!room.hostPlaybackEnabled||room.invalidated||room.phase==='LOBBY')return;
  room.hostTasks??=[];room.hostEventCursor??=0;room.hostNarratedEventIds??=new Set();
  for(const e of room.events.filter(e=>e.version>room.hostEventCursor)){
   if(room.hostNarratedEventIds.has(e.eventId)){room.hostEventCursor=e.version;continue;}
   if(!['game.speech_submitted','game.night_resolved','game.phase_changed','game.player_eliminated','game.vote_resolved','game.hunter_response_closed'].includes(e.type)){room.hostEventCursor=e.version;continue;}
   const seat=room.seats.find(s=>s.seatId===e.data?.seatId);
   if(e.type==='game.speech_submitted'&&seat?.playerType!=='ai'&&!room.speechAudioRelay?.speechId){room.hostEventCursor=e.version;room.hostNarratedEventIds.add(e.eventId);continue;}
   let text;try{text=publicNarration(room,e.eventId);}catch{room.hostEventCursor=e.version;continue;}
   if(room.hostTasks.filter(t=>!done(t)).length>=40){room.hostPlaybackError='HOST_QUEUE_FULL';break;}
   const speaker=e.type==='game.speech_submitted'&&seat?.playerType==='ai'?seat.seatId:'HOST';
   room.hostEventCursor=e.version;room.hostNarratedEventIds.add(e.eventId);
   const task={id:randomUUID(),eventId:e.eventId,seatId:e.type==='game.speech_submitted'?e.data.seatId:null,kind:e.type==='game.speech_submitted'?'speech':'host',voiceId:room.publicVoices?.[speaker],text,status:'pending',attempts:0,errorCode:null,watchdogDeadlineAt:null};
   room.hostTasks.push(task);
   if(task.kind==='speech'&&room.speechPlayback?.speechId===e.data.speechId)room.speechPlayback.taskId=task.id;
   recordTurn('host_task_created',{roomId:room.roomId,gameId:room.gameId,seatId:task.seatId,eventId:task.eventId,taskId:task.id});
  }
  while(room.hostTasks.length>80&&done(room.hostTasks[0])){const old=room.hostTasks.shift();this.audio.delete(old.id);}
  const task=current(room);room.hostPlaybackBlocked=Boolean(task)||Boolean(room.hostPlaybackError);
  if(task?.status==='ready'&&!task.watchdogDeadlineAt)this.armWatchdog(task);
  if(task?.status==='pending'&&!this.running.has(room.roomId)){
   const work=Promise.resolve().then(()=>this.generate(room,task)).finally(()=>{this.running.delete(room.roomId);if(!room.invalidated)this.sync(room);});
   this.running.set(room.roomId,work);
  }
 }
 armWatchdog(task){task.watchdogDeadlineAt=this.now()+this.watchdogMs;}
 tick(room,now=this.now()){
  const task=current(room);
  if(task?.status!=='ready'||!task.watchdogDeadlineAt||now<task.watchdogDeadlineAt)return false;
  return this.timeout(room,task,now);
 }
 timeout(room,task,now=this.now()){
  if(current(room)!==task||task.status!=='ready'||!task.watchdogDeadlineAt||now<task.watchdogDeadlineAt)return false;
  const deadlineAt=task.watchdogDeadlineAt;
  task.status='failed';task.errorCode='HOST_PLAYBACK_TIMEOUT';task.watchdogDeadlineAt=null;room.hostPlaybackError=task.errorCode;
  this.aborts.get(room.roomId)?.abort();this.streams.get(task.id)?.fail(task.errorCode);
  if(task.kind==='speech'&&room.speechPlayback?.status==='pending')pauseSpeechPlayback(room,{speechId:room.speechPlayback.speechId,taskId:task.id,errorCode:task.errorCode});
  recordTurn('host_playback_timeout',{roomId:room.roomId,gameId:room.gameId,seatId:task.seatId,taskId:task.id,attemptId:task.attemptId,stage:'ready',deadlineAt:new Date(deadlineAt).toISOString(),errorCode:task.errorCode});
  this.publish(room);return true;
 }
 async generate(room,task){
  const gameId=room.gameId,abort=new AbortController();this.aborts.set(room.roomId,abort);task.status='generating';task.attemptId=randomUUID();task.watchdogDeadlineAt=null;
  const stream=new AudioStream({gameId,taskId:task.id,attemptId:task.attemptId});this.streams.set(task.id,stream);
  const diagnostic=(type,data={})=>recordTurn('host_'+type,{roomId:room.roomId,gameId,taskId:task.id,attemptId:task.attemptId,...data});diagnostic('dequeued');this.publish(room);
  try{
   const relay = task.kind === 'speech' ? room.speechAudioRelay : null;
   if (task.kind === 'speech' && relay && relay.speechId === room.speechPlayback?.speechId) {
    relay.stream = stream;
    for (const chunk of relay.chunks) stream.append(chunk);
    if (!relay.ended) await relay.done;
    if (!stream.bytes) throw Error('AI_SPEECH_AUDIO_EMPTY');
    stream.end();
    this.audio.set(task.id, wavFromPcm(Buffer.concat(relay.chunks)));
    task.status='ready'; this.armWatchdog(task);
    recordTurn('ai_tts_ready',{roomId:room.roomId,gameId:room.gameId,seatId:task.seatId,eventId:task.eventId,taskId:task.id,bytes:stream.bytes,watchdogDeadlineAt:new Date(task.watchdogDeadlineAt).toISOString()});
    return;
   }
   diagnostic('connection_start');await this.manager.ensureConnected(room,{seatId:'HOST'});diagnostic('connection_end');
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted)return;
   if(task.text.length>1200)throw Error('PUBLIC_TEXT_TOO_LONG');
   const wav=await this.speak(this.manager.clientFor(room,'HOST'),task.text,{signal:abort.signal,voiceId:task.voiceId,diagnostic,onAudio:pcm=>{if(!abort.signal.aborted&&!done(task))stream.append(pcm);}});
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted||done(task))return;
   if(!stream.bytes&&wav.subarray(0,4).toString()==='RIFF')stream.append(wav.subarray(44));stream.end();this.audio.set(task.id,wav);task.status='ready';this.armWatchdog(task);
   recordTurn('host_tts_ready',{roomId:room.roomId,gameId:room.gameId,seatId:task.seatId,eventId:task.eventId,taskId:task.id,watchdogDeadlineAt:new Date(task.watchdogDeadlineAt).toISOString()});
  }catch(error){
   stream.fail(error.message==='HOST_TEXT_MISMATCH'?'HOST_TEXT_MISMATCH':'HOST_AUDIO_FAILED');
   if(!room.invalidated&&room.gameId===gameId&&!done(task)){
    this.manager.clientFor(room,'HOST')?.close?.();task.attempts=(task.attempts||0)+1;task.errorCode='HOST_AUDIO_FAILED';task.watchdogDeadlineAt=null;
    if(task.status!=='failed'&&task.attempts<2&&!stream.playing&&error.message!=='HOST_TEXT_MISMATCH'){task.status='pending';}
    else{task.status='failed';if(task.kind==='speech'&&room.speechPlayback?.taskId===task.id&&room.speechPlayback.status==='pending')pauseSpeechPlayback(room,{speechId:room.speechPlayback.speechId,taskId:task.id,errorCode:task.errorCode});}
   }
  }finally{this.aborts.delete(room.roomId);this.publish(room);}
 }
 state(room){
  const task=current(room);const hostController=room.controllers?.find(c=>c.seatId==='HOST');
  return {controller:hostController?{status:hostController.status,errorCode:hostController.errorCode}:null,enabled:Boolean(room.hostPlaybackEnabled),blocked:Boolean(room.hostPlaybackBlocked),errorCode:room.hostPlaybackError||task?.errorCode||null,watchdogDeadlineAt:task?.watchdogDeadlineAt?new Date(task.watchdogDeadlineAt).toISOString():null,recoveryRequired:Boolean(task&&['failed','paused'].includes(task.status)),task:task?{id:task.id,eventId:task.eventId,seatId:task.seatId,kind:task.kind,text:task.text,attemptId:task.attemptId,gameId:room.gameId,status:task.status,errorCode:task.errorCode}:null};
 }
 stream(room,id,res){
  const task=current(room),stream=this.streams.get(id);if(room.invalidated||task?.id!==id||!stream||!['generating','ready'].includes(task.status))throw Error('播放任务已失效');
  res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store','access-control-allow-origin':'*','x-accel-buffering':'no'});
  let closed=false;const unsubscribe=stream.subscribe(message=>{if(closed)return;if(res.writableLength>3000000){closed=true;res.destroy();return;}res.write(JSON.stringify(message)+'\n');if(['end','error'].includes(message.type))res.end();});
  res.on('close',()=>{closed=true;unsubscribe();});
 }
 playbackStarted(room,id,attemptId){const t=current(room),stream=this.streams.get(id);if(room.invalidated||t?.id!==id||t.attemptId!==attemptId||!stream||!['generating','ready'].includes(t.status))throw Error('播放任务已失效');stream.playing=true;recordTurn('host_browser_started',{roomId:room.roomId,gameId:room.gameId,taskId:id,attemptId,stage:t.status,deadlineAt:t.watchdogDeadlineAt?new Date(t.watchdogDeadlineAt).toISOString():null,errorCode:null});}
 playbackFailed(room,id,attemptId){const t=current(room);if(room.invalidated||t?.id!==id||t.attemptId!==attemptId||!['generating','ready'].includes(t.status))throw Error('播放任务已失效');const deadlineAt=t.watchdogDeadlineAt;t.status='failed';t.errorCode='HOST_PLAYBACK_INTERRUPTED';t.watchdogDeadlineAt=null;this.aborts.get(room.roomId)?.abort();this.streams.get(id)?.fail(t.errorCode);if(t.kind==='speech'&&room.speechPlayback?.status==='pending')pauseSpeechPlayback(room,{speechId:room.speechPlayback.speechId,taskId:id,errorCode:t.errorCode});recordTurn('host_browser_interrupted',{roomId:room.roomId,gameId:room.gameId,taskId:id,attemptId,stage:'ready',deadlineAt:deadlineAt?new Date(deadlineAt).toISOString():null,errorCode:t.errorCode});this.publish(room);}
 getAudio(room,id){const t=current(room);if(room.invalidated||t?.id!==id||t.status!=='ready'||!this.audio.has(id))throw Error('公共音频尚未就绪');return this.audio.get(id);}
 acknowledge(room,id,attemptId){const t=current(room);if(room.invalidated||t?.id!==id||t.status!=='ready'||!attemptId||attemptId!==t.attemptId)throw Error('播放任务已失效');if(t.kind==='speech')completeSpeechPlayback(room,{speechId:room.speechPlayback?.speechId,taskId:t.id});t.status='played';t.watchdogDeadlineAt=null;this.audio.delete(id);this.streams.delete(id);room.hostPlaybackError=null;recordTurn('host_played_ack',{roomId:room.roomId,gameId:room.gameId,seatId:t.seatId,eventId:t.eventId,taskId:id});this.sync(room);this.publish(room);}
 skip(room,id){const t=current(room);if(room.invalidated||t?.id!==id)throw Error('播放任务已失效');if(t.kind==='speech')completeSpeechPlayback(room,{speechId:room.speechPlayback?.speechId,taskId:t.id,status:'skipped'});t.status='skipped';t.watchdogDeadlineAt=null;this.aborts.get(room.roomId)?.abort();this.audio.delete(id);this.streams.get(id)?.fail('HOST_TASK_CANCELLED');this.streams.delete(id);room.hostPlaybackError=null;this.sync(room);this.publish(room);}
 async retry(room){const t=current(room),gameId=room.gameId;if(!['failed','ready'].includes(t?.status)||this.running.has(room.roomId))throw Error('没有可重试的公共任务');await this.manager.retry(room,'HOST');if(room.invalidated||room.gameId!==gameId||current(room)!==t)throw Error('播放任务已失效');if(t.kind==='speech'&&room.speechPlayback?.status==='paused')retrySpeechPlayback(room,{speechId:room.speechPlayback?.speechId,taskId:t.id});this.streams.get(t.id)?.fail('HOST_ATTEMPT_REPLACED');this.streams.delete(t.id);this.audio.delete(t.id);t.status='pending';t.watchdogDeadlineAt=null;t.attemptId=null;t.errorCode=null;room.hostPlaybackError=null;t.attempts=0;this.sync(room);this.publish(room);}
 cancel(room){this.aborts.get(room.roomId)?.abort();for(const t of room.hostTasks||[]){this.audio.delete(t.id);this.streams.get(t.id)?.fail('HOST_TASK_CANCELLED');this.streams.delete(t.id);t.watchdogDeadlineAt=null;}room.hostTasks=[];room.hostPlaybackBlocked=false;room.hostPlaybackError=null;}
}
