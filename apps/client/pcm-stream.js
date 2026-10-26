// PCM transport validation and Web Audio scheduling; no game-state advancement here.
window.playPcmStream=async(response,context,{signal,onStart=()=>{},onStatus=()=>{},valid=()=>true,ids}={})=>{
 const reader=response.body.getReader(),decoder=new TextDecoder();
 const sources=new Set();let line='',started=false,ended=false,chunks=0,samples=0,queued=[],queuedSamples=0,nextTime=0,lastEnd=Promise.resolve(),firstChunkAt,firstPlayMs,playStartedAt;
 const stop=()=>{for(const source of sources){source.onended?.();try{source.stop();}catch{}}sources.clear();void reader.cancel().catch(()=>{});};
 signal?.addEventListener('abort',stop,{once:true});
 const schedule=async()=>{
  if(!queued.length)return;
  if(!started){await context.resume();signal?.throwIfAborted();if(!valid())throw Error('播放已取消');await onStart();signal?.throwIfAborted();firstPlayMs=performance.now()-firstChunkAt;playStartedAt=performance.now();started=true;onStatus('播放中');}
  for(const pcm of queued){const buffer=context.createBuffer(1,pcm.length/2,16000),target=buffer.getChannelData(0),view=new DataView(pcm.buffer,pcm.byteOffset,pcm.byteLength);for(let i=0;i<target.length;i++)target[i]=view.getInt16(i*2,true)/32768;
   const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);sources.add(source);lastEnd=new Promise(resolve=>{source.onended=()=>{sources.delete(source);resolve();};});nextTime=Math.max(nextTime,context.currentTime+0.015);source.start(nextTime);nextTime+=buffer.duration;
  }queued=[];queuedSamples=0;
 };
 try{
  while(true){signal?.throwIfAborted();if(!valid())throw Error('播放已取消');const {value,done}=await reader.read();if(done)break;line+=decoder.decode(value,{stream:true});if(line.length>3000000)throw Error('音频消息过长');
   let index;while((index=line.indexOf('\n'))>=0){const raw=line.slice(0,index);line=line.slice(index+1);if(!raw)continue;const m=JSON.parse(raw);if(ended||!['start','audio','end','error'].includes(m.type)||['gameId','taskId','attemptId'].some(k=>m[k]!==ids[k]))throw Error('音频任务不匹配');
    if(m.type==='error')throw Error(m.code||'音频中断');
    if(m.type==='start'){if(chunks||samples||ids.started||m.sampleRate!==16000||m.channels!==1||m.format!=='s16le')throw Error('音频格式错误');ids={...ids,started:true};continue;}
    if(!ids.started)throw Error('缺少音频起点');
    if(m.type==='audio'){if(m.seq!==chunks++||typeof m.data!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.data))throw Error('音频块顺序错误');const pcm=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0));if(!pcm.length||pcm.length%2||(samples+=pcm.length/2)>960000)throw Error('音频长度错误');firstChunkAt??=performance.now();queued.push(pcm);queuedSamples+=pcm.length/2;if(started||queuedSamples>=4000)await schedule();}
    if(m.type==='end'){if(!chunks||m.chunks!==chunks||m.samples!==samples)throw Error('音频不完整');ended=true;await schedule();}
   }
  }
  if(!ended||line.trim())throw Error('音频流截断');await lastEnd;signal?.throwIfAborted();if(!valid())throw Error('播放已取消');return {samples,firstPlayMs,playbackMs:performance.now()-playStartedAt};
 }catch(error){stop();throw error;}finally{signal?.removeEventListener('abort',stop);reader.releaseLock();}
};
