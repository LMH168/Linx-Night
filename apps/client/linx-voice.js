// Microphone audio goes only to the local service. No platform credentials here.
window.createLinxVoice = ({call,state,message,context,applyDraft}) => {
  let generation=0,recorder,stream,timer,request,audio,url,roomId,watermark=0,enabled=false,playing=false;
  const queue=[];let playbackEpoch=0;
  const status=text=>{document.getElementById('linxVoiceStatus').textContent=text;};
  function stop() {
    generation++;clearTimeout(timer);request?.abort();request=null;
    if(recorder){recorder.onstop=null;recorder.ondataavailable=null;if(recorder.state!=='inactive')recorder.stop();recorder=null;}
    stream?.getTracks().forEach(t=>t.stop());stream=null;
    document.getElementById('linxRecordStop').hidden=true;
  }
  function stopPlayback(){playbackEpoch++;enabled=false;queue.length=0;request?.abort();audio?.pause();audio=null;if(url)URL.revokeObjectURL(url);url=null;document.getElementById('publicVoice').textContent='启用公共播报';}
  async function record() {
    stop();stopPlayback();const run=generation, key=context();
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){status('浏览器不支持录音，请使用文字。');return;}
    try{
      const input=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
      if(run!==generation){input.getTracks().forEach(t=>t.stop());return;}
      stream=input;recorder=new MediaRecorder(input);const chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=async()=>{
        stream?.getTracks().forEach(t=>t.stop());stream=null;clearTimeout(timer);document.getElementById('linxRecordStop').hidden=true;
        if(run!==generation || context()!==key)return;
        let ac;
        try{
          status('灵矽正在转写，请稍候……');ac=new AudioContext();const decoded=await ac.decodeAudioData(await new Blob(chunks).arrayBuffer());
          if(decoded.duration>30)throw new Error('录音请控制在 30 秒内');
          const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
          const pcm=(await offline.startRendering()).getChannelData(0), buffer=new ArrayBuffer(44+pcm.length*2),v=new DataView(buffer);
          const word=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
          word(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);word(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,pcm.length*2,true);pcm.forEach((n,i)=>v.setInt16(44+i*2,Math.max(-1,Math.min(1,n))*32767,true));
          let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);
          if(run!==generation || context()!==key)return;
          request=new AbortController();const result=await call('/api/rooms/'+state.roomId+'/voice/transcribe',{method:'POST',signal:request.signal,body:JSON.stringify({wav:btoa(binary)})});
          if(run!==generation || context()!==key)return;
          applyDraft(result.text);status('转写已填入草稿，请检查后确认提交。');
        }catch(error){if(run===generation)status(error.message || '转写失败，请使用文字。');}finally{await ac?.close();}
      };
      recorder.start();status('正在录音，最多 30 秒；完成后点击结束录音。');document.getElementById('linxRecordStop').hidden=false;timer=setTimeout(()=>recorder?.stop(),29000);
    }catch{status('无法使用麦克风，请检查权限或直接输入。');stop();}
  }
  async function play() {
    if(playing || !enabled)return;playing=true;
    const epoch=playbackEpoch;
    try{while(enabled && epoch===playbackEpoch && queue.length){const event=queue.shift(),currentRoom=roomId;request=new AbortController();const result=await call('/api/rooms/'+currentRoom+'/voice/speak',{method:'POST',signal:request.signal,body:JSON.stringify({event_id:event.eventId})});
      if(!enabled || epoch!==playbackEpoch || currentRoom!==roomId)break;
      const bytes=Uint8Array.from(atob(result.wav),c=>c.charCodeAt(0));url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio=new Audio(url);
      await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onpause=resolve;audio.onerror=reject;audio.play().catch(reject);});URL.revokeObjectURL(url);url=null;
    }}catch{if(epoch===playbackEpoch){stopPlayback();message('公共播报未完成，文字记录仍可查看。');}}finally{playing=false;if(enabled && queue.length)void play();}
  }
  return {
    record,stop,stopPlayback,
    end(){clearTimeout(timer);if(recorder?.state==='recording')recorder.stop();},
    toggle(){if(enabled){stopPlayback();return;}enabled=true;watermark=state.room?.version||0;document.getElementById('publicVoice').textContent='停止公共播报';message('已启用，仅播放之后的新公开事件。');},
    update(room){if(roomId!==room.roomId){stop();stopPlayback();roomId=room.roomId;watermark=room.version;return;}
      const fresh=room.events.filter(e=>e.version>watermark);watermark=Math.max(watermark,room.version);
      if(enabled){queue.push(...fresh.filter(e=>['game.speech_submitted','game.player_eliminated','game.vote_resolved'].includes(e.type) || (e.type==='game.phase_changed' && ['NIGHT_WOLF','NIGHT_SEER','NIGHT_WITCH','SPEECH','VOTE','HUNTER_RESPONSE','GAME_OVER'].includes(e.data?.phase))));if(queue.length>20){stopPlayback();message('播报积压，已停止；请查看文字记录。');}else void play();}
    }
  };
};
