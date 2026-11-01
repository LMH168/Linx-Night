import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRoom,addPlayer,fillAiSeats,beginControllerPreparation,privateState} from '../packages/domain/src/model.mjs';
import {startGame,skipHunterResponse,skipLastWords,voteTargetSeats} from '../packages/domain/src/engine.mjs';
import {rooms} from '../apps/server/src/api.mjs';
import {createMcpServer,bindController,releaseController,sessions,controllerBindings,devices} from '../apps/mcp/src/server.mjs';
import {tickRoom,defaultTurn} from '../apps/scheduler/src/local.mjs';
import {LinxTurnRuntime} from '../apps/scheduler/src/linx-runtime.mjs';
const server=createMcpServer({authToken:'test'}).server;await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/mcp`;
let writes=0;
const manager={
 async ensureConnected(room,seat){const c=room.controllers.find(c=>c.seatId===seat.seatId);if(c.status==='ready'&&c.sessionId)return;c.controllerEpoch++;c.status='pending';c.sessionId=null;bindController({roomId:room.roomId,gameId:room.gameId,seatId:seat.seatId,controllerEpoch:c.controllerEpoch,deviceId:seat.seatId,agentId:'simulated',sessionId:randomUUID()});c.status='ready';},
 async sendTurn(room,seat){const mine=privateState(room,seat.playerId),c=room.controllers.find(c=>c.seatId===seat.seatId);const target=room.seats.find(s=>s.alive && s.seatId!==seat.seatId);let name,args={};
  if(room.phase==='SPEECH'){name='submit_speech';args.text='模拟协议玩家公开发言';}
  else if(room.phase==='VOTE'){name='submit_vote';args.target_player_id=voteTargetSeats(room)[0].seatId;}
  else if(room.phase==='NIGHT_WOLF'){name='submit_wolf_target';args.target_player_id=mine.wolfProposal||room.seats.find(s=>s.alive&&s.camp!=='werewolf').seatId;}
  else if(room.phase==='NIGHT_SEER'){name='submit_seer_check';args.target_player_id=target.seatId;}
  else if(room.phase==='NIGHT_WITCH'){name='submit_witch_action';args.action='skip';}
  else if(room.phase==='LAST_WORDS'){name='submit_last_words';args.text='模拟协议玩家遗言';args.window_id=room.lastWords.windowId;}
  else {name='skip_hunter_response';args.window_id=room.hunterResponse.windowId;}
  args.turn_id=mine.currentTurn.turnId;args.action_id=randomUUID();
  const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test','x-linx-session-id':c.sessionId,'x-linx-device-id':c.deviceId,'x-linx-agent-id':c.agentId},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}).then(r=>r.json());
  assert.equal(response.result?.isError,false,JSON.stringify(response));writes++;
 },
 async releaseSeat(room,seat){const c=room.controllers.find(c=>c.seatId===seat.seatId);releaseController({sessionId:c?.sessionId});},
 async release(room){for(const c of room.controllers)releaseController({sessionId:c.sessionId});},
};
try{
 for(const roles of [['villager','werewolf','seer','werewolf','werewolf','witch','hunter','villager','villager'],['villager','witch','hunter','werewolf','werewolf','seer','villager','villager','werewolf']]){
  const room=createRoom({hostPlayerId:'observer'});addPlayer(room,{playerId:'observer',displayName:'模拟观察员'});fillAiSeats(room);beginControllerPreparation(room,{aiSeatIds:['P2','P3']});room.requireActionLease=true;
  room.seats.forEach((s,i)=>{s.role=roles[i];s.camp=s.role==='werewolf'?'werewolf':'good';s.skills={hunterShotAvailable:s.role==='hunter',antidoteAvailable:s.role==='witch',poisonAvailable:s.role==='witch'};s.controlSource=i===1||i===2?'linx':i===0?'human':'rule_bot';});room.controllers.forEach(c=>c.status='ready');room.phase='ROLE_ASSIGNMENT';rooms.set(room.roomId,room);startGame(room);
  const runtime=new LinxTurnRuntime({manager,timeoutMs:1000});const phases=new Set();
  for(let step=0;step<600 && room.phase!=='GAME_OVER';step++){
   phases.add(room.phase);
   if(room.phase==='HUNTER_RESPONSE'){const hunter=room.seats.find(s=>s.seatId===room.hunterResponse.seatId);if(hunter.controlSource!=='linx')skipHunterResponse(room,hunter.seatId,randomUUID(),room.hunterResponse.windowId);}
   if(room.phase==='LAST_WORDS'){const speaker=room.seats.find(s=>s.seatId===room.lastWords.seatId);skipLastWords(room,speaker.seatId,randomUUID(),room.lastWords.windowId);}
   if(room.seats[0].alive)defaultTurn(room,room.seats[0]); // Explicit scripted human, not a real participant.
   tickRoom(room);await runtime.tick(room);assert.ok(!room.controllers.some(c=>c.status==='failed'),JSON.stringify({phase:room.phase,pk:room.pk,controllers:room.controllers}));
  }
  assert.equal(room.phase,'GAME_OVER');await runtime.tick(room);assert.equal(sessions.size,0);assert.equal(controllerBindings.size,0);assert.equal(devices.size,0);assert.ok(room.round>=1);assert.ok(phases.has('SPEECH')&&phases.has('VOTE'));assert.equal(new Set(room.actions.map(a=>a.actionId)).size,room.actions.length);rooms.clear();
 }
 assert.ok(writes>5);console.log(`Two complete simulated mixed games passed; ${writes} accepted HTTP MCP writes; no real Linx or human acceptance claimed`);
}finally{rooms.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}
