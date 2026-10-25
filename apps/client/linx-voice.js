// Microphone audio goes only to the local service. No platform credentials here.
window.createLinxVoice = ({call,state,message,context,applyDraft,suspendPlayback=()=>()=>{}}) => {
  let generation=0,recorder,stream,timer,request,roomId,recording,recordContext,resumePlayback;

  const status=text=>{document.getElementById('linxVoiceStatus').textContent=text;};
  function stop() {
    const old=recording;recording=null;
    if(old)void call('/api/rooms/'+old.roomId+'/voice/recording-cancel',{method:'POST',body:JSON.stringify({recording_id:old.recordingId})}).catch(()=>{});
    if(state.voice)state.voice.linxRecording=false;
    generation++;clearTimeout(timer);request?.abort();request=null;
    if(recorder){recorder.onstop=null;recorder.ondataavailable=null;if(recorder.state!=='inactive')recorder.stop();recorder=null;}
    stream?.getTracks().forEach(t=>t.stop());stream=null;
    resumePlayback?.();resumePlayback=null;
    document.getElementById('linxRecordStop').hidden=true;
  }
  async function record() {
    stop();const run=generation, key=context();resumePlayback=suspendPlayback();if(state.voice)state.voice.linxRecording=true;
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){status('浏览器不支持录音，请使用文字。');stop();return;}
    try{
      const input=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
      if(run!==generation){input.getTracks().forEach(t=>t.stop());return;}
      stream=input;
      let remaining=30000;
      if(state.room?.phase==='SPEECH'){
        const armed=await call('/api/rooms/'+state.roomId+'/voice/recording-start',{method:'POST',body:'{}'});
        if(run!==generation||context()!==key){void call('/api/rooms/'+state.roomId+'/voice/recording-cancel',{method:'POST',body:JSON.stringify({recording_id:armed.recordingId})}).catch(()=>{});input.getTracks().forEach(t=>t.stop());return;}
        recording={...armed,roomId:state.roomId};remaining=armed.deadline-Date.now();
        if(remaining<=0)throw Error('发言时间已到');
      }
      if(state.voice)state.voice.linxRecording=true;recordContext=key;
      recorder=new MediaRecorder(input);const chunks=[];
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
          request=new AbortController();const result=await call('/api/rooms/'+state.roomId+'/voice/transcribe',{method:'POST',signal:request.signal,body:JSON.stringify({wav:btoa(binary),recording_id:recording?.recordingId})});
          if(run!==generation || context()!==key)return;
          recording=null;applyDraft(result.text);status('转写已填入草稿，请在确认时间内检查并提交。');
        }catch(error){if(run===generation){status(error.message || '转写失败，请使用文字。');stop();}}finally{if(run===generation){if(state.voice)state.voice.linxRecording=false;resumePlayback?.();resumePlayback=null;}await ac?.close();}
      };
      recorder.start();status('正在录音；到发言截止时间自动结束。');document.getElementById('linxRecordStop').hidden=false;timer=setTimeout(()=>recorder?.stop(),Math.max(1,remaining-200));
    }catch{status('无法使用麦克风，请检查权限或直接输入。');stop();}
  }
  return {
    record,stop,

    end(){clearTimeout(timer);if(recorder?.state==='recording')recorder.stop();},
    update(room){if(roomId!==room.roomId||(recordContext&&recordContext!==context())){stop();roomId=room.roomId;recordContext=null;}}
  };
};
