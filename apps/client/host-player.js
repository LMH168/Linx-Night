window.createHostPlayer=({call,state,message,refresh})=>{
 const finished=new Set();
 let enabled=false,busy=false,epoch=0,audio,url,request,timer;
 const status=t=>{document.getElementById('hostStatus').textContent=t;};
 const stop=()=>{enabled=false;epoch++;request?.abort();audio?.pause();audio?.remove?.();audio=null;if(url)URL.revokeObjectURL(url);url=null;document.getElementById('hostEnable').textContent='启用主持声音';status('已停止，当前任务未确认完成');};
 async function poll(){
  if(!state.roomId||busy)return;busy=true;const key=state.roomId,run=epoch;let confirming=false;
  try{
   const s=await call(`/api/rooms/${key}/host/state`);if(key!==state.roomId||run!==epoch)return;
   status(s.task?`主持：${s.task.status} · ${s.task.text}`:`主持 ${s.controller?.status||'未连接'}：等待下一阶段`);
   document.getElementById('hostRetry').hidden=s.task?.status!=='failed';
   if(!enabled||s.task?.status!=='ready')return;
   const completionKey=key+':'+s.task.id;
   if(finished.has(completionKey)){confirming=true;await call(`/api/rooms/${key}/host/played`,{method:'POST',body:JSON.stringify({task_id:s.task.id})});await refresh?.();return;}
   request=new AbortController();const data=await call(`/api/rooms/${key}/host/audio?task_id=${encodeURIComponent(s.task.id)}`,{signal:request.signal});
   if(!enabled||run!==epoch||key!==state.roomId)return;
   url=URL.createObjectURL(new Blob([Uint8Array.from(atob(data.wav),c=>c.charCodeAt(0))],{type:'audio/wav'}));audio=new Audio(url);
   audio.controls=true;audio.setAttribute?.('aria-label','主持播报播放器');document.getElementById('hostStatus').after?.(audio);
   // Browsers dispatch pause before ended at the natural end of playback.
   const playing=audio;
   const ended=await new Promise((resolve,reject)=>{playing.onended=()=>resolve(true);playing.onpause=()=>resolve(playing.ended===true);playing.onerror=reject;playing.play().catch(reject);});
   if(ended&&enabled&&run===epoch&&key===state.roomId){finished.add(completionKey);confirming=true;await call(`/api/rooms/${key}/host/played`,{method:'POST',body:JSON.stringify({task_id:s.task.id})});await refresh?.();}
  }catch(e){if(enabled){if(confirming){message('主持播放确认失败，将重试确认：'+e.message);}else{stop();message('主持播放未完成，请重试：'+e.message);}}}
  finally{audio?.remove?.();if(url)URL.revokeObjectURL(url);url=null;audio=null;busy=false;}
 }
 document.getElementById('hostEnable').onclick=()=>{if(enabled){stop();return;}enabled=true;epoch++;document.getElementById('hostEnable').textContent='停止主持声音';void poll();};
 document.getElementById('hostRetry').onclick=async()=>{try{await call(`/api/rooms/${state.roomId}/host/retry`,{method:'POST'});void poll();}catch(e){message(e.message);}};
 timer=setInterval(poll,1000);window.addEventListener('beforeunload',()=>{clearInterval(timer);stop();});
 return {stop};
};
