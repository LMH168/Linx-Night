import {randomUUID} from 'node:crypto';
import {publicNarration} from './voice.mjs';
import {speakPublic} from '../../linx/src/host-audio.mjs';
const done = task => ['played','skipped'].includes(task.status);
const current = room => room.hostTasks?.find(t => !done(t));
export class HostPlayback {
 constructor({manager,publish=()=>{},speak=speakPublic}={}){this.manager=manager;this.publish=publish;this.speak=speak;this.running=new Map();this.audio=new Map();this.aborts=new Map();}
 sync(room){
  if(!room.hostPlaybackEnabled||room.invalidated||room.phase==='LOBBY')return;
  room.hostTasks??=[];room.hostEventCursor??=0;room.hostNarratedEventIds??=new Set();
  for(const e of room.events.filter(e=>e.version>room.hostEventCursor)){
   if(room.hostNarratedEventIds.has(e.eventId)){room.hostEventCursor=e.version;continue;}
   if(!['game.speech_submitted','game.night_resolved','game.phase_changed','game.player_eliminated','game.vote_resolved','game.hunter_response_closed'].includes(e.type)){room.hostEventCursor=e.version;continue;}
   let text;try{text=publicNarration(room,e.eventId);}catch{room.hostEventCursor=e.version;continue;}
   if(room.hostTasks.filter(t=>!done(t)).length>=40){room.hostPlaybackError='HOST_QUEUE_FULL';break;}
   const seat=room.seats.find(s=>s.seatId===e.data?.seatId);
   const speaker=e.type==='game.speech_submitted' && seat?.playerType==='ai' ? seat.seatId : 'HOST';
   room.hostEventCursor=e.version;room.hostNarratedEventIds.add(e.eventId);room.hostTasks.push({id:randomUUID(),eventId:e.eventId,seatId:e.type==='game.speech_submitted'?e.data.seatId:null,kind:e.type==='game.speech_submitted'?'speech':'host',voiceId:room.publicVoices?.[speaker],text,status:'pending',errorCode:null});
  }
  while(room.hostTasks.length>80&&done(room.hostTasks[0])){const old=room.hostTasks.shift();this.audio.delete(old.id);}
  const task=current(room);room.hostPlaybackBlocked=Boolean(task)||Boolean(room.hostPlaybackError);
  if(task?.status==='pending'&&!this.running.has(room.roomId)){
   const work=Promise.resolve().then(()=>this.generate(room,task)).finally(()=>this.running.delete(room.roomId));this.running.set(room.roomId,work);
  }
 }
 async generate(room,task){
  const gameId=room.gameId,abort=new AbortController();this.aborts.set(room.roomId,abort);task.status='generating';this.publish(room);
  try{
   await this.manager.ensureConnected(room,{seatId:'HOST'});
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted)return;
   if(task.text.length>1200)throw Error('PUBLIC_TEXT_TOO_LONG');
   const wav=await this.speak(this.manager.clientFor(room,'HOST'),task.text,{signal:abort.signal,voiceId:task.voiceId});
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted||done(task))return;
   this.audio.set(task.id,wav);task.status='ready';
  }catch{if(!room.invalidated&&room.gameId===gameId&&!done(task)){this.manager.clientFor(room,'HOST')?.close?.();task.status='failed';task.errorCode='HOST_AUDIO_FAILED';}}
  finally{this.aborts.delete(room.roomId);this.publish(room);}
 }
 state(room){const task=current(room);return {controller:room.controllers?.find(c=>c.seatId==='HOST') ? {status:room.controllers.find(c=>c.seatId==='HOST').status,errorCode:room.controllers.find(c=>c.seatId==='HOST').errorCode}:null,enabled:Boolean(room.hostPlaybackEnabled),blocked:Boolean(room.hostPlaybackBlocked),errorCode:room.hostPlaybackError||null,task:task?{id:task.id,eventId:task.eventId,seatId:task.seatId,kind:task.kind,text:task.text,status:task.status,errorCode:task.errorCode}:null};}
 getAudio(room,id){const t=current(room);if(room.invalidated||t?.id!==id||t.status!=='ready'||!this.audio.has(id))throw Error('公共音频尚未就绪');return this.audio.get(id);}
 acknowledge(room,id){const t=current(room);if(room.invalidated||t?.id!==id||t.status!=='ready')throw Error('播放任务已失效');t.status='played';this.audio.delete(id);room.hostPlaybackError=null;this.sync(room);this.publish(room);}
 skip(room,id){const t=current(room);if(room.invalidated||t?.id!==id)throw Error('播放任务已失效');t.status='skipped';this.aborts.get(room.roomId)?.abort();this.audio.delete(id);room.hostPlaybackError=null;this.sync(room);this.publish(room);}
 async retry(room){const t=current(room),gameId=room.gameId;if(t?.status!=='failed'||this.running.has(room.roomId))throw Error('没有可重试的公共任务');await this.manager.retry(room,'HOST');if(room.invalidated||room.gameId!==gameId||current(room)!==t)throw Error('播放任务已失效');t.status='pending';t.errorCode=null;this.sync(room);this.publish(room);}
 cancel(room){this.aborts.get(room.roomId)?.abort();for(const t of room.hostTasks||[])this.audio.delete(t.id);room.hostTasks=[];room.hostPlaybackBlocked=false;room.hostPlaybackError=null;}
}
