window.createHostPlayer=({call,state,message,refresh})=>{
 const finished=new Set();let enabled=false,busy=false,epoch=0,context,request,timer,taskId,activeRoom,activeAttempt;
 const status=t=>{document.getElementById('hostStatus').textContent=t;};
 const stop=()=>{enabled=false;epoch++;request?.abort();document.getElementById('hostEnable').textContent='启用公共声音';status('播放中断；重新启用将从头播放，未确认完成');};
 async function poll(){
  if(activeRoom&&activeRoom!==state.roomId)stop();activeRoom=state.roomId;
  if(!state.roomId||busy)return;busy=true;const key=state.roomId,run=epoch;let confirming=false,task,started=false;
  try{
   const s=await call(`/api/rooms/${key}/host/state`);if(key!==state.roomId||run!==epoch)return;
   task=s.task;taskId=task?.id;activeAttempt=task?.attemptId;const host=state.room?.hostPlayerId===state.playerId;
   status(task?`${task.seatId||'主持'}：${task.status==='generating'?'等待音频':task.status} · ${task.text}`:'等待下一阶段');
   document.getElementById('hostRetry').hidden=!host||!['failed','ready'].includes(task?.status);
   document.getElementById('hostSkip').hidden=!taskId||!host;
   if(state.voice?.linxRecording||!enabled||!['generating','ready'].includes(task?.status)||!task.attemptId)return;
   const body=()=>JSON.stringify({task_id:task.id,attempt_id:task.attemptId});
   const completionKey=key+':'+task.id+':'+task.attemptId;
   if(finished.has(completionKey)){if(host){confirming=true;await call(`/api/rooms/${key}/host/played`,{method:'POST',body:body()});await refresh?.();}return;}
   request=new AbortController();context??=new (window.AudioContext||window.webkitAudioContext)();
   const response=await call(`/api/rooms/${key}/host/stream?task_id=${encodeURIComponent(task.id)}`,{signal:request.signal,rawResponse:true});
   const result=await window.playPcmStream(response,context,{signal:request.signal,ids:{gameId:task.gameId,taskId:task.id,attemptId:task.attemptId},valid:()=>enabled&&run===epoch&&key===state.roomId,onStatus:status,onStart:async()=>{if(host)await call(`/api/rooms/${key}/host/started`,{method:'POST',body:body(),signal:request.signal});started=true;}});
   if(enabled&&run===epoch&&key===state.roomId){finished.add(completionKey);if(finished.size>100)finished.delete(finished.values().next().value);if(host){confirming=true;await call(`/api/rooms/${key}/host/played`,{method:'POST',body:JSON.stringify({task_id:task.id,attempt_id:task.attemptId,...result})});await refresh?.();}}
  }catch(e){if(enabled){if(confirming)message('播放已结束，确认失败，将重试确认：'+e.message);else{if(!started&&task){const latest=await call(`/api/rooms/${key}/host/state`).catch(()=>null);if(latest?.task?.id===task.id&&(latest.task.attemptId!==task.attemptId||latest.task.status==='pending'))return;}if(task&&state.room?.hostPlayerId===state.playerId)await call(`/api/rooms/${key}/host/interrupted`,{method:'POST',body:JSON.stringify({task_id:task.id,attempt_id:task.attemptId})}).catch(()=>{});stop();message('公共播放中断，请房主重播或跳过：'+e.message);}}}
  finally{busy=false;}
 }
 document.getElementById('hostEnable').onclick=()=>{if(enabled){stop();return;}context??=new (window.AudioContext||window.webkitAudioContext)();void context.resume().catch(()=>{});enabled=true;epoch++;document.getElementById('hostEnable').textContent='停止公共声音';void poll();};
 document.getElementById('hostRetry').onclick=async()=>{stop();try{await call(`/api/rooms/${state.roomId}/host/retry`,{method:'POST'});message('已创建新音频尝试，请启用公共声音从头播放。');}catch(e){message(e.message);}};
 document.getElementById('hostSkip').onclick=async()=>{const id=taskId;stop();try{await call(`/api/rooms/${state.roomId}/host/skip`,{method:'POST',body:JSON.stringify({task_id:id})});await refresh?.();message('已跳过音频，请启用公共声音继续。');}catch(e){message(e.message);}};
 timer=setInterval(poll,1000);window.addEventListener('beforeunload',()=>{clearInterval(timer);stop();void context?.close();});
 return {notify(){if(busy&&enabled&&activeRoom){const key=activeRoom,attempt=activeAttempt;void call(`/api/rooms/${key}/host/state`).then(s=>{if(enabled&&activeRoom===key&&activeAttempt===attempt&&(s.task?.attemptId!==attempt||s.task?.status==='failed'))stop();}).catch(()=>stop());}else void poll();},stop,suspend(){const resume=enabled;stop();return()=>{if(resume&&!enabled){enabled=true;epoch++;document.getElementById('hostEnable').textContent='停止公共声音';void poll();}};}};
};
