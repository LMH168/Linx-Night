import { actionAvailable } from '../../../packages/domain/src/turns.mjs';
import { randomUUID } from 'node:crypto';
import { announceDay, advanceNightWindow, skipSeerAction, witchAction, wolfTarget, submitSpeech, submitVote, skipAbsentRoles, voteTargetSeats } from '../../../packages/domain/src/engine.mjs';
import {expireTurn} from '../../../packages/domain/src/model.mjs';
import {recordTurn} from '../../server/src/turn-diagnostics.mjs';

export function tickNightWindow(room) {
  if (room.preparing || room.invalidated || room.nightWindow?.phase !== room.phase || Date.now() < room.nightWindow.expiresAt) return;
  const phase=room.phase;
  for (const seat of room.seats.filter(s=>actionAvailable(room,s))) {
    if (room.phase!==phase) break;
    if (defaultTurn(room,seat)) {
      recordTurn('night_window_default',{roomId:room.roomId,gameId:room.gameId,seatId:seat.seatId,code:'NIGHT_WINDOW_EXPIRED'});
      for (const turn of room.turns.filter(t=>t.status==='active'&&t.phase===phase&&t.round===room.round&&t.seatId===seat.seatId)) expireTurn(room,turn.turnId,'NIGHT_WINDOW_EXPIRED');
    }
  }
  advanceNightWindow(room);
}
export function defaultTurn(room, seat) {
  const id = randomUUID();
  const living = room.seats.filter(s => s.alive);
  const target = living.find(s => s.seatId !== seat.seatId);
  if (room.phase === 'NIGHT_WOLF' && seat.role === 'werewolf') {
    const prior = room.actions.filter(a => a.turnId === room.round && a.actionType === 'wolf_target');
    if (prior.some(a => a.seatId === seat.seatId)) return false;
    const candidates = living.filter(s => s.camp !== 'werewolf');
    wolfTarget(room, seat.seatId, prior[0]?.targetSeatId || candidates[Math.floor(Math.random() * candidates.length)].seatId, id);
  } else if (room.phase === 'NIGHT_SEER' && seat.role === 'seer') skipSeerAction(room,seat.seatId,id);
  else if (room.phase === 'NIGHT_WITCH' && seat.role === 'witch') witchAction(room,seat.seatId,'skip',null,id);
  else if (room.phase === 'SPEECH' && room.currentSeatId === seat.seatId) submitSpeech(room,seat.seatId,'本地规则机器人：暂无补充，交给下一位。',id);
  else if (room.phase === 'VOTE' && actionAvailable(room, seat)) submitVote(room,seat.seatId,voteTargetSeats(room)[0].seatId,id);
  else return false;
  return true;
}
export function tickRoom(room, controlled = seat => seat.controlSource === 'rule_bot' || (seat.playerType === 'ai' && !seat.controlSource && !seat.linxControlled)) {
  if (room.preparing || room.invalidated) return;
  skipAbsentRoles(room);
  if (room.phase === 'DAY_ANNOUNCEMENT') {announceDay(room); return;}
  for (const seat of room.seats.filter(s => s.alive && controlled(s))) if (defaultTurn(room,seat)) break;
}
