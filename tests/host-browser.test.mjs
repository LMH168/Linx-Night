import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};let tick,finish,fetches=0,acks=0,failAck=false;
const state={roomId:'room',playerId:'host',room:{hostPlayerId:'host'}};
const window={addEventListener(){},AudioContext:class{async resume(){}},playPcmStream:async(_r,_c,{signal,onStart})=>{await onStart();await new Promise((resolve,reject)=>{finish=resolve;signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});signal.throwIfAborted();return {firstPlayMs:10,playbackMs:250};}};
vm.runInNewContext(await readFile('apps/client/host-player.js','utf8'),{window,document:{getElementById:get},setInterval:f=>{tick=f;},clearInterval(){},AbortController});
window.createHostPlayer({state,message(){},call:async(path)=>{if(path.endsWith('/state'))return {task:{id:'t',attemptId:'a',gameId:'g',status:'ready',text:'公开'}};if(path.includes('/stream')){fetches++;return {};}if(path.endsWith('/played')){acks++;if(failAck){failAck=false;throw Error('network');}}return {};}});
const flush=()=>new Promise(r=>setImmediate(r));
get('hostEnable').onclick();await flush();get('hostEnable').onclick();await flush();assert.equal(acks,0);
get('hostEnable').onclick();await flush();failAck=true;finish();await flush();assert.equal(acks,1);const before=fetches;await tick();assert.equal(acks,2);assert.equal(fetches,before);
await tick();assert.equal(fetches,before);state.roomId='other';await tick();assert.equal(acks,3); // prior completed retry only; switching never acknowledges the new room
console.log('Stream cancellation never acknowledges; completed-attempt acknowledgement retries without replay; room switch stops playback');

// A played acknowledgement publishes SSE before its HTTP response finishes.
// Changing to the next task in that interval is normal, not an interruption.
let next=false,player,transitionAcks=0,transitionFetches=0;
state.roomId='transition';
player=window.createHostPlayer({state,message(){},call:async(path)=>{
 if(path.endsWith('/state'))return {task:{id:next?'second':'first',attemptId:next?'b':'a',gameId:'g',status:'ready',text:'公开'}};
 if(path.includes('/stream')){transitionFetches++;return {};}
 if(path.endsWith('/played')){transitionAcks++;next=true;player.notify();await flush();}
 return {};
}});
get('hostEnable').onclick();await flush();finish();await flush();await flush();
assert.equal(transitionAcks,1);assert.equal(get('hostEnable').textContent,'停止公共声音');
void tick();await flush();assert.equal(transitionFetches,2);assert.equal(transitionAcks,1);
player.stop();await flush();assert.equal(transitionAcks,1);
console.log('SSE during acknowledgement keeps sound enabled and automatically starts the next task');
