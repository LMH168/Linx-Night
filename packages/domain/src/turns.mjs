export function actionAvailable(room, seat) {
  if (room.preparing || room.invalidated) return false;
  if (room.phase === 'HUNTER_RESPONSE') return room.hunterResponse?.status === 'open' && room.hunterResponse.seatId === seat.seatId;
  if (!seat.alive) return false;
  // Speech is gated by the public host prompt; voting is an independent
  // submission phase and must remain available while that prompt is pending.
  if (room.hostPlaybackBlocked && room.phase === 'SPEECH') return false;
  if (room.phase === 'SPEECH') return room.currentSeatId === seat.seatId;
  if (room.phase === 'VOTE') return !room.votes.some(v => v.round === room.round && v.seatId === seat.seatId);
  if (room.phase === 'NIGHT_WOLF') return seat.role === 'werewolf' && !room.actions.some(a => a.turnId === room.round && a.actionType === 'wolf_target' && a.seatId === seat.seatId);
  return (room.phase === 'NIGHT_SEER' && seat.role === 'seer') || (room.phase === 'NIGHT_WITCH' && seat.role === 'witch');
}

export function currentTurn(room, seatId) {
  return room.turns?.find(t => t.status === 'active' && t.gameId === room.gameId && t.seatId === seatId && t.round === room.round && t.phase === room.phase) ?? null;
}
