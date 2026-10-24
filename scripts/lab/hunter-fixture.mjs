import {createRoom,addPlayer,fillAiSeats,beginControllerPreparation,assignRoles} from '../../packages/domain/src/model.mjs';
import {startGame,wolfTarget,seerCheck,witchAction,announceDay} from '../../packages/domain/src/engine.mjs';
export function hunterFixture(){
 const room=createRoom({hostPlayerId:'fixture-observer'});addPlayer(room,{playerId:room.hostPlayerId,displayName:'专项夹具观察员'});fillAiSeats(room);beginControllerPreparation(room,{aiSeatIds:['P2']});room.requireActionLease=true;
 assignRoles(room);
 const roles=['villager','hunter','werewolf','werewolf','werewolf','seer','witch','villager','villager'];
 room.seats.forEach((s,i)=>{s.role=roles[i];s.camp=s.role==='werewolf'?'werewolf':'good';s.controlSource=i===1?'linx':'human';s.skills={hunterShotAvailable:s.role==='hunter',antidoteAvailable:s.role==='witch',poisonAvailable:s.role==='witch'};});
 return room;
}
export function killHunter(room, target = 'P2'){
 startGame(room);for(const id of ['P3','P4','P5'])wolfTarget(room,id,target,`fixture-${id}`);
 seerCheck(room,'P6','P3','fixture-seer');witchAction(room,'P7','skip',null,'fixture-witch');announceDay(room);
}
