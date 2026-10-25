import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};let played=0,currentAudio,tick;
const state={roomId:'room'};const context=vm.createContext({window:{addEventListener(){}},document:{getElementById:get},setInterval:fn=>{tick=fn;return 1;},clearInterval(){},AbortController,Uint8Array,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},atob:()=>'',Audio:class{constructor(){currentAudio=this;}play(){return Promise.resolve();}pause(){this.onpause?.();}}});
vm.runInContext(await readFile('apps/client/host-player.js','utf8'),context);
context.window.createHostPlayer({state,message(){},call:async(path)=>{if(path.endsWith('/state'))return {task:{id:'task',text:'公开播报',status:'ready'}};if(path.includes('/audio'))return {wav:''};if(path.endsWith('/played')){played++;return {};}}});
get('hostEnable').onclick();await new Promise(r=>setImmediate(r));get('hostEnable').onclick();await new Promise(r=>setImmediate(r));assert.equal(played,0);
get('hostEnable').onclick();await new Promise(r=>setImmediate(r));currentAudio.onended();await new Promise(r=>setImmediate(r));assert.equal(played,1);
get('hostEnable').onclick();await tick();assert.equal(played,1);console.log('Host browser stop never acknowledges, ended acknowledges once and disabled poll does not play');

let fetches=0,attempts=0;
context.window.createHostPlayer({state,message(){},call:async(path)=>{if(path.endsWith('/state'))return {task:{id:'retry-task',text:'test',status:'ready'}};if(path.includes('/audio')){fetches++;return {wav:''};}if(path.endsWith('/played')){attempts++;if(attempts===1)throw Error('temporary network failure');return {};}}});
get('hostEnable').onclick();await new Promise(r=>setImmediate(r));currentAudio.onended();await new Promise(r=>setImmediate(r));
await tick();assert.equal(attempts,2);assert.equal(fetches,1);
console.log('Completed audio is not replayed when playback acknowledgement retries');
