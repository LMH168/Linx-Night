window.createHostPlayer=({call,state,message,refresh})=>{
 let enabled=false,busy=false,epoch=0,audio,url,request,timer;
 const status=t=>{document.getElementById('hostStatus').textContent=t;};
 const stop=()=>{enabled=false;epoch++;request?.abort();audio?.pause();audio=null;if(url)URL.revokeObjectURL(url);url=null;document.getElementById('hostEnable').textContent='启用主持声音';status('已停止，当前任务未确认完成');};
 async function poll(){
  if(!state.roomId||busy)return;busy=true;const key=state.roomId,run=epoch;
  try{
   const s=await call(`/api/rooms/${key}/host/state`);if(key!==state.roomId||run!==epoch)return;
   status(s.task?`主持：${s.task.status} · ${s.task.text}`:`主持 ${s.controller?.status||'未连接'}：等待下一阶段`);
   document.getElementById('hostRetry').hidden=s.task?.status!=='failed';
   if(!enabled||s.task?.status!=='ready')return;
   request=new AbortController();const data=await call(`/api/rooms/${key}/host/audio?task_id=${encodeURIComponent(s.task.id)}`,{signal:request.signal});
   if(!enabled||run!==epoch||key!==state.roomId)return;
   url=URL.createObjectURL(new Blob([Uint8Array.from(atob(data.wav),c=>c.charCodeAt(0))],{type:'audio/wav'}));audio=new Audio(url);
   const ended=await new Promise((resolve,reject)=>{audio.onended=()=>resolve(true);audio.onpause=()=>resolve(false);audio.onerror=reject;audio.play().catch(reject);});
   if(ended&&enabled&&run===epoch&&key===state.roomId){await call(`/api/rooms/${key}/host/played`,{method:'POST',body:JSON.stringify({task_id:s.task.id})});await refresh?.();}
  }catch(e){if(enabled){stop();message('主持播放未完成，请重试：'+e.message);}}
  finally{if(url)URL.revokeObjectURL(url);url=null;audio=null;busy=false;}
 }
 document.getElementById('hostEnable').onclick=()=>{if(enabled){stop();return;}enabled=true;epoch++;document.getElementById('hostEnable').textContent='停止主持声音';void poll();};
 document.getElementById('hostRetry').onclick=async()=>{try{await call(`/api/rooms/${state.roomId}/host/retry`,{method:'POST'});void poll();}catch(e){message(e.message);}};
 timer=setInterval(poll,1000);window.addEventListener('beforeunload',()=>{clearInterval(timer);stop();});
 return {stop};
};
