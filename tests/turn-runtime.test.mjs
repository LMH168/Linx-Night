import assert from 'node:assert/strict';
import { LinxTurnRuntime } from '../apps/scheduler/src/linx-runtime.mjs';
import { createRoom, addPlayer, fillAiSeats, beginControllerPreparation, privateState, publicState } from '../packages/domain/src/model.mjs';
import { createMcpServer, bindController, releaseController, sessions } from '../apps/mcp/src/server.mjs';
import { rooms } from '../apps/server/src/api.mjs';
import { tickRoom } from '../apps/scheduler/src/local.mjs';
const server = createMcpServer({authToken:'test'}).server;
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/mcp`;
let room, count=0, mode='success', lastContext, lastArgs, calls=0, toolName='submit_speech';
function setup(phase='SPEECH') {
  rooms.clear(); sessions.clear();
  room=createRoom({hostPlayerId:'human'}); addPlayer(room,{playerId:'human',displayName:'human'}); fillAiSeats(room);
  beginControllerPreparation(room,{aiSeatIds:['P2','P3']}); room.requireActionLease=true; room.phase=phase; room.currentSeatId='P2';
  room.controllers.forEach(c=>{c.status='ready';}); room.seats.forEach((s,i)=>{s.role=i===1?'werewolf':'villager';s.camp=i===1?'werewolf':'good';s.controlSource=i===1||i===2?'linx':'human';});
  rooms.set(room.roomId,room); return room;
}
const call=(name,args,context)=>fetch(base,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test','x-linx-session-id':context.sessionId,'x-linx-agent-id':'agent','x-linx-device-id':context.deviceId},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}).then(r=>r.json());
const manager={
  async ensureConnected(room,seat) {
    const c=room.controllers.find(c=>c.seatId===seat.seatId); c.controllerEpoch++; c.status='pending'; c.sessionId=null;
    lastContext={roomId:room.roomId,gameId:room.gameId,seatId:seat.seatId,controllerEpoch:c.controllerEpoch,deviceId:`device-${seat.seatId}`,agentId:'agent',sessionId:`s-${++count}`};
    bindController(lastContext); c.status='ready';
  },
  async sendTurn(room,seat) {
    calls++;
    const mine=privateState(room,seat.playerId); assert.ok(mine.currentTurn.turnId);
    const payload = toolName === 'submit_speech' ? {text:'公开测试发言'} : toolName === 'submit_witch_action' ? {action:'skip'} : toolName === 'skip_hunter_response' ? {window_id:room.hunterResponse.windowId} : {target_player_id:'P9',...(toolName === 'submit_hunter_shot' ? {window_id:room.hunterResponse.windowId} : {})};
    lastArgs={...payload,turn_id:mine.currentTurn.turnId,action_id:`a-${count}`};
    if(mode==='timeout') return new Promise(()=>{});
    const before=structuredClone(room);
    assert.equal((await call(toolName,{...lastArgs,turn_id:'old'},lastContext)).result.isError,true);assert.deepEqual(room,before);
    assert.equal((await call(toolName,lastArgs,lastContext)).result.isError,false);
    const accepted=structuredClone(room);
    assert.equal((await call(toolName,lastArgs,lastContext)).result.isError,true);assert.deepEqual(room,accepted);
    return new Promise(()=>{}); // Platform TTS need not end for game success.
  },
  async releaseSeat(room,seat) { const c=room.controllers.find(c=>c.seatId===seat.seatId);releaseController({sessionId:c.sessionId}); },
  async release(room) { for(const s of room.seats) await this.releaseSeat(room,s).catch(()=>{}); },
};
try {
  setup(); const runtime=new LinxTurnRuntime({manager,timeoutMs:500});
  const work=runtime.tick(room); assert.equal(runtime.tick(room),work); await work;
  assert.equal(calls,1); assert.equal(room.speeches.length,1); assert.equal(room.currentSeatId,'P3');
  assert.equal(room.turns[0].status,'completed'); assert.equal(room.seats[1].controlSource,'linx');
  const before=structuredClone(room);assert.ok((await call(toolName,lastArgs,lastContext)).error);assert.deepEqual(room,before);
  await runtime.tick(room); assert.equal(room.currentSeatId,'P4'); assert.equal(room.speeches.length,2);
  setup(); mode='timeout'; calls=0;
  const timeout=new LinxTurnRuntime({manager,timeoutMs:15}); await timeout.tick(room);
  assert.equal(room.controllers[0].status,'failed');assert.equal(room.turns[0].status,'expired');
  await timeout.tick(room);assert.equal(calls,1);assert.equal(room.speeches.length,0);
  tickRoom(room);assert.equal(room.speeches.length,0);
  assert.ok((await call(toolName,lastArgs,lastContext)).error);
  room.controllers[0].status='released';mode='success'; await runtime.tick(room);
  assert.equal(room.speeches.length,1);assert.ok(room.turns[1].controllerEpoch>room.turns[0].controllerEpoch);
  setup('NIGHT_WOLF');room.actions.push({actionType:'wolf_target',turnId:room.round,seatId:'P8',targetSeatId:'P9'});
  assert.equal(privateState(room,room.seats[1].playerId).wolfProposal,'P9');
  assert.equal(privateState(room,room.seats[2].playerId).wolfProposal,null);
  assert.doesNotMatch(JSON.stringify(publicState(room)),/wolfProposal|targetSeatId|sessionId|deviceId/);
  for (const [phase,role,name] of [['NIGHT_WOLF','werewolf','submit_wolf_target'],['NIGHT_SEER','seer','submit_seer_check'],['NIGHT_WITCH','witch','submit_witch_action'],['VOTE','villager','submit_vote'],['HUNTER_RESPONSE','hunter','submit_hunter_shot'],['HUNTER_RESPONSE','hunter','skip_hunter_response']]) {
    setup(phase); mode='success';toolName=name; room.hostPlaybackBlocked=phase.startsWith('NIGHT_'); room.seats[1].role=role;room.pendingNight={wolfTarget:'P9'};
    room.seats[1].skills={hunterShotAvailable:true};
    if(role==='hunter'){room.seats[1].alive=false;room.hunterResponse={windowId:'window',seatId:'P2',status:'open',phaseBefore:'DAY_ANNOUNCEMENT',expiresAt:new Date(Date.now()+30000).toISOString()};}
    const work=runtime.tick(room);
    await new Promise(r=>setImmediate(r));
    if(phase.startsWith('NIGHT')) assert.ok(!publicState(room).turns.some(t=>t.seatId==='P2'));
    await work;assert.equal(room.turns[0].status,'completed',name);
  }
  console.log('Runtime: serial seats, MCP lease rejection, accepted action beats pending TTS, failure pause, new epoch and wolf privacy passed (simulated)');
} finally { rooms.clear(); sessions.clear();server.closeAllConnections();await new Promise(r=>server.close(r)); }
