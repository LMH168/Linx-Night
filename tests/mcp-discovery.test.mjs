import assert from 'node:assert/strict';
import {waitForMcpDiscovery} from '../apps/server/src/mcp-discovery.mjs';
import {createMcpServer} from '../apps/mcp/src/server.mjs';
const binding={sessionId:'current-session',deviceId:'device',agentId:'agent'};
const valid={...binding,authenticated:true,status:200,method:'tools/list'};
for(const patch of [{authenticated:false},{status:401},{sessionId:'old'},{deviceId:'other'},{agentId:'other'},{method:'tools/call'},{failure:{code:'ERROR'}}]){
 await assert.rejects(waitForMcpDiscovery(binding,{base:'http://test',token:'admin',timeoutMs:5,pollMs:1,fetchImpl:async()=>Response.json({requests:[{...valid,...patch}]})}),e=>e.code==='MCP_DISCOVERY_TIMEOUT');
}
const server=createMcpServer({authToken:'mcp',adminToken:'admin'}).server;await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
try{
 await assert.rejects(waitForMcpDiscovery(binding,{base,token:'wrong',timeoutMs:100}),e=>e.code==='MCP_DISCOVERY_UNAVAILABLE');
 const work=waitForMcpDiscovery(binding,{base,token:'admin',timeoutMs:1000,pollMs:5});
 const response=await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer mcp','x-linx-session-id':binding.sessionId,'x-linx-agent-id':binding.agentId,'x-linx-device-id':binding.deviceId},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(response.status,200);await response.json();await work;
 console.log('Authenticated exact-session discovery required; stale/mismatched/failed requests rejected; real HTTP discovery passes');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
