import assert from 'node:assert/strict';
import { createRoom, addPlayer, fillAiSeats, beginControllerPreparation, createTurn, appendEvent } from '../packages/domain/src/model.mjs';
import { rooms } from '../apps/server/src/api.mjs';
import { createMcpServer, bindController, releaseController } from '../apps/mcp/src/server.mjs';
import { LinxTurnRuntime } from '../apps/scheduler/src/linx-runtime.mjs';
import { syncPublicContextClocks } from '../packages/domain/src/public-conversation.mjs';
import { updateTranscript } from '../apps/server/src/human-transcription.mjs';
const room=createRoom({hostPlayerId:'human'});addPlayer(room,{playerId:'human'});fillAiSeats(room);beginControllerPreparation(room,{aiSeatIds:['P2']});room.requireActionLease=true;room.phase='NIGHT_WOLF';room.seats[1].role='werewolf';room.seats[1].camp='werewolf';room.controllers[0].status='ready';
const record={lastWordsId:'words',seatId:'P1',round:room.round,text:'',audioId:'a',transcriptionStatus:'pending'};room.lastWordsHistory.push(record);room.version++;appendEvent(room,{type:'game.last_words_submitted',data:{lastWordsId:'words'}});
let connects=0;const runtime=new LinxTurnRuntime({manager:{ensureConnected(){connects++;}}});await runtime.tick(room);assert.equal(connects,0);assert.equal(room.turns.length,0);
room.nightWindow={phase:room.phase,expiresAt:Date.now()+15000};syncPublicContextClocks(room);const before=room.nightWindow.expiresAt;updateTranscript(room,record,'lastwords','completed','五号是狼人','transcription');assert.ok(room.nightWindow.expiresAt>=before);
rooms.set(room.roomId,room);const context={roomId:room.roomId,gameId:room.gameId,seatId:'P2',controllerEpoch:room.controllers[0].controllerEpoch,sessionId:'context-test',deviceId:'test-device',agentId:'test-agent'};room.controllers[0].status='pending';bindController(context);room.controllers[0].status='ready';const turn=createTurn(room,{seatId:'P2',controlSource:'linx',controllerEpoch:context.controllerEpoch});
const {server}=createMcpServer({authToken:'test'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const call=async(name,args={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json','x-linx-session-id':context.sessionId,'x-linx-agent-id':context.agentId,'x-linx-device-id':context.deviceId},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});const result=(await r.json()).result;return {error:result.isError,data:JSON.parse(result.content[0].text)};};
try {
 const args={target_player_id:'P3',turn_id:turn.turnId};
 const rejected=await call('submit_wolf_target',args);assert.equal(rejected.data.code,'PUBLIC_CONTEXT_REQUIRED');assert.equal(rejected.data.recovery.tool,'get_recent_speeches');assert.equal(room.actions.length,0);
 const history=await call('get_recent_speeches');assert.equal(history.data.records.at(-1).kind,'lastwords');assert.equal(history.data.records.at(-1).text,'五号是狼人');assert.ok(Array.isArray(history.data.speeches));assert.doesNotMatch(JSON.stringify(history.data),/audioPath|sessionId|deviceId/);
 updateTranscript(room,record,'lastwords','failed');assert.equal((await call('submit_wolf_target',args)).data.code,'PUBLIC_CONTEXT_REQUIRED');
 const failed=await call('get_recent_speeches');assert.equal(failed.data.records.at(-1).text,'');assert.equal(failed.data.records.at(-1).transcriptionStatus,'failed');
 updateTranscript(room,record,'lastwords','completed','玩家补充五号','player_supplement');assert.equal((await call('submit_wolf_target',args)).data.code,'PUBLIC_CONTEXT_REQUIRED');await call('get_recent_speeches');assert.equal((await call('submit_wolf_target',args)).data.accepted,true);
 console.log('Unified lastwords query, AI lease barrier, PUBLIC_CONTEXT_REQUIRED, latest-context invalidation, failed unknown and supplemented context passed');
} finally {releaseController(context);rooms.delete(room.roomId);server.closeAllConnections();await new Promise(r=>server.close(r));}
