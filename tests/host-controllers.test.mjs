import assert from 'node:assert/strict';
import {createRoom,addPlayer,fillAiSeats,beginControllerPreparation,publicState,privateState} from '../packages/domain/src/model.mjs';
import {hunterFixture,killHunter} from '../scripts/lab/hunter-fixture.mjs';
import {rooms,createApiServer} from '../apps/server/src/api.mjs';
import {bindController,releaseController,createMcpServer,sessions,devices,controllerBindings} from '../apps/mcp/src/server.mjs';
for(const humans of [1,2,8,9]){const r=createRoom();for(let i=0;i<humans;i++)addPlayer(r,{displayName:'human'});fillAiSeats(r);beginControllerPreparation(r,{includeHost:true});assert.equal(r.controllers.length,10-humans);assert.equal(r.controllers.at(-1).seatId,'HOST');assert.equal(r.seats.length,9);}
const r=hunterFixture();killHunter(r);const pub=JSON.stringify(publicState(r));assert.doesNotMatch(pub,/HUNTER_RESPONSE|hunter_response|windowId|expiresAt/);assert.ok(privateState(r,r.seats[1].playerId).hunterAction);assert.equal(privateState(r,r.seats[0].playerId).hunterAction,null);
const room=createRoom();addPlayer(room,{displayName:'human'});fillAiSeats(room);beginControllerPreparation(room,{includeHost:true});rooms.set(room.roomId,room);
const c=room.controllers.at(-1);c.agentId='host-agent';c.deviceId='host-device';const binding={roomId:room.roomId,gameId:room.gameId,seatId:'HOST',controllerEpoch:c.controllerEpoch,agentId:c.agentId,deviceId:c.deviceId,sessionId:'host-session'};
assert.throws(()=>bindController({...binding,agentId:'player-agent'}));bindController(binding);c.status='ready';
const server=createMcpServer({authToken:'mcp'}).server;await new Promise(r=>server.listen(0,'127.0.0.1',r));
const call=name=>fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer mcp','x-linx-session-id':'host-session','x-linx-agent-id':'host-agent','x-linx-device-id':'host-device'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{}}})}).then(r=>r.json());
try{assert.equal((await call('get_public_game_state')).result.isError,false);assert.equal((await call('get_host_announcements')).result.isError,false);assert.ok((await call('get_my_private_state')).error);assert.ok((await call('submit_speech')).error);releaseController(binding);assert.ok((await call('get_public_game_state')).error);assert.equal(sessions.size,0);assert.equal(devices.size,0);assert.equal(controllerBindings.size,0);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rooms.clear();}
console.log('Dynamic eight-seat pool, separate host permissions, stale host rejection and concealed hunter passed');
