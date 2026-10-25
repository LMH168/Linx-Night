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
 document:{getElementById:id=>elements.get(id) || null,createElement:()=>({replaceChildren(...children){this.children=children;}})},
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
assert.equal(requests[0].url,'http://127.0.0.1:5100/api/rooms');
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
run("state.room.phase='VOTE';state.room.hostPlaybackBlocked=true;state.privateState.role='villager';state.privateState.alive=true;state.room.seats[0].controlSource='human';renderActions();");assert.equal(elements.get('vote').hidden,false);assert.match(elements.get('turnHint').textContent,/可以直接投票/);
run("state.privateState.role='hunter';state.privateState.alive=false;state.room.phase='RESOLUTION';state.privateState.hunterAction={seatId:'P1',status:'open',windowId:'window',expiresAt:new Date(Date.now()+30000).toISOString()};renderActions();");assert.equal(elements.get('hunterShot').hidden,false);assert.equal(elements.get('vote').hidden,true);
run("state.room.phase='GAME_OVER';renderActions();");assert.equal(elements.get('actionCard').hidden,true);
run("state.room.phase='LOBBY';renderPrivate();renderActions();");assert.equal(elements.get('privateCard').hidden,true);
// Voice input only creates an editable draft; it never calls the game API.
let recognitionInstance;
context.SpeechRecognition=class {
  constructor(){ recognitionInstance=this; }
  start(){ this.onstart?.(); this.onresult?.({results:[[{transcript:'语音草稿'}]]}); this.onend?.(); }
  stop(){ this.onend?.(); }
};
run("state.privateState=fixture;state.privateState.role='villager';state.privateState.alive=true;state.room.phase='SPEECH';state.room.currentSeatId='P1';renderActions();startVoice();");
assert.equal(elements.get('speechText').value,'语音草稿');
assert.equal(JSON.parse(run("JSON.stringify(state.voice)")).draft,true);
assert.match(elements.get('voiceStatus').textContent,/可编辑草稿/);
run("clearVoiceDraft();");
assert.equal(elements.get('speechText').value,'');
assert.equal(JSON.parse(run("JSON.stringify(state.voice)")).draft,false);
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

run("state.room.phase='SPEECH';state.room.hostPlayerId=state.playerId;state.room.controllers=[{seatId:'P2',status:'failed',errorCode:'TURN_TIMEOUT'}];render(state.room);");
assert.equal(elements.get('retryTurn').hidden,false);
assert.match(elements.get('lobbyHint').textContent,/不会自动/);
run("state.room.hostPlayerId='other-host';render(state.room);");
assert.equal(elements.get('retryTurn').hidden,true);
console.log('Host-only AI turn retry visibility passed');

// Old recognition callbacks must not overwrite a cancelled or newer draft.
context.SpeechRecognition=class {constructor(){recognitionInstance=this;}start(){}abort(){this.aborted=true;}};
run("state.room.phase='SPEECH';state.room.currentSeatId='P1';state.privateState.alive=true;state.room.seats[0].playerType='human';state.room.seats[0].controlSource='human';startVoice();");
const oldResult=recognitionInstance.onresult, oldEnd=recognitionInstance.onend;
run('clearVoiceDraft();');oldResult({results:[[{transcript:'迟到结果'}]]});oldEnd();assert.equal(elements.get('speechText').value,'');
run('startVoice();');const stale=recognitionInstance.onresult;
run("state.room.phase='VOTE';renderActions();");stale({results:[[{transcript:'上一阶段'}]]});assert.equal(elements.get('speechText').value,'');assert.equal(recognitionInstance.aborted,true);
run("state.room.phase='SPEECH';state.room.seats[0].controlSource='rule_bot';renderActions();");assert.equal(elements.get('actionCard').hidden,true);assert.equal(elements.get('restoreControl').hidden,false);
run("state.room.seats[0].controlSource='human';renderActions();");assert.equal(elements.get('takeover').hidden,false);
console.log('Voice cancellation/phase guards and explicit control UI passed');

vm.runInContext(await readFile(new URL('../action-draft.js',import.meta.url),'utf8'),context);
run("state.room.phase='VOTE';state.privateState.alive=true;state.room.seats[0].controlSource='human';state.room.seats.push({seatId:'P3',alive:true});");
elements.get('actionDraftText').value='投给三号玩家';const beforeDraft=requests.length;await elements.get('parseAction').onclick();assert.equal(requests.length,beforeDraft);assert.equal(elements.get('confirmDraft').hidden,false);assert.match(elements.get('actionDraftHint').textContent,/P3/);
run("state.room.phase='NIGHT_WOLF';renderActions();");assert.equal(elements.get('confirmDraft').hidden,true);assert.equal(run('state.actionDraft'),null);
console.log('Action draft requires confirmation and expires on phase change');

const voteText=run("formatVoteResolution({entries:[{seatId:'P6',votes:5},{seatId:'P3',votes:2}],totalVotes:7,maxVotes:5,leaders:['P6'],eliminatedSeatId:'P6'})");
assert.match(voteText,/P6：5 票/);assert.match(voteText,/P3：2 票/);assert.match(voteText,/共 7 票/);assert.match(voteText,/放逐 P6/);
console.log('Vote resolution statistics render passed');

run("state.playerId='host';state.room={roomId:'room_test',hostPlayerId:'host',phase:'LOBBY',seats:[{seatId:'P1',playerType:'human',displayName:'房主',alive:true},{seatId:'P2',playerType:'ai',displayName:'AI一号',alive:true},{seatId:'P3',playerType:null,displayName:null,alive:true}],speeches:[],events:[],controllers:[]};render(state.room);");
assert.equal(elements.get('start').disabled,true);assert.equal(elements.get('aiConfig').hidden,false);assert.match(elements.get('counts').textContent,/还需要添加 7 个玩家/);
run("state.room={roomId:'room_test',hostPlayerId:'host',phase:'SPEECH',currentSeatId:'P2',seats:[{seatId:'P1',playerType:'human',displayName:'房主',alive:true},{seatId:'P2',playerType:'ai',displayName:'AI一号',alive:true}],speeches:[],events:[],controllers:[]};render(state.room);");
assert.match(elements.get('seats').children[1].className,/active/);assert.equal(elements.get('seats').children[1].children[1].children[1].textContent.includes('正在发言'),true);
run("state.room={roomId:'room_test',hostPlayerId:'host',phase:'VOTE',submittedVoteSeatIds:['P1'],seats:[{seatId:'P1',playerType:'human',displayName:'房主',alive:true},{seatId:'P2',playerType:'ai',displayName:'AI一号',alive:true}],speeches:[],events:[],controllers:[]};render(state.room);");
assert.match(elements.get('seats').children[0].className,/voted/);assert.match(elements.get('seats').children[0].children[1].children[1].textContent,/已投票/);assert.match(elements.get('seats').children[1].children[1].children[1].textContent,/等待投票/);
console.log('AI room configuration, speech highlight and vote status render passed');

run("state.room={roomId:'room_test',hostPlayerId:'host',phase:'LOBBY',seats:[{seatId:'P1',playerType:'human',displayName:'房主',alive:true},{seatId:'P2',playerType:'ai',displayName:'AI一号',alive:true},{seatId:'P3',playerType:null,displayName:null,alive:true}],speeches:[],events:[],controllers:[]};render(state.room);");
assert.equal(elements.get('aiName').value,'灵矽AI玩家3');
elements.get('aiName').value='自定义 AI'; elements.get('aiName').dataset={edited:'true'};
run("state.room={...state.room,seats:[...state.room.seats]};render(state.room);");
assert.equal(elements.get('aiName').value,'自定义 AI');
console.log('AI seat name prefill and manual name preservation passed');
