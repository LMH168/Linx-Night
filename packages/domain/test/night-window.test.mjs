import assert from 'node:assert/strict';
import {createRoom,addPlayer,fillAiSeats,assignRoles} from '../src/model.mjs';
import {startGame,wolfTarget,seerCheck,witchAction} from '../src/engine.mjs';
import {actionAvailable} from '../src/turns.mjs';
import {tickNightWindow} from '../../../apps/scheduler/src/local.mjs';
const realNow=Date.now;let now=100000;Date.now=()=>now;
function setup(){const r=createRoom({hostPlayerId:'human'});addPlayer(r,{playerId:'human',displayName:'真人'});fillAiSeats(r);assignRoles(r);r.nightPhaseDurationMs=15000;startGame(r);return r;}
try {
 const r=setup(),wolves=r.seats.filter(s=>s.role==='werewolf'),seer=r.seats.find(s=>s.role==='seer'),witch=r.seats.find(s=>s.role==='witch');
 const victim=r.seats.find(s=>s.camp==='good');
 for(const s of wolves)wolfTarget(r,s.seatId,victim.seatId,'wolf-'+s.seatId);
 assert.equal(r.phase,'NIGHT_WOLF');assert.ok(wolves.every(s=>!actionAvailable(r,s)));
 now+=14999;tickNightWindow(r);assert.equal(r.phase,'NIGHT_WOLF');
 now++;tickNightWindow(r);assert.equal(r.phase,'NIGHT_SEER');
 seerCheck(r,seer.seatId,victim.seatId,'seer');assert.equal(actionAvailable(r,seer),false);assert.equal(r.phase,'NIGHT_SEER');
 now+=15000;tickNightWindow(r);assert.equal(r.phase,'NIGHT_WITCH');
 witchAction(r,witch.seatId,'skip',null,'witch');assert.equal(actionAvailable(r,witch),false);assert.equal(r.phase,'NIGHT_WITCH');
 now+=15000;tickNightWindow(r);assert.equal(r.phase,'DAY_ANNOUNCEMENT');
 const silent=setup();now+=15000;tickNightWindow(silent);assert.equal(silent.phase,'NIGHT_SEER');assert.equal(silent.actions.filter(a=>a.actionType==='wolf_target').length,3);
 now+=15000;tickNightWindow(silent);assert.equal(silent.phase,'NIGHT_WITCH');
 now+=15000;tickNightWindow(silent);assert.equal(silent.phase,'DAY_ANNOUNCEMENT');
 const absent=setup();for(const s of absent.seats.filter(s=>['seer','witch'].includes(s.role)))s.alive=false;
 now+=15000;tickNightWindow(absent);assert.equal(absent.phase,'NIGHT_SEER');
 // Even absent roles retain their public 15-second window.
 const {skipAbsentRoles}=await import('../src/engine.mjs');skipAbsentRoles(absent);
 now+=15000;tickNightWindow(absent);assert.equal(absent.phase,'NIGHT_WITCH');
 now+=15000;tickNightWindow(absent);assert.equal(absent.phase,'DAY_ANNOUNCEMENT');
} finally {Date.now=realNow;}
console.log('Night windows stay 15 seconds for early actions, silence and absent roles');
