import assert from 'node:assert/strict';
import { hunterRoom } from './fixtures/hunter.mjs';
import { createApiServer, rooms, publishNewEvents } from '../apps/server/src/api.mjs';
import { createMcpServer, registerSession, sessions } from '../apps/mcp/src/server.mjs';

const api = createApiServer().server, mcp = createMcpServer({ authToken: 'test', adminToken: 'admin' }).server;
await Promise.all([api, mcp].map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))));
const base = `http://127.0.0.1:${api.address().port}`, mcpUrl = `http://127.0.0.1:${mcp.address().port}/mcp`;
let room;
function setup() {
  rooms.clear(); sessions.clear(); room = hunterRoom(); rooms.set(room.roomId, room);
  for (const [id, seatId, role] of [['hunter','P7','player'],['other','P1','player'],['host','P1','host']]) registerSession({sessionId:id,roomId:room.roomId,seatId,playerId:seatId === 'P7' ? 'p7' : 'p1',role});
}
const action = (body, playerId = 'p7', route = 'hunter-response') => fetch(`${base}/api/rooms/${room.roomId}/${route}`, {method:'POST',headers:{'content-type':'application/json','x-player-id':playerId},body:JSON.stringify(body)});
const tool = (name, args, session = 'hunter') => fetch(mcpUrl,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test','x-linx-session-id':session},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}).then(r=>r.json());
try {
  setup();
  const windowId = room.hunterResponse.windowId;
  for (const [body, player, route] of [
    [{action:'shoot',target_seat_id:'P2',window_id:windowId},'p1','hunter-response'],
    [{action:'shoot',target_seat_id:'P2'},'p7','hunter-response'],
    [{action:'expire',window_id:windowId},'p7','hunter-response'],
    [{type:'hunter_shot',target_seat_id:'P2'},'p7','actions'],
  ]) {
    const before=structuredClone(room); assert.equal((await action(body,player,route)).status,400); assert.deepEqual(room,before);
  }
  const abort = new AbortController();
  const stream = await fetch(`${base}/api/rooms/${room.roomId}/events?after=${room.version}`,{signal:abort.signal});
  const reader=stream.body.getReader(); await reader.read();
  assert.equal((await action({action:'shoot',target_seat_id:'P2',window_id:windowId,action_id:'api-shot'})).status,200);
  const chunk = new TextDecoder().decode((await reader.read()).value);
  assert.match(chunk,/game.hunter_shot/); assert.doesNotMatch(chunk,/windowId|expiresAt/);
  abort.abort(); await reader.cancel().catch(()=>{});
  const accepted=structuredClone(room);
  assert.equal((await action({action:'shoot',target_seat_id:'P3',window_id:windowId,action_id:'api-shot'})).status,400);
  assert.deepEqual(room,accepted);
  setup();
  const args={target_player_id:'P2',window_id:room.hunterResponse.windowId,action_id:'mcp-shot'};
  for (const session of ['other','host','unknown']) {
    const before=structuredClone(room), response=await tool('submit_hunter_shot',args,session);
    assert.ok(response.error || response.result.isError); assert.deepEqual(room,before);
  }
  assert.equal((await tool('submit_hunter_shot',args)).result.isError,false);
  setup();
  assert.equal((await tool('skip_hunter_response',{window_id:room.hunterResponse.windowId,action_id:'mcp-skip'})).result.isError,false);
  assert.equal(room.hunterResponse.status,'skipped');
  // Timer runs even when no player sends a request and closes only once.
  setup(); room.hunterResponse.expiresAt=new Date(Date.now()-1).toISOString();
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(room.hunterResponse.status,'expired'); assert.equal(room.phase,'SPEECH');
  assert.equal(room.events.filter(e=>e.type==='game.hunter_response_closed').length,1);
  assert.ok(room.lastPublishedVersion > 0);
  publishNewEvents(room);
  console.log('Hunter API/MCP authorization, old endpoint rejection, SSE, timer and duplicate rejection passed');
} finally {
  rooms.clear(); sessions.clear();
  await Promise.all([api,mcp].map(server=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}));
}
