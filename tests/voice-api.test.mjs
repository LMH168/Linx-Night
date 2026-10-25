import assert from 'node:assert/strict';
import {createRoom,addPlayer,fillAiSeats,assignRoles,appendEvent} from '../packages/domain/src/model.mjs';
import {createApiServer,rooms} from '../apps/server/src/api.mjs';
import {publicNarration} from '../apps/server/src/voice.mjs';
import {wavFromPcm} from '../apps/linx/src/voice.mjs';
const room=createRoom({hostPlayerId:'host'});addPlayer(room,{playerId:'host',displayName:'Host'});fillAiSeats(room);assignRoles(room);room.phase='SPEECH';room.currentSeatId='P1';rooms.set(room.roomId,room);
const phase=appendEvent(room,{type:'game.phase_changed',data:{phase:'SPEECH',private:'secret'}});
const privateEvent=appendEvent(room,{type:'game.seer_checked',data:{result:'secret'}});
assert.equal(publicNarration(room,phase.eventId),'天亮了，开始依次发言。');assert.throws(()=>publicNarration(room,privateEvent.eventId));
const calls=[];const server=createApiServer({voice:async input=>{calls.push(input);return input.kind==='speak'?{wav:wavFromPcm(Buffer.alloc(640))}:{text:'草稿'};}}).server;
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api/rooms/${room.roomId}/voice/`;
const post=(type,body,id='host')=>fetch(base+type,{method:'POST',headers:{'content-type':'application/json','x-player-id':id},body:JSON.stringify(body)});
try{
 assert.equal((await post('speak',{event_id:phase.eventId},'unknown')).status,403);
 assert.equal((await post('speak',{event_id:privateEvent.eventId,text:'injected'})).status,400);assert.equal(calls.length,0);
 const response=await post('speak',{event_id:phase.eventId,text:'injected'});assert.equal(response.status,400);assert.equal(calls.length,0);
 assert.equal((await post('transcribe',{wav:wavFromPcm(Buffer.alloc(640)).toString('base64')})).status,200);assert.equal(room.speeches.length,0);
 assert.equal((await post('transcribe',{wav:'a'.repeat(1300001)})).status,400);
 room.currentSeatId='P2';assert.equal((await post('transcribe',{wav:'AAAA'})).status,400);
 console.log('Voice API identity, phase, public event whitelist, request size and draft-only behavior passed');
}finally{rooms.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}
