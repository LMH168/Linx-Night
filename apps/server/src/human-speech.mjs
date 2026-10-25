import { submitSpeech } from '../../../packages/domain/src/engine.mjs';

export function tickHumanSpeech(room, now = Date.now()) {
  if (room.invalidated || room.preparing || room.phase !== 'SPEECH') { room.speechClock = null; return; }
  const seat = room.seats.find(s => s.seatId === room.currentSeatId);
  if (!seat?.alive || seat.controlSource !== 'human') { room.speechClock = null; return; }
  let clock = room.speechClock;
  if (!clock || clock.gameId !== room.gameId || clock.round !== room.round || clock.seatId !== seat.seatId) {
    room.speechClock = null;
    if (room.hostPlaybackBlocked) return;
    clock = room.speechClock = { gameId: room.gameId, round: room.round, phase: room.phase, seatId: seat.seatId, expiresAt: now + 30000 };
  }
  if (now >= clock.expiresAt) {
    submitSpeech(room, seat.seatId, '发言时间已到，结束本轮发言。', `speech_timeout_${room.gameId}_${room.round}_${seat.seatId}`);
    room.speechClock = null;
  }
}
