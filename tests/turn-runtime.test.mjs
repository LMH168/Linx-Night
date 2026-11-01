import assert from 'node:assert/strict';
import { LinxTurnRuntime } from '../apps/scheduler/src/linx-runtime.mjs';
import { createRoom, addPlayer, fillAiSeats, beginControllerPreparation, privateState, publicState } from '../packages/domain/src/model.mjs';
import { createMcpServer, bindController, releaseController, sessions, devices, controllerBindings } from '../apps/mcp/src/server.mjs';
import { rooms } from '../apps/server/src/api.mjs';
import { tickRoom } from '../apps/scheduler/src/local.mjs';
const server = createMcpServer({authToken:'test'}).server;
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/mcp`;
let room, count=0, mode='success', lastContext, lastArgs, calls=0, toolName='submit_speech', contexts=new Map();
function setup(phase='SPEECH') {
  rooms.clear(); sessions.clear(); devices.clear(); controllerBindings.clear(); contexts=new Map();
  room=createRoom({hostPlayerId:'human'}); addPlayer(room,{playerId:'human',displayName:'human'}); fillAiSeats(room);
  beginControllerPreparation(room,{aiSeatIds:['P2','P3']}); room.requireActionLease=true; room.phase=phase; room.currentSeatId='P2';
  room.controllers.forEach(c=>{c.status='ready';}); room.seats.forEach((s,i)=>{s.role=i===1?'werewolf':'villager';s.camp=i===1?'werewolf':'good';s.controlSource=i===1||i===2?'linx':'human';});
  rooms.set(room.roomId,room); return room;
}
const call=(name,args,context)=>fetch(base,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test','x-linx-session-id':context.sessionId,'x-linx-agent-id':'agent','x-linx-device-id':context.deviceId},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}).then(r=>r.json());
const manager={
  async ensureConnected(room,seat) {
    const c=room.controllers.find(c=>c.seatId===seat.seatId); c.controllerEpoch++; c.status='pending'; c.sessionId=null;
    const context={roomId:room.roomId,gameId:room.gameId,seatId:seat.seatId,controllerEpoch:c.controllerEpoch,deviceId:`device-${seat.seatId}`,agentId:'agent',sessionId:`s-${++count}`};
    contexts.set(seat.seatId, context); lastContext=context; bindController(context); c.status='ready';
  },
  async sendTurn(room,seat) {
    calls++;
    const context=contexts.get(seat.seatId); const mine=privateState(room,seat.playerId); assert.ok(mine.currentTurn.turnId);
    if (room.phase === 'VOTE') {
      const response = await call('get_my_private_state', {}, context);
      const state = JSON.parse(response.result.content[0].text);
      assert.equal(state.requiredAction.tool, 'submit_vote');
      assert.equal(state.requiredAction.arguments.turn_id, mine.currentTurn.turnId);
      assert.ok(state.requiredAction.targetSeatIds.includes('P9'));
      assert.ok(!JSON.stringify(publicState(room)).includes('requiredAction'));
    }
    const payload = toolName === 'submit_speech' ? {text:'公开测试发言'} : toolName === 'submit_witch_action' ? {action:'skip'} : toolName === 'skip_hunter_response' ? {window_id:room.hunterResponse.windowId} : {target_player_id:'P9',...(toolName === 'submit_hunter_shot' ? {window_id:room.hunterResponse.windowId} : {})};
    const args={...payload,turn_id:mine.currentTurn.turnId,action_id:`a-${count}`}; lastArgs=args;
    if(mode==='timeout' || (mode==='timeout_once' && calls===1)) return new Promise(()=>{});
    const before=structuredClone(room);
    assert.equal((await call(toolName,{...args,turn_id:'old'},context)).result.isError,true);assert.deepEqual(room,before);
    assert.equal((await call(toolName,args,context)).result.isError,false);
    const accepted=structuredClone(room);
    assert.equal((await call(toolName,args,context)).result.isError,true);assert.deepEqual(room,accepted);
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
  const before=structuredClone(room);assert.equal((await call(toolName,lastArgs,lastContext)).result.isError,true);assert.deepEqual(room,before);
  await runtime.tick(room); assert.equal(room.currentSeatId,'P4'); assert.equal(room.speeches.length,2);
  setup(); mode='timeout'; calls=0;
  const timeout=new LinxTurnRuntime({manager,timeoutMs:15}); await timeout.tick(room);
  assert.equal(room.controllers[0].status,'ready'); assert.equal(room.turns[0].status,'completed');
  assert.equal(room.currentSeatId,'P3'); assert.equal(room.speeches.length,0);
  setup('VOTE'); mode='timeout_once'; calls=0; toolName='submit_vote';
  await new LinxTurnRuntime({manager,timeoutMs:100}).tick(room);
  assert.equal(calls,2); assert.equal(room.votes.length,1);
const expiredVote = room.turns.find(turn => turn.status === 'expired');
assert.ok(expiredVote); assert.ok(room.turns.some(turn => turn.status === 'completed'));
  const voted=structuredClone(room);
  const staleVote = await call(toolName,{...lastArgs,turn_id:expiredVote.turnId},contexts.get(expiredVote.seatId));
  assert.ok(staleVote.error || staleVote.result?.isError);
  assert.deepEqual(room,voted);
  setup('VOTE'); mode='timeout'; calls=0;
  await new LinxTurnRuntime({manager,timeoutMs:50}).tick(room);
  assert.equal(calls,4); assert.equal(room.votes.length,0); assert.equal(room.controllers[0].status,'failed');
await new LinxTurnRuntime({manager,timeoutMs:50}).tick(room);
assert.equal(calls,4,'失败的 AI 不会阻止同批其他投票完成');
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
  setup('VOTE'); mode='success';toolName='submit_vote';calls=0;
  room.pk={round:room.round,stage:'vote',candidates:['P2','P9']};
  await runtime.tick(room);
  assert.equal(room.votes.at(-1).seatId,'P3','AI PK candidate cannot act; next eligible AI receives a turn');
  assert.equal(room.votes.at(-1).targetSeatId,'P9');
  assert.equal(calls,1);
  setup('LAST_WORDS');mode='timeout';calls=0;
  room.seats[1].alive=false;
  room.lastWords={windowId:'last-window',lastWordsId:'last-window',seatId:'P2',round:room.round,status:'open',expiresAt:new Date(Date.now()+40).toISOString()};
  room.lastWordsContinuation='NIGHT_WOLF';
  await new LinxTurnRuntime({manager,timeoutMs:500}).tick(room);
  assert.equal(room.lastWords,null);
  assert.equal(room.phase,'NIGHT_WOLF');
  assert.equal(room.controllers[0].status,'ready','expired AI last words must not pause the next round');
  setup('SPEECH'); mode='timeout'; calls=0; toolName='submit_speech'; room.hostPlaybackEnabled=false; room.currentSeatId='P2';
  await new LinxTurnRuntime({manager,timeoutMs:15}).tick(room);
  assert.equal(room.phase,'SPEECH');
  assert.equal(room.currentSeatId,'P3','AI 发言超时应跳过当前席位并推进下一席');
  assert.equal(room.speeches.length,0,'发言超时不应伪造规则机器人文本');
  assert.equal(room.controllers[0].status,'ready');
  assert.ok(room.events.some(event => event.type === 'game.speech_skipped'));
  console.log('Runtime: serial seats, MCP lease rejection, PK eligibility, last-words timeout, failure pause and wolf privacy passed (simulated)');
} finally { rooms.clear(); sessions.clear();server.closeAllConnections();await new Promise(r=>server.close(r)); }
