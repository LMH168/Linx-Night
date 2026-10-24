import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {submitSpeech} from '../packages/domain/src/engine.mjs';
import {hunterFixture,killHunter} from './lab/hunter-fixture.mjs';
import {createApiServer,rooms,publishNewEvents,roomChanges} from '../apps/server/src/api.mjs';
import {createMcpServer,sessions} from '../apps/mcp/src/server.mjs';
import {createLinxControllerManager} from '../apps/server/src/linx-manager.mjs';
import {LinxTurnRuntime} from '../apps/scheduler/src/linx-runtime.mjs';
const mode=process.argv[2]||'ready';if(!['ready','reconnect','retry','timeout'].includes(mode))throw Error('mode: ready|reconnect|retry|timeout');
if(!process.env.ADMIN_TOKEN||!process.env.MCP_AUTH_TOKEN||process.env.ADMIN_TOKEN===process.env.MCP_AUTH_TOKEN)throw Error('独立测试认证配置缺失');
const manager=createLinxControllerManager({onChange:publishNewEvents});const runtime=new LinxTurnRuntime({manager,publish:publishNewEvents});
const api=createApiServer({port:5100,sessions:manager}).server,mcp=createMcpServer({port:9191}).server;
const report={inputFile:process.env.LINX_HUNTER_WAV?.split(/[\\/]/).at(-1),source:'real-Linx-hunter-with-domain-fixture',mode,startedAt:new Date().toISOString(),attempts:1};let room; const startedServers=[];
const wake=r=>runtime.wake(r);
try{
 for(const [server,port]of [[api,5100],[mcp,9191]])await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{startedServers.push(server);resolve();});});
 room=hunterFixture();rooms.set(room.roomId,room);await manager.prepare(room);room.preparing=false;
 if(mode==='reconnect')await manager.releaseSeat(room,room.seats[1]);
 if(mode==='retry') {
   killHunter(room,'P9');submitSpeech(room,'P1','专项夹具发言','fixture-speech');
   const send=manager.sendTurn;manager.sendTurn=async()=>{throw Error('INJECTED_INPUT_FAILURE');};
   await runtime.tick(room);report.injectedFailure=room.controllers[0].errorCode;
   manager.sendTurn=send;
   const response=await fetch(`http://127.0.0.1:5100/api/rooms/${room.roomId}/controllers/retry-turn`,{method:'POST',headers:{'content-type':'application/json','x-player-id':room.hostPlayerId},body:'{}'});
   report.hostRetryStatus=response.status;if(!response.ok)throw Error('HOST_RETRY_FAILED');
 } else killHunter(room);
 const binding={...room.controllers[0]};
 if(mode==='timeout') {manager.sendTurn=async()=>new Promise(()=>{});report.injectedFailure='INPUT_WITHHELD';}
 roomChanges.on('changed',wake);publishNewEvents(room);
 const deadline=Date.now()+45000;
 while((mode==='retry'?!room.speeches.some(s=>s.seatId==='P2'):room.hunterResponse.status==='open')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
 await runtime.running.get(room.roomId);
 const d=await fetch('http://127.0.0.1:9191/admin/diagnostics',{headers:{authorization:`Bearer ${process.env.ADMIN_TOKEN}`}}).then(r=>r.json());
 report.windowStatus=room.hunterResponse?.status;report.phase=room.phase;
 report.speechAccepted=room.speeches.some(s=>s.seatId==='P2');
 if(mode==='timeout') {
   const before=JSON.stringify(room);
   const probe=await fetch('http://127.0.0.1:9191/mcp',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.MCP_AUTH_TOKEN}`,'x-linx-session-id':binding.sessionId,'x-linx-agent-id':binding.agentId,'x-linx-device-id':binding.deviceId},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'submit_hunter_shot',arguments:{target_player_id:'P3',window_id:room.hunterResponse.windowId,turn_id:room.turns[0]?.turnId}}})}).then(r=>r.json());
   report.manualLateProbe={source:'manual-http-not-platform',rejected:Boolean(probe.error||probe.result?.isError),unchanged:before===JSON.stringify(room)};
 }
 report.requests=d.requests.filter(x=>x.at>=report.startedAt).map(({at,requestId,method,tool,status,resultCode,actionId,eventIds,beforeVersion,afterVersion,failure})=>({at,requestId,method,tool,status,resultCode,actionId,eventIds,beforeVersion,afterVersion,failure}));
 report.timeline=d.timeline.filter(x=>x.roomId===room.roomId).map(({roomId,gameId,...x})=>x);
 report.events=room.events.map(({eventId,type,version})=>({eventId,type,version}));
}catch(e){report.error=/^[A-Z_]+$/.test(e.code||'')?e.code:'LAB_FAILED';}
finally{
 roomChanges.off('changed',wake);if(room){room.invalidated=true;await manager.release(room);report.bindingsReleased=![...sessions.values()].some(x=>x.roomId===room.roomId);report.controllersReleased=room.controllers.every(c=>c.status==='released');}
 for(const s of startedServers){s.closeAllConnections();await new Promise(r=>s.close(r));}
 report.finishedAt=new Date().toISOString();const dir=join(process.env.LOCALAPPDATA||'.','LinxNight-lab/evidence');await mkdir(dir,{recursive:true});await writeFile(join(dir,`hunter-${mode}-${Date.now()}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
