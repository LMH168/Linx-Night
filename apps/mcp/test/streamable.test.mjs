import assert from 'node:assert/strict';
import {createMcpServer,registerSession,sessions} from '../src/server.mjs';
import {rooms} from '../../server/src/api.mjs';
import {createRoom,addPlayer} from '../../../packages/domain/src/model.mjs';
const {server}=createMcpServer({authToken:'test-secret'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/mcp`;
const headers={authorization:'Bearer test-secret',accept:'application/json, text/event-stream','content-type':'application/json'};
const send=(body,extra={})=>fetch(url,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
const room=createRoom({roomId:'streamable-test',hostPlayerId:'human'});
addPlayer(room,{playerId:'human',displayName:'测试'});rooms.set(room.roomId,room);
const session=registerSession({roomId:room.roomId,seatId:'P1',playerId:'human'});
try {
  assert.equal((await send({jsonrpc:'2.0',id:0,method:'initialize'},{authorization:'Bearer invalid'})).status,401);
  for(const version of ['2025-03-26','2025-06-18','2025-11-25']) {
    const response=await send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:version,capabilities:{},clientInfo:{name:'integration-client',version:'1.0'}}});
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);
    assert.equal(response.headers.get('mcp-session-id'),null);
    const init=await response.json();assert.equal(init.id,1);assert.equal(init.result.protocolVersion,version);
  }
  const negotiated={'mcp-protocol-version':'2025-03-26'};
  const notified=await send({jsonrpc:'2.0',method:'notifications/initialized'},negotiated);
  assert.equal(notified.status,202);assert.equal(await notified.text(),'');
  const list=await (await send({jsonrpc:'2.0',id:2,method:'tools/list'},negotiated)).json();
  assert.equal(list.result.tools.length,11);
  const call={jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_my_private_state'}};
  const denied=await (await send(call,negotiated)).json();assert.equal(denied.error.code,-32001);assert.equal(denied.id,3);
  const own=await (await send(call,{...negotiated,'x-linx-session-id':session})).json();
  assert.equal(JSON.parse(own.result.content[0].text).seatId,'P1');
  assert.equal((await send(call,{'mcp-protocol-version':'invalid'})).status,400);
  assert.equal((await fetch(url,{headers:{...headers,...negotiated}})).status,405);
  assert.equal((await fetch(url,{method:'DELETE',headers})).status,405);
  console.log('Streamable HTTP negotiation, notification, discovery, authorization and tool call passed');
} finally {sessions.delete(session);rooms.delete(room.roomId);server.closeAllConnections();await new Promise(r=>server.close(r));}
