import assert from 'node:assert/strict';
import {createRoom,addPlayer,fillAiSeats,assignRoles,publicState} from '../packages/domain/src/model.mjs';
import {heartbeat,expirePresence,setHumanControl} from '../packages/domain/src/presence.mjs';
import {tickRoom} from '../apps/scheduler/src/local.mjs';
import {rooms,createApiServer} from '../apps/server/src/api.mjs';
const room=createRoom({hostPlayerId:'host'});const joined=addPlayer(room,{playerId:'host',displayName:'Host'});fillAiSeats(room);assignRoles(room);room.phase='SPEECH';room.currentSeatId='P1';
const seat=room.seats[0];seat.lastHeartbeat=0;expirePresence(room,31000);
assert.equal(seat.connectionState,'disconnected');assert.equal(seat.controlSource,'human');tickRoom(room);assert.equal(room.speeches.length,0);
heartbeat(room,seat,32000);assert.equal(seat.connectionState,'online');
const server=createApiServer().server;rooms.set(room.roomId,room);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/api/rooms/${room.roomId}`;
const post=(path,body={},id='host')=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-player-id':id},body:JSON.stringify(body)});
try{
 assert.equal((await post('/control',{mode:'rule_bot'},'stranger')).status,403);
 assert.equal((await post('/control',{mode:'linx'})).status,400);
 assert.equal((await post('/control',{mode:'rule_bot'})).status,400);
 assert.equal(seat.controlSource,'human');
 assert.equal((await post('/speeches',{text:'真人仍可发言'})).status,200);
 assert.equal(room.speeches.length,1);
 assert.equal((await post('/presence')).status,200);
 assert.throws(()=>setHumanControl(room,room.seats[1],'human'),/human seat/);
 assert.ok(!JSON.stringify(publicState(room)).includes('lastHeartbeat'));
 assert.deepEqual(publicState(room).events.filter(e=>e.type==='player.control_changed').at(-1).data,{seatId:'P1',connectionState:'online',controlSource:'human'});
 console.log('Presence, explicit takeover, restored ownership, atomic rejection and public projection passed');
}finally{rooms.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}
