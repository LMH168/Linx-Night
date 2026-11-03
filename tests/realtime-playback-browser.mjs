// Local real-browser acceptance. Requires Playwright and a Chromium executable.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer as createVite } from 'vite';
import { createApiServer, rooms } from '../apps/server/src/api.mjs';
import { createRoom, addPlayer } from '../packages/domain/src/model.mjs';
import { HostPlayback } from '../apps/server/src/host-playback.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir=await mkdtemp(join(tmpdir(),'browser-voice-'));process.env.LINX_PUBLIC_AUDIO_DIR=dir;
const playback=new HostPlayback({watchdogMs:60000});
const {server}=createApiServer({hostPlayback:playback,voice:async()=>({text:'五号值得怀疑'}),realtimeVoice:()=>{throw Error('unused');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const api=`http://127.0.0.1:${server.address().port}`;
const vite=await createVite({configFile:false,root:process.cwd(),server:{port:0,host:'127.0.0.1',proxy:{'/api':{target:api,ws:true}}}});await vite.listen();
const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--autoplay-policy=no-user-gesture-required'],headless:true});
try {
 for(const kind of ['speech','lastwords']) {
  const room=createRoom({hostPlayerId:'speaker'});addPlayer(room,{playerId:'speaker',displayName:'A'});addPlayer(room,{playerId:'listener',displayName:'B'});
  room.gameId='browser-game';room.phase=kind==='speech'?'SPEECH':'LAST_WORDS';room.currentSeatId='P1';room.hostPlaybackEnabled=true;
  room.seats.forEach((s,i)=>{s.role=i===1?'werewolf':'villager';s.camp=i===1?'werewolf':'good';});
  if(kind==='lastwords'){room.lastWords={windowId:'w',lastWordsId:'w',seatId:'P1',round:0,cause:'vote',status:'open',expiresAt:new Date(Date.now()+30000).toISOString()};room.lastWordsContinuation='NIGHT_WOLF';}
  rooms.set(room.roomId,room);
  const a=await browser.newContext({permissions:['local-network-access']}),b=await browser.newContext({permissions:['local-network-access']}),speaker=await a.newPage(),listener=await b.newPage();
  for(const page of [speaker,listener]) {page.on('console',m=>{if(m.type()==='error')console.error(m.text());});page.on('requestfailed',r=>console.error(r.url(),r.failure()));await page.route('**/voice-acceptance',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Voice acceptance</title>'}));await page.goto(origin+'/voice-acceptance');}
  await listener.evaluate(() => import('/apps/client-vue/src/composables/useHostPlayback.ts'));
  const base=origin+'/api/rooms/'+room.roomId;
  const sending=speaker.evaluate(async({base,kind})=>{
   const response=await fetch(base+'/voice/recording-start',{method:'POST',headers:{'content-type':'application/json','x-player-id':'speaker'},body:'{}'});const recording=await response.json();if(!response.ok)throw Error(JSON.stringify(recording));
   const ws=new WebSocket(base.replace('http:','ws:')+`/voice/realtime?player_id=speaker&mode=${kind}&recording_id=${recording.recordingId}`);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.send(JSON.stringify({type:'start'}));window.firstSent=Date.now();window.doneSending=false;
   ws.send(JSON.stringify({type:'transcript',recording_id:recording.recordingId,text:kind==='speech'?'五号值得怀疑':'遗言请观察五号',revision:1,source:'browser_transcription'}));
   for(let i=0;i<500;i++){const pcm=new Int16Array(320);for(let j=0;j<320;j++)pcm[j]=Math.round(Math.sin((i*320+j)*2*Math.PI*440/16000)*8000);ws.send(pcm.buffer);await new Promise(r=>setTimeout(r,20));}
   window.doneSending=true;ws.send(JSON.stringify({type:'stop'}));await new Promise((r,j)=>{ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='accepted')r();if(m.type==='error')j(Error(m.message));};});return {firstSent:window.firstSent,ended:Date.now()};
  },{base,kind});
  while(!room.hostTasks?.length)await new Promise(r=>setTimeout(r,20));
  const task=playback.tasks(room).tasks[0];
  const listening=listener.evaluate(async({base,task})=>{
   const {playPcmStream}=await import('/apps/client-vue/src/composables/useHostPlayback.ts');
   const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=1024;analyser.connect(context.destination);
   const create=context.createBufferSource.bind(context);context.createBufferSource=()=>{const source=create(),connect=source.connect.bind(source);source.connect=(...args)=>connect(args[0]===context.destination?analyser:args[0]);return source;};
   let firstAudible;const timer=setInterval(()=>{const samples=new Float32Array(1024);analyser.getFloatTimeDomainData(samples);if(!firstAudible&&samples.some(s=>Math.abs(s)>0.01))firstAudible=Date.now();},10);
   try{const response=await fetch(base+'/host/stream?task_id='+task.id,{headers:{'x-player-id':'listener'}});const result=await playPcmStream(response,context,{ids:{gameId:task.gameId,taskId:task.id,attemptId:task.attemptId}});return {firstAudible,...result};}finally{clearInterval(timer);await context.close();}
  },{base,task});
  const [sent,heard]=await Promise.all([sending,listening]);assert.ok(heard.firstAudible);const latency=heard.firstAudible-sent.firstSent;assert.ok(latency<2000,`${kind}: ${latency} ms`);assert.ok(heard.firstAudible<sent.ended);assert.equal(heard.samples,160000);
  assert.equal(room.liveTranscript,undefined);
  const confirmed=kind==='speech'?room.speeches.at(-1):room.lastWordsHistory.at(-1);
  assert.equal(confirmed.text,kind==='speech'?'五号值得怀疑':'遗言请观察五号');assert.equal(confirmed.transcriptionStatus,'completed');
  console.log(JSON.stringify({kind,textDelivery:'WebSocket snapshots (recognizer simulated)',firstAudibleLatencyMs:latency,samples:heard.samples,recordingEndedAfterFirstAudibleMs:sent.ended-heard.firstAudible,measurement:'WebAudio analyser output, two isolated browser contexts'}));
  // Host acknowledgement must preserve a late subscriber's complete PCM cache.
  room.hostPlaybackEnabled=false;playback.acknowledge(room,task.id,task.attemptId);const late=await fetch(base+'/host/stream?task_id='+task.id,{headers:{'x-player-id':'listener'}});assert.equal(late.status,200);assert.match(await late.text(),/"type":"end"/);
  await a.close();await b.close();playback.cancel(room);rooms.delete(room.roomId);
 }
} finally {await browser.close();await vite.close();server.closeAllConnections();await new Promise(r=>server.close(r));rooms.clear();await rm(dir,{recursive:true,force:true});}
