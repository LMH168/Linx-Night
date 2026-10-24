import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{value:'',textContent:'',replaceChildren(...children){this.children=children;},prepend(){}}]));
const requests=[];
const room={roomId:'room_test',phase:'LOBBY',seats:[],speeches:[],events:[]};
const storage=new Map();
const context=vm.createContext({
 document:{getElementById:id=>elements.get(id) || null,createElement:()=>({})},
 sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
 window:{addEventListener(){}},
 setInterval(){},setTimeout(){},clearTimeout(){},
 EventSource:class {close(){}},
 fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({room_id:room.roomId,player_id:'player_test',state:room})};}
});
vm.runInContext(await readFile(new URL('../app.js',import.meta.url),'utf8'),context);
assert.equal(typeof elements.get('create').onclick,'function');
elements.get('displayName').value='测试玩家';
await elements.get('create').onclick();
assert.equal(requests[0].url,'http://localhost:5000/api/rooms');
assert.equal(requests[0].options.method,'POST');
assert.equal(JSON.parse(requests[0].options.body).display_name,'测试玩家');
assert.equal(elements.get('roomId').value,'room_test');
assert.match(elements.get('message').textContent,/房间已创建/);
console.log('Client initialization and create-room click passed');
