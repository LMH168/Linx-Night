import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{value:'',textContent:'',replaceChildren(...children){this.children=children;},prepend(){}}]));
const requests=[];
const room={roomId:'room_test',phase:'LOBBY',seats:[],speeches:[],events:[]};
const storage=new Map();
const context=vm.createContext({
 URLSearchParams,
 document:{getElementById:id=>elements.get(id) || null,createElement:()=>({})},
 sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
 window:{addEventListener(){}},
 setInterval(){},setTimeout(){},clearTimeout(){},
 Option:class {constructor(text,value){this.text=text;this.value=value;}},
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

const run=code=>vm.runInContext(code,context);
assert.equal(elements.get('privateCard').hidden,true);
assert.equal(elements.get('actionCard').hidden,true);
const mine={seatId:'P1',role:'villager',alive:true,skills:{antidoteAvailable:true,poisonAvailable:true,hunterShotAvailable:true},seerResults:[],werewolfTeammates:[]};
context.fixture=mine;
run("state.privateState=fixture; state.room={roomId:'room_test',phase:'NIGHT_WOLF',seats:[{seatId:'P1',alive:true},{seatId:'P2',alive:true}],speeches:[],events:[]}; renderPrivate();renderActions();");
assert.equal(elements.get('skill').hidden,true);
assert.equal(elements.get('witchField').hidden,true);
assert.doesNotMatch(elements.get('skills').textContent,/解药|狼人队友|查验/);
for(const [role,phase] of [['werewolf','NIGHT_WOLF'],['seer','NIGHT_SEER'],['witch','NIGHT_WITCH']]) {
  elements.get('witchAction').options=[{value:'skip'},{value:'save'},{value:'poison'}];elements.get('witchAction').selectedOptions=[{value:'skip'}];elements.get('witchAction').value='skip';
  run(`state.privateState.role='${role}';state.room.phase='${phase}';renderPrivate();renderActions();`);
  assert.equal(elements.get('skill').hidden,false);
  assert.equal(elements.get('witchField').hidden,role!=='witch');
  run("state.room.phase='SPEECH';state.room.currentSeatId='P2';renderActions();");assert.equal(elements.get('skill').hidden,true);assert.equal(elements.get('speech').hidden,true);
}
run("state.room.currentSeatId='P1';renderActions();");assert.equal(elements.get('speech').hidden,false);
run("state.privateState.role='hunter';state.privateState.alive=false;renderActions();");assert.equal(elements.get('hunterShot').hidden,false);assert.equal(elements.get('vote').hidden,true);
run("state.room.phase='GAME_OVER';renderActions();");assert.equal(elements.get('actionCard').hidden,true);
run("state.room.phase='LOBBY';renderPrivate();renderActions();");assert.equal(elements.get('privateCard').hidden,true);
console.log('Lobby, role-specific skills, speech turn, eliminated hunter and game-over visibility passed');

// A link to another instance must not reuse player identity; refreshing the same link must.
const appSource=await readFile(new URL('../app.js',import.meta.url),'utf8');
function entryTest(search, saved) {
  const localStore=new Map(Object.entries(saved));
  const entryContext=vm.createContext({URLSearchParams,location:{search},document:{getElementById:()=>({})},sessionStorage:{getItem:k=>localStore.get(k),removeItem:k=>localStore.delete(k)}});
  vm.runInContext(appSource.slice(0,appSource.indexOf('const message =')),entryContext);
  return vm.runInContext('JSON.stringify({api:state.api,roomId:state.roomId,playerId:state.playerId})',entryContext);
}
assert.equal(JSON.parse(entryTest('?api=http://localhost:5100&room=lab',{'linx-api':'http://localhost:5000','linx-room':'old','linx-player':'old-player'})).playerId,'');
assert.equal(JSON.parse(entryTest('?api=http://localhost:5100&room=lab',{'linx-api':'http://localhost:5100','linx-room':'lab','linx-player':'observer'})).playerId,'observer');
console.log('Lab entry isolation and same-link reload identity passed');
