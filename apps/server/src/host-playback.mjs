import {randomUUID} from 'node:crypto';
import {publicNarration} from './voice.mjs';
import {speakPublic} from '../../linx/src/host-audio.mjs';
export class HostPlayback {
 constructor({manager,publish=()=>{},speak=speakPublic}={}){this.manager=manager;this.publish=publish;this.speak=speak;this.running=new Map();this.audio=new Map();this.aborts=new Map();}
 sync(room){
  if(!room.hostPlaybackEnabled||room.invalidated||room.phase==='LOBBY')return;
  room.hostTasks??=[];room.hostEventCursor??=0;
  for(const e of room.events.filter(e=>e.version>room.hostEventCursor)){
   if(!['game.phase_changed','game.player_eliminated','game.vote_resolved','game.hunter_response_closed'].includes(e.type)){room.hostEventCursor=e.version;continue;}
   let text;try{text=publicNarration(room,e.eventId);}catch{room.hostEventCursor=e.version;continue;}
   if(room.hostTasks.filter(t=>t.status!=='played').length>=40){room.hostPlaybackError='HOST_QUEUE_FULL';break;}
   room.hostEventCursor=e.version;room.hostTasks.push({id:randomUUID(),eventId:e.eventId,text,status:'pending',errorCode:null});
  }
  while(room.hostTasks.length>80&&room.hostTasks[0].status==='played'){const old=room.hostTasks.shift();this.audio.delete(old.id);}
  const task=room.hostTasks.find(t=>t.status!=='played');room.hostPlaybackBlocked=Boolean(task)||Boolean(room.hostPlaybackError);
  if(task?.status==='pending'&&!this.running.has(room.roomId)){
   const work=Promise.resolve().then(()=>this.generate(room,task)).finally(()=>this.running.delete(room.roomId));this.running.set(room.roomId,work);
  }
 }
 async generate(room,task){
  const gameId=room.gameId,abort=new AbortController();this.aborts.set(room.roomId,abort);task.status='generating';this.publish(room);
  try{
   await this.manager.ensureConnected(room,{seatId:'HOST'});
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted)return;
   const wav=await this.speak(this.manager.clientFor(room,'HOST'),task.text,{signal:abort.signal});
   if(room.invalidated||room.gameId!==gameId||abort.signal.aborted)return;
   this.audio.set(task.id,wav);task.status='ready';
  }catch{if(!room.invalidated&&room.gameId===gameId){this.manager.clientFor(room,'HOST')?.close?.();task.status='failed';task.errorCode='HOST_AUDIO_FAILED';}}
  finally{this.aborts.delete(room.roomId);this.publish(room);}
 }
 state(room){const task=room.hostTasks?.find(t=>t.status!=='played');return {controller:room.controllers?.find(c=>c.seatId==='HOST') ? {status:room.controllers.find(c=>c.seatId==='HOST').status,errorCode:room.controllers.find(c=>c.seatId==='HOST').errorCode}:null,enabled:Boolean(room.hostPlaybackEnabled),blocked:Boolean(room.hostPlaybackBlocked),errorCode:room.hostPlaybackError||null,task:task?{id:task.id,text:task.text,status:task.status,errorCode:task.errorCode}:null};}
 getAudio(room,id){const t=room.hostTasks?.find(t=>t.status!=='played');if(t?.id!==id||t.status!=='ready'||!this.audio.has(id))throw Error('主持音频尚未就绪');return this.audio.get(id);}
 acknowledge(room,id){const t=room.hostTasks?.find(t=>t.status!=='played');if(t?.id!==id||t.status!=='ready')throw Error('播放任务已失效');t.status='played';this.audio.delete(id);room.hostPlaybackError=null;this.sync(room);this.publish(room);}
 async retry(room){const t=room.hostTasks?.find(t=>t.status!=='played');if(t?.status!=='failed'||this.running.has(room.roomId))throw Error('没有可重试的主持任务');await this.manager.retry(room,'HOST');t.status='pending';t.errorCode=null;this.sync(room);this.publish(room);}
 cancel(room){this.aborts.get(room.roomId)?.abort();for(const t of room.hostTasks||[])this.audio.delete(t.id);room.hostTasks=[];room.hostPlaybackBlocked=false;room.hostPlaybackError=null;}
}
