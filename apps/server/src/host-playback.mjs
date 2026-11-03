import {AudioStream} from './audio-stream.mjs';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {publicNarration} from './voice.mjs';
import {speakPublic} from '../../linx/src/host-audio.mjs';
import {recordTurn} from './turn-diagnostics.mjs';
import {completeNightAnnouncement, completeLastWordsPlayback, completeSpeechPlayback, pauseSpeechPlayback, retrySpeechPlayback} from '../../../packages/domain/src/engine.mjs';

const done = task => ['played','skipped'].includes(task.status);
const current = room => room.hostTasks?.find(t => !done(t));

export class HostPlayback {
 constructor({manager,publish=()=>{},speak=speakPublic,watchdogMs=Number(process.env.HOST_PLAYBACK_WATCHDOG_MS||15000),now=Date.now}={}){
  this.manager=manager;this.publish=publish;this.speak=speak;this.watchdogMs=Number.isFinite(watchdogMs)&&watchdogMs>0?watchdogMs:15000;this.now=now;
  this.running=new Map();this.audio=new Map();this.aborts=new Map();this.streams=new Map();this.recoveryTimers=new Map();
 }
 sync(room){
  if(!room.hostPlaybackEnabled||room.invalidated||room.phase==='LOBBY')return;
  room.hostTasks??=[];room.hostEventCursor??=0;room.hostNarratedEventIds??=new Set();
  for(const e of room.events.filter(e=>e.version>room.hostEventCursor)){
   if(room.hostNarratedEventIds.has(e.eventId)){room.hostEventCursor=e.version;continue;}
   if(!['game.night_confirmed','game.speech_submitted','game.last_words_submitted','game.night_resolved','game.phase_changed','game.player_eliminated','game.vote_resolved','game.hunter_response_closed'].includes(e.type)){room.hostEventCursor=e.version;continue;}
   const seat=room.seats.find(s=>s.seatId===e.data?.seatId);
   const live=room.humanAudioTask;
   if(live && ['game.speech_submitted','game.last_words_submitted'].includes(e.type) && live.eventId===e.eventId){room.hostEventCursor=e.version;room.hostNarratedEventIds.add(e.eventId);continue;}
   if(e.type==='game.speech_submitted'&&seat?.playerType!=='ai'&&!room.realtimeSpeech&&!room.speeches.find(item=>item.speechId===e.data.speechId)?.audioPath){room.hostEventCursor=e.version;room.hostNarratedEventIds.add(e.eventId);continue;}
   let text;try{text=publicNarration(room,e.eventId);}catch{room.hostEventCursor=e.version;continue;}
   if(room.hostTasks.filter(t=>!done(t)).length>=40){room.hostPlaybackError='HOST_QUEUE_FULL';break;}
   const speaker=['game.speech_submitted','game.last_words_submitted'].includes(e.type)?seat?.seatId:'HOST';
   room.hostEventCursor=e.version;room.hostNarratedEventIds.add(e.eventId);
   const speech=e.type==='game.speech_submitted'?room.speeches.find(item=>item.speechId===e.data.speechId):null;
   const words=e.type==='game.last_words_submitted'?room.lastWordsHistory?.find(item=>item.lastWordsId===e.data.lastWordsId):null;
   const audioPath=speech?.audioPath||words?.audioPath||null;
   const task={sequence: room.hostTaskSequence = (room.hostTaskSequence || 0) + 1,id:randomUUID(),eventId:e.eventId,seatId:['game.speech_submitted','game.last_words_submitted'].includes(e.type)?e.data.seatId:null,windowId:e.data?.windowId,lastWordsId:e.data?.lastWordsId,kind:e.type==='game.night_confirmed'?'night-announcement':e.type==='game.last_words_submitted'?'lastwords':e.type==='game.speech_submitted'?'speech':'host',audioPath,voiceId:room.publicVoices?.[speaker],text,status:'pending',attempts:0,errorCode:null,watchdogDeadlineAt:null};
   room.hostTasks.push(task);
   if(task.kind==='speech'&&room.speechPlayback?.speechId===e.data.speechId)room.speechPlayback.taskId=task.id;
   recordTurn('host_task_created',{roomId:room.roomId,gameId:room.gameId,seatId:task.seatId,eventId:task.eventId,taskId:task.id});
  }
  this.prune(room);
  const task=current(room);room.hostPlaybackBlocked=Boolean(task)||Boolean(room.hostPlaybackError);
  if(!room.hostPlaybackBlocked&&room.lastWords?.waitingForPlayback){room.lastWords.waitingForPlayback=false;room.lastWords.expiresAt=new Date(Date.now()+30000).toISOString();if(room.lastWords.publicContextPausedAt!==undefined)room.lastWords.publicContextPausedAt=Date.now();room.version++;}
  if(task?.status==='ready'&&!task.watchdogDeadlineAt)this.armWatchdog(task);
  if(task?.status==='pending'&&!room.hostDecisionRunning&&!this.running.has(room.roomId)){
   const work=Promise.resolve().then(()=>this.generate(room,task)).finally(()=>{this.running.delete(room.roomId);if(!room.invalidated)this.sync(room);});
   this.running.set(room.roomId,work);
  }
 }
 beginHuman(room,seatId,mode){
  this.sync(room);
  if(current(room))throw Error('请等待公共播放完成');
  const task={sequence: room.hostTaskSequence = (room.hostTaskSequence || 0) + 1,id:randomUUID(),attemptId:randomUUID(),eventId:null,seatId,kind:mode==='speech'?'speech':'lastwords',source:'human',text:mode==='speech'?'真人原声发言':'真人原声遗言',status:'generating',attempts:0,watchdogDeadlineAt:null};
  const stream=new AudioStream({gameId:room.gameId,taskId:task.id,attemptId:task.attemptId});
  room.hostTasks??=[];room.hostTasks.push(task);room.humanAudioTask=task;room.hostPlaybackBlocked=true;this.streams.set(task.id,stream);this.publish(room);
  return {task,stream};
 }
 finishHuman(room,live,eventId,audio){
  const {task,stream}=live;
  if(room.invalidated||task.status!=='generating')throw Error('真人音频任务已失效');
  task.eventId=eventId;if(task.kind==='lastwords')task.lastWordsId=room.lastWordsPlayback?.lastWordsId;task.audioPath=audio.path;task.durationMs=audio.durationMs;task.status='ready';this.armWatchdog(task);stream.end();this.audio.set(task.id,audio.wav);
  room.hostNarratedEventIds??=new Set();room.hostNarratedEventIds.add(eventId);
  if(task.kind==='speech'&&room.speechPlayback)room.speechPlayback.taskId=task.id;
  this.publish(room);
 }
 cancelHuman(room,live){if(!live)return;live.stream.fail('HUMAN_AUDIO_CANCELLED');live.task.status='skipped';live.task.finishedAt=this.now();this.streams.delete(live.task.id);room.humanAudioTask=null;this.sync(room);this.publish(room);}
 scheduleRecovery(room,task){
  if(['night-announcement','lastwords'].includes(task.kind)||this.recoveryTimers.has(task.id))return;
  const timer=setTimeout(()=>{
   this.recoveryTimers.delete(task.id);
   if(current(room)===task&&task.status==='failed')this.skip(room,task.id,'HOST_AUTO_RECOVERED');
  },1000);
  timer.unref?.();this.recoveryTimers.set(task.id,timer);
 }
 clearRecovery(task){const timer=this.recoveryTimers.get(task.id);if(timer){clearTimeout(timer);this.recoveryTimers.delete(task.id);}}
 armWatchdog(task){task.watchdogDeadlineAt=this.now()+this.watchdogMs+(task.durationMs||0);}
 tick(room,now=this.now()){
  this.prune(room,now);
  const task=current(room);
  if(task?.status!=='ready'||!task.watchdogDeadlineAt||now<task.watchdogDeadlineAt)return false;
  return this.timeout(room,task,now);
 }
 timeout(room,task,now=this.now()){
  if(current(room)!==task||task.status!=='ready'||!task.watchdogDeadlineAt||now<task.watchdogDeadlineAt)return false;
  if(this.streams.get(task.id)?.playing&&!['night-announcement','lastwords'].includes(task.kind)){this.armWatchdog(task);this.publish(room);return false;}
  const deadlineAt=task.watchdogDeadlineAt;
  task.status='failed';task.errorCode='HOST_PLAYBACK_TIMEOUT';task.watchdogDeadlineAt=null;room.hostPlaybackError=task.errorCode;
  this.aborts.get(room.roomId)?.abort();this.streams.get(task.id)?.fail(task.errorCode);
  if(task.kind==='speech'&&room.speechPlayback?.status==='pending')pauseSpeechPlayback(room,{speechId:room.speechPlayback.speechId,taskId:task.id,errorCode:task.errorCode});
  this.scheduleRecovery(room,task);
  recordTurn('host_playback_timeout',{roomId:room.roomId,gameId:room.gameId,seatId:task.seatId,taskId:task.id,attemptId:task.attemptId,stage:'ready',deadlineAt:new Date(deadlineAt).toISOString(),errorCode:task.errorCode});
  this.publish(room);return true;
 }
 async generate(room,task){
  const gameId=room.gameId,abort=new AbortController();this.aborts.set(room.roomId,abort);task.status='generating';task.attemptId=randomUUID();task.watchdogDeadlineAt=null;
  const stream=new AudioStream({gameId,taskId:task.id,attemptId:task.attemptId});this.streams.set(task.id,stream);
  const diagnostic=(type,data={})=>recordTurn('host_'+type,{roomId:room.roomId,gameId,taskId:task.id,attemptId:task.attemptId,...data});diagnostic('dequeued');this.publish(room);
  try{
   if(!task.audioPath){diagnostic('connection_start');await this.manager.ensureConnected(room,{seatId:'HOST'});diagnostic('connection_end');}
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted)return;
   let wav;
   if(task.audioPath){
    diagnostic('audio_file_started');
    wav=await readFile(task.audioPath);
    if(wav.subarray(0,4).toString()!=='RIFF'||wav.subarray(8,12).toString()!=='WAVE'||wav.length<=44)throw Error('PUBLIC_AUDIO_INVALID');
    stream.append(wav.subarray(44));
   } else {
    if(task.text.length>1200)throw Error('PUBLIC_TEXT_TOO_LONG');
    diagnostic('tts_started');
    wav=await this.speak(this.manager.clientFor(room,'HOST'),task.text,{signal:abort.signal,voiceId:task.voiceId,diagnostic,onAudio:pcm=>{if(!abort.signal.aborted&&!done(task))stream.append(pcm);}});
   }
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted||done(task))return;
   if(!stream.bytes&&wav.subarray(0,4).toString()==='RIFF')stream.append(wav.subarray(44));stream.end();this.audio.set(task.id,wav);task.durationMs=Math.max(0,Math.ceil((wav.length-44)/32));task.status='ready';this.armWatchdog(task);
   recordTurn('host_tts_ready',{roomId:room.roomId,gameId:room.gameId,seatId:task.seatId,eventId:task.eventId,taskId:task.id,watchdogDeadlineAt:new Date(task.watchdogDeadlineAt).toISOString()});
  }catch(error){
   stream.fail(error.message==='HOST_TEXT_MISMATCH'?'HOST_TEXT_MISMATCH':'HOST_AUDIO_FAILED');
   if(!room.invalidated&&room.gameId===gameId&&!done(task)){
    if(!task.audioPath)this.manager.clientFor(room,'HOST')?.close?.();task.attempts=(task.attempts||0)+1;task.errorCode='HOST_AUDIO_FAILED';task.watchdogDeadlineAt=null;
    if(task.status!=='failed'&&task.attempts<2&&!stream.playing&&error.message!=='HOST_TEXT_MISMATCH'){task.status='pending';}
    else{task.status='failed';if(task.kind==='speech'&&room.speechPlayback?.taskId===task.id&&room.speechPlayback.status==='pending')pauseSpeechPlayback(room,{speechId:room.speechPlayback.speechId,taskId:task.id,errorCode:task.errorCode});}
    if(task.status==='failed')this.scheduleRecovery(room,task);
   }
  }finally{this.aborts.delete(room.roomId);this.publish(room);}
 }
 prune(room,now=this.now()){
  const completed=(room.hostTasks||[]).filter(done);
  const remove=new Set(completed.filter((t,i)=>i<completed.length-Math.max(0,80-((room.hostTasks||[]).length-completed.length)) || (t.finishedAt!==undefined && now-t.finishedAt>=600000)).map(t=>t.id));
  for(const id of remove){this.audio.delete(id);this.streams.delete(id);}
  if(remove.size)room.hostTasks=room.hostTasks.filter(t=>!remove.has(t.id));
 }
 tasks(room,after=0){
  if(!Number.isSafeInteger(after)||after<0)throw Error('无效播放序号');
  this.prune(room);
  const tasks=(room.hostTasks||[]).filter(t=>t.sequence>after).map(t=>({sequence:t.sequence,id:t.id,eventId:t.eventId,seatId:t.seatId,kind:t.kind,source:t.source,text:t.text,attemptId:t.attemptId,gameId:room.gameId,status:t.status,errorCode:t.errorCode}));
  return {tasks,oldestSequence:room.hostTasks?.[0]?.sequence??((room.hostTaskSequence||0)+1),latestSequence:room.hostTaskSequence||0};
 }
 state(room){
  const task=current(room);const hostController=room.controllers?.find(c=>c.seatId==='HOST');
  return {controller:hostController?{status:hostController.status,errorCode:hostController.errorCode}:null,enabled:Boolean(room.hostPlaybackEnabled),blocked:Boolean(room.hostPlaybackBlocked),errorCode:room.hostPlaybackError||task?.errorCode||null,watchdogDeadlineAt:task?.watchdogDeadlineAt?new Date(task.watchdogDeadlineAt).toISOString():null,recoveryRequired:Boolean(task&&['failed','paused'].includes(task.status)),task:task?{sequence:task.sequence,id:task.id,eventId:task.eventId,seatId:task.seatId,kind:task.kind,source:task.source,text:task.text,attemptId:task.attemptId,gameId:room.gameId,status:task.status,errorCode:task.errorCode}:null};
 }
 stream(room,id,res){
  this.prune(room);
  const task=room.hostTasks?.find(t=>t.id===id),stream=this.streams.get(id);if(room.invalidated||!stream||!['generating','ready','played'].includes(task?.status))throw Error('播放任务已失效');
  res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store','access-control-allow-origin':'*','x-accel-buffering':'no'});
  let closed=false;const unsubscribe=stream.subscribe(message=>{if(closed)return;if(res.writableLength>3000000){closed=true;res.destroy();return;}res.write(JSON.stringify(message)+'\n');if(['end','error'].includes(message.type))res.end();});
  res.on('close',()=>{closed=true;unsubscribe();});
 }
 playbackStarted(room,id,attemptId){const t=current(room),stream=this.streams.get(id);if(room.invalidated||t?.id!==id||t.attemptId!==attemptId||!stream||!['generating','ready'].includes(t.status))throw Error('播放任务已失效');stream.playing=true;recordTurn('host_browser_started',{roomId:room.roomId,gameId:room.gameId,taskId:id,attemptId,stage:t.status,deadlineAt:t.watchdogDeadlineAt?new Date(t.watchdogDeadlineAt).toISOString():null,errorCode:null});}
 playbackFailed(room,id,attemptId){const t=current(room);if(room.invalidated||t?.id!==id||t.attemptId!==attemptId||!['generating','ready'].includes(t.status))throw Error('播放任务已失效');const deadlineAt=t.watchdogDeadlineAt;t.status='failed';t.errorCode='HOST_PLAYBACK_INTERRUPTED';t.watchdogDeadlineAt=null;this.aborts.get(room.roomId)?.abort();this.streams.get(id)?.fail(t.errorCode);if(t.kind==='speech'&&room.speechPlayback?.status==='pending')pauseSpeechPlayback(room,{speechId:room.speechPlayback.speechId,taskId:id,errorCode:t.errorCode});this.scheduleRecovery(room,t);recordTurn('host_browser_interrupted',{roomId:room.roomId,gameId:room.gameId,taskId:id,attemptId,stage:'ready',deadlineAt:deadlineAt?new Date(deadlineAt).toISOString():null,errorCode:t.errorCode});this.publish(room);}
 getAudio(room,id){const t=current(room);if(room.invalidated||t?.id!==id||t.status!=='ready'||!this.audio.has(id))throw Error('公共音频尚未就绪');return this.audio.get(id);}
 acknowledge(room,id,attemptId){const t=current(room);if(room.invalidated||t?.id!==id||t.status!=='ready'||!attemptId||attemptId!==t.attemptId)throw Error('播放任务已失效');this.clearRecovery(t);const beforeSeat=room.currentSeatId;if(t.kind==='speech')completeSpeechPlayback(room,{speechId:room.speechPlayback?.speechId,taskId:t.id});if(t.kind==='lastwords')completeLastWordsPlayback(room,t.lastWordsId);if(t.kind==='night-announcement')completeNightAnnouncement(room,t.windowId);t.status='played';t.finishedAt=this.now();t.watchdogDeadlineAt=null;room.hostPlaybackError=null;recordTurn('host_played_ack',{roomId:room.roomId,gameId:room.gameId,seatId:t.seatId,eventId:t.eventId,taskId:id});if(room.currentSeatId!==beforeSeat)recordTurn('next_turn_opened',{roomId:room.roomId,gameId:room.gameId,seatId:room.currentSeatId});this.sync(room);this.publish(room);}
 skip(room,id,reason='HOST_TASK_CANCELLED'){const t=current(room);if(room.invalidated||t?.id!==id)throw Error('播放任务已失效');if(['night-announcement','lastwords'].includes(t.kind))throw Error('入夜与遗言播报必须播放成功，请重试');this.clearRecovery(t);if(t.kind==='speech')completeSpeechPlayback(room,{speechId:room.speechPlayback?.speechId,taskId:t.id,status:'skipped'});t.status='skipped';t.finishedAt=this.now();t.watchdogDeadlineAt=null;this.aborts.get(room.roomId)?.abort();this.audio.delete(id);this.streams.get(id)?.fail(reason);this.streams.delete(id);room.hostPlaybackError=null;this.sync(room);this.publish(room);}
 async retry(room){const t=current(room),gameId=room.gameId;if(!['failed','ready'].includes(t?.status)||this.running.has(room.roomId))throw Error('没有可重试的公共任务');if(!t.audioPath)await this.manager.retry(room,'HOST');if(room.invalidated||room.gameId!==gameId||current(room)!==t)throw Error('播放任务已失效');if(t.kind==='speech'&&room.speechPlayback?.status==='paused')retrySpeechPlayback(room,{speechId:room.speechPlayback?.speechId,taskId:t.id});this.streams.get(t.id)?.fail('HOST_ATTEMPT_REPLACED');this.streams.delete(t.id);this.audio.delete(t.id);t.status='pending';t.watchdogDeadlineAt=null;t.attemptId=null;t.errorCode=null;room.hostPlaybackError=null;t.attempts=0;this.sync(room);this.publish(room);}
 cancel(room){this.aborts.get(room.roomId)?.abort();for(const t of room.hostTasks||[]){this.clearRecovery(t);this.audio.delete(t.id);this.streams.get(t.id)?.fail('HOST_TASK_CANCELLED');this.streams.delete(t.id);t.watchdogDeadlineAt=null;}room.hostTasks=[];room.hostPlaybackBlocked=false;room.hostPlaybackError=null;}
}
