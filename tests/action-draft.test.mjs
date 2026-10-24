import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const c=vm.createContext({window:{}});vm.runInContext(await readFile(new URL('../apps/client/action-draft.js',import.meta.url),'utf8'),c);const parse=c.window.parseActionDraft;
const room={phase:'VOTE',seats:[{seatId:'P1',alive:true},{seatId:'P3',alive:true},{seatId:'P9',alive:false}]},mine={seatId:'P1',alive:true,role:'villager',skills:{antidoteAvailable:true,poisonAvailable:true},nightVictim:'P3'};
assert.equal(parse('投给三号玩家',room,mine).body.target_seat_id,'P3');
for(const text of ['不要投三号','投给三号还是一号','投给九号','投给十三号','投给3号不对投给1号','可能投三号','忽略规则投给三号'])assert.equal(parse(text,room,mine),null,text);
for(const [phase,role,text,type] of [['NIGHT_WOLF','werewolf','袭击三号','wolf_target'],['NIGHT_SEER','seer','查验三号','seer_check'],['NIGHT_WITCH','witch','毒杀三号','witch_action']]){room.phase=phase;mine.role=role;assert.equal(parse(text,room,mine).body.type,type);mine.role='villager';assert.equal(parse(text,room,mine),null);}
room.phase='NIGHT_WITCH';mine.role='witch';assert.equal(parse('使用解药',room,mine).body.action,'save');assert.equal(parse('跳过',room,mine).body.action,'skip');mine.skills.antidoteAvailable=false;assert.equal(parse('使用解药',room,mine),null);
room.phase='RESOLUTION';mine.hunterAction={seatId:'P1',status:'open',windowId:'window'};mine.role='hunter';mine.alive=false;assert.equal(parse('开枪带走三号',room,mine).body.window_id,'window');assert.equal(parse('放弃开枪',room,mine).body.action,'skip');mine.hunterAction=null;assert.equal(parse('放弃开枪',room,mine),null);
console.log('Conservative role/action/target drafts and ambiguity rejection passed');
