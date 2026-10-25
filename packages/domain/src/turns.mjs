export function actionAvailable(room, seat) {
  if (room.preparing || room.invalidated) return false;
  if (room.phase === 'HUNTER_RESPONSE') return room.hunterResponse?.status === 'open' && room.hunterResponse.seatId === seat.seatId;
  const nightEligible = (room.pendingNight?.eligibleSeatIds?.includes(seat.seatId) || (room.pendingNight && room.pendingNight.eligibleSeatIds === undefined && seat.alive)) && ['NIGHT_SEER','NIGHT_WITCH'].includes(room.phase);
  if (!seat.alive && !nightEligible) return false;
  if (room.phase === 'SPEECH') return room.currentSeatId === seat.seatId && !room.speechPlayback;
  if (room.phase === 'VOTE') return !room.votes.some(v => v.round === room.round && v.seatId === seat.seatId);
  if (room.phase === 'NIGHT_WOLF') return seat.role === 'werewolf' && !room.actions.some(a => a.turnId === room.round && a.actionType === 'wolf_target' && a.seatId === seat.seatId);
  const eligible = role => (room.pendingNight?.eligibleSeatIds?.includes(seat.seatId) || (room.pendingNight && room.pendingNight.eligibleSeatIds === undefined && seat.alive)) && seat.role === role;
  return (room.phase === 'NIGHT_SEER' && eligible('seer')) || (room.phase === 'NIGHT_WITCH' && eligible('witch'));
}

export function currentTurn(room, seatId) {
  return room.turns?.find(t => t.status === 'active' && t.gameId === room.gameId && t.seatId === seatId && t.round === room.round && t.phase === room.phase) ?? null;
}
