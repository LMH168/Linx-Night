import {setTimeout as delay} from 'node:timers/promises';

export async function waitForMcpDiscovery(binding,{base,token,fetchImpl=fetch,timeoutMs=15000,pollMs=250}={}) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const response=await fetchImpl(`${base.replace(/\/$/,'')}/admin/diagnostics`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())))});
    if(!response.ok)throw Object.assign(new Error('MCP diagnostics unavailable'),{code:'MCP_DISCOVERY_UNAVAILABLE'});
    const {requests}=await response.json();
    if(Array.isArray(requests)&&requests.some(r=>r.authenticated===true&&r.status===200&&!r.failure&&['initialize','tools/list'].includes(r.method)&&r.sessionId===binding.sessionId&&r.deviceId===binding.deviceId&&r.agentId===binding.agentId))return;
    await delay(Math.min(pollMs,Math.max(1,deadline-Date.now())));
  }
  throw Object.assign(new Error('MCP discovery not observed'),{code:'MCP_DISCOVERY_TIMEOUT'});
}
