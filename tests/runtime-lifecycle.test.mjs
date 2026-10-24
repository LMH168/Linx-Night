import assert from 'node:assert/strict';
import { createRoom, addPlayer, fillAiSeats, beginControllerPreparation, invalidateRoomControllers } from '../packages/domain/src/model.mjs';
import { LinxSessionAdapter } from '../apps/linx/src/session-adapter.mjs';
import { createApiServer, rooms } from '../apps/server/src/api.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const setup=()=>{const room=createRoom();addPlayer(room,{playerId:room.hostPlayerId,displayName:'host'});fillAiSeats(room);beginControllerPreparation(room,{aiSeatIds:['P2']});return room;};
for(const when of ['ota','hello','bind']) {
  const room=setup(), gate=deferred();let closed=0, bound=0, released=0;
  const client={sessionId:'session',async connect(){if(when==='hello')await gate.promise;},close(){closed++;}};
  const adapter=new LinxSessionAdapter({
    clientFactory:()=>client,
    connectionFor:async()=>{if(when==='ota')await gate.promise;return {profileName:'profile',identity:{deviceId:'device'},agentId:'agent',connection:{}};},
    bind:async()=>{bound++;if(when==='bind')await gate.promise;}, release:async()=>{released++;},
  });
  const work=adapter.connect(room,'P2'); const rejection=assert.rejects(work);
  await new Promise(r=>setImmediate(r));
  invalidateRoomControllers(room);await adapter.releaseAll(room);gate.resolve();await rejection;
  assert.equal(room.controllers[0].status,'released');assert.equal(adapter.clients.size,0);assert.equal(adapter.profiles.size,0);
  if(when==='ota')assert.equal(bound,0);else assert.ok(closed>=1);
  if(when==='bind')assert.equal(released,2); // Revoke again when the in-flight bind returns after cancellation.
}
// Cancel a start while prepare is pending. Its late success must not assign roles.
const gate=deferred();let retries=0;
const manager={sendTurn(){},async prepare(room){await gate.promise;room.controllerPhase='ready';},async release(){},async retry(room,seatId){retries++;room.controllers.find(c=>c.seatId===seatId).status='ready';}};
const api=createApiServer({sessions:manager}).server;await new Promise(r=>api.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${api.address().port}`;
const post=(path,playerId)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-player-id':playerId},body:'{}'});
try {
  const room=createRoom({hostPlayerId:'host'});addPlayer(room,{playerId:'host',displayName:'host'});rooms.set(room.roomId,room);
  const route=`/api/rooms/${room.roomId}`;
  assert.equal((await post(route+'/start','host')).status,202);
  assert.equal((await post(route+'/start','host')).status,400);
  assert.equal((await post(route+'/controllers/cancel','host')).status,200);
  gate.resolve();await new Promise(r=>setImmediate(r));
  assert.equal(room.phase,'LOBBY');assert.equal(room.gameId,null);assert.ok(room.seats.every(s=>!s.role));
  // A failed runtime controller can be retried only by the host.
  room.phase='SPEECH';room.invalidated=false;room.controllers=[{seatId:'P2',status:'failed'}];
  assert.equal((await post(route+'/controllers/retry-turn','stranger')).status,403);
  assert.equal((await post(route+'/controllers/retry-turn','host')).status,200);assert.equal(retries,1);
  assert.equal(room.controllers[0].status,'ready');
  room.turnRunning=true;room.controllers[0].status='failed';assert.equal((await post(route+'/controllers/retry-turn','host')).status,400);room.turnRunning=false;
  // Human P2 must never be relabelled Linx during the start preparation.
  const humans=createRoom({hostPlayerId:'h1'});addPlayer(humans,{playerId:'h1',displayName:'h1'});addPlayer(humans,{playerId:'h2',displayName:'h2'});rooms.set(humans.roomId,humans);
  assert.equal((await post(`/api/rooms/${humans.roomId}/start`,'h1')).status,202);
  assert.equal(humans.seats[1].controlSource,'human');assert.deepEqual(humans.controllers.map(c=>c.seatId),['P3','P4','P5','P6','P7','P8','P9']);
  console.log('Lifecycle cancellation during OTA/hello/bind, late start and host retry authorization passed');
} finally {rooms.clear();api.closeAllConnections();await new Promise(r=>api.close(r));}
