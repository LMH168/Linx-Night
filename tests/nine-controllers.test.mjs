import assert from 'node:assert/strict';import {createRoom,addPlayer,fillAiSeats,beginControllerPreparation} from '../packages/domain/src/model.mjs';import {createLinxControllerManager} from '../apps/server/src/linx-manager.mjs';import {wavFromPcm} from '../apps/linx/src/voice.mjs';
const identities=Array.from({length:8},(_,i)=>'player'+i),discovery=[];let created=0,closed=0,failConnection=false;
const env={LINX_PROFILES:identities.join(','),LINX_AGENT_ID:'players',LINX_HOST_PROFILE:'host',LINX_HOST_AGENT_ID:'host-agent',LINX_MCP_ADMIN_URL:'http://test',LINX_MCP_ADMIN_TOKEN:'admin'};
const manager=createLinxControllerManager({env,loadAudio:async()=>wavFromPcm(Buffer.alloc(320)),readIdentity:async name=>({deviceId:name}),fetchImpl:async(url,options)=>{if(url.endsWith('/admin/diagnostics'))return Response.json({requests:discovery});if(url.includes('/ota'))return Response.json({websocket:{url:'wss://xrobo-io.qiniuapi.com/v1/ws/',token:'test'}});return Response.json({ok:true});},clientFactory:identity=>{created++;return {sessionId:'session-'+identity.deviceId,state:'closed',async connect(){if(failConnection && identity.deviceId==='player0')throw new Error('TEST_CONNECT_FAILED');this.state='ready';discovery.push({authenticated:true,status:200,method:'initialize',sessionId:this.sessionId,deviceId:identity.deviceId,agentId:identity.deviceId==='host'?'host-agent':'players'});},close(){closed++;this.state='closed';}};}});
const room=createRoom();addPlayer(room,{displayName:'host'});fillAiSeats(room);beginControllerPreparation(room,{includeHost:true});await manager.prepare(room);assert.equal(created,9);assert.ok(room.controllers.every(c=>c.status==='ready'));assert.equal(new Set(room.controllers.map(c=>c.profileName)).size,9);await manager.release(room);assert.equal(closed,9);assert.ok(room.controllers.every(c=>c.status==='released'));console.log('Nine distinct controllers prepare and release without reusing player or host identity (simulated)');

const fresh=()=>{const r=createRoom();addPlayer(r,{displayName:'host'});fillAiSeats(r);beginControllerPreparation(r,{includeHost:true});return r;};
failConnection=true;
const failed=fresh();await assert.rejects(()=>manager.prepare(failed),/TEST_CONNECT_FAILED/);
assert.ok(failed.controllers.every(c=>c.status==='released' && !c.sessionId));
failConnection=false;
const next=fresh();await manager.prepare(next);assert.ok(next.controllers.every(c=>c.status==='ready'));
const occupied=fresh();await assert.rejects(()=>manager.prepare(occupied),e=>e.code==='PROFILE_IN_USE');
await manager.release(next);
const afterRelease=fresh();await manager.prepare(afterRelease);await manager.release(afterRelease);
const insufficient=createLinxControllerManager({env:{...env,LINX_PROFILES:'one'}});
await assert.rejects(()=>insufficient.prepare(fresh()),e=>e.code==='PROFILE_POOL_INSUFFICIENT');
console.log('Failed preparation rolls back all profiles; active rooms remain protected; new rooms can reuse released identities');
