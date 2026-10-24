import assert from 'node:assert/strict';
import { createApiServer, rooms } from '../apps/server/src/api.mjs';
import { createMcpServer } from '../apps/mcp/src/server.mjs';
import { tickRoom } from '../apps/scheduler/src/local.mjs';
const api = createApiServer().server;
const mcp = createMcpServer({authToken:'test',adminToken:'admin'}).server;
await new Promise(r => api.listen(0,'127.0.0.1',r));
await new Promise(r => mcp.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${api.address().port}`;
const remote = `http://127.0.0.1:${mcp.address().port}`;
const post = (url,body,headers={}) => fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
try {
  for (const humans of [2,4,8,9]) {
    const created = await (await post(`${base}/api/rooms`,{display_name:'tester'})).json();
    for(let i=1;i<humans;i++) assert.equal((await post(`${base}/api/rooms/${created.room_id}/players`,{display_name:`human${i}`})).status,201);
    assert.equal((await post(`${base}/api/rooms/${created.room_id}/start`,{}, {'x-player-id':created.player_id})).status,200);
    const room = rooms.get(created.room_id);
    assert.equal(room.seats.filter(s => s.playerType === 'human').length,humans);
    // Simulated humans use deterministic legal actions; this is not a live Linx test.
    for(let step=0; step<500 && room.phase !== 'GAME_OVER'; step++) tickRoom(room,()=>true);
    assert.equal(room.phase,'GAME_OVER',`${humans} humans game should finish`);
  }
  const created = await (await post(`${base}/api/rooms`,{display_name:'MCP tester'})).json();
  const binding = {roomId:created.room_id,seatId:'P1',role:'player',deviceId:'d',agentId:'a'};
  assert.equal((await post(`${remote}/admin/bindings`,binding)).status,403);
  assert.equal((await post(`${remote}/admin/bindings`,binding,{authorization:'Bearer admin'})).status,201);
  assert.equal((await fetch(`${remote}/mcp`)).status,401);
  const headers = {authorization:'Bearer test','x-linx-device-id':'d','x-linx-agent-id':'a','x-linx-session-id':'real-session'};
  const abort = new AbortController();
  const stream = await fetch(`${remote}/mcp`,{headers,signal:abort.signal});
  const reader = stream.body.getReader(); const decoder = new TextDecoder();
  let buffer='';
  async function event() {
    while(!buffer.includes('\n\n')) {const {value,done}=await reader.read(); assert.equal(done,false); buffer+=decoder.decode(value);}
    const end=buffer.indexOf('\n\n');const frame=buffer.slice(0,end); buffer=buffer.slice(end+2);return frame;
  }
  const endpoint = (await event()).match(/data: (.+)/)[1];
  const rpc = async (id,method,params) => {
    assert.equal((await post(remote+endpoint,{jsonrpc:'2.0',id,method,params},headers)).status,202);
    return JSON.parse((await event()).split('data: ')[1]);
  };
  assert.equal((await rpc(1,'initialize')).result.protocolVersion,'2024-11-05');
  assert.equal((await post(remote+endpoint,{jsonrpc:'2.0',method:'notifications/initialized'},headers)).status,202);
  assert.ok((await rpc(2,'tools/list')).result.tools.length);
  const state = await rpc(3,'tools/call',{name:'get_public_game_state'});
  assert.equal(JSON.parse(state.result.content[0].text).roomId,created.room_id);
  const privateState=await rpc(4,'tools/call',{name:'get_my_private_state'});
  assert.equal(JSON.parse(privateState.result.content[0].text).seatId,'P1');
  const room = rooms.get(created.room_id);
  room.phase = 'SPEECH'; room.currentSeatId = 'P1';
  assert.equal((await rpc(7,'tools/call',{name:'submit_speech',arguments:{text:'来自真实 SSE 通道',action_id:'sse-speech'}})).result.isError,false);
  const viaApi = await (await fetch(`${base}/api/rooms/${created.room_id}/speeches`)).json();
  assert.equal(viaApi.speeches[0].text,'来自真实 SSE 通道');
  await post(`${remote}/admin/bindings`,{...binding,role:'host'},{authorization:'Bearer admin'});
  assert.equal((await rpc(5,'tools/call',{name:'get_my_private_state'})).error.code,-32002);
  assert.equal((await rpc(6,'tools/call',{name:'submit_speech',arguments:{text:'x'}})).error.code,-32002);
  abort.abort();
  console.log('Shared API/MCP, SSE handshake, binding authorization and 2+7/4+5/8+1/9 simulations passed');
} finally { api.closeAllConnections();mcp.closeAllConnections(); await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>mcp.close(r))]); }
