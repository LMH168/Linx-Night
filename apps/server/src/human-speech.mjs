import { submitSpeech } from '../../../packages/domain/src/engine.mjs';
import { randomUUID } from 'node:crypto';

export function tickHumanSpeech(room, now = Date.now()) {
  if (room.invalidated || room.preparing || room.phase !== 'SPEECH') { room.speechClock = null; return; }
  const seat = room.seats.find(s => s.seatId === room.currentSeatId);
  if (!seat?.alive || seat.controlSource !== 'human') { room.speechClock = null; return; }
  let clock = room.speechClock;
  if (!clock || clock.gameId !== room.gameId || clock.round !== room.round || clock.seatId !== seat.seatId) {
    room.speechClock = null;
    clock = room.speechClock = { gameId: room.gameId, round: room.round, phase: room.phase, seatId: seat.seatId, stage:'speaking', expiresAt: now + 30000 };
  }
  if (now >= clock.expiresAt) {
    if(clock.stage==='recording'){clock.stage='transcribing';clock.expiresAt+=60000;room.version++;if(now<clock.expiresAt)return;}
    if(clock.stage==='transcribing'){clock.stage='confirming';clock.expiresAt+=15000;room.version++;if(now<clock.expiresAt)return;}
    submitSpeech(room, seat.seatId, '发言时间已到，结束本轮发言。', `speech_timeout_${room.gameId}_${room.round}_${seat.seatId}`);
    room.speechClock = null;
  }
}

export function speechSession(room,seat,now=Date.now()) {
  tickHumanSpeech(room,now);
  const c=room.speechClock;
  if(room.invalidated||room.phase!=='SPEECH'||room.currentSeatId!==seat.seatId||seat.controlSource!=='human'||!seat.alive||!c)throw Error('当前不是你的发言窗口');
  return c;
}
export function startRecording(room,seat,now=Date.now()) {
  const c=speechSession(room,seat,now);
  if(c.stage!=='speaking'||c.recordingId)throw Error('本轮录音已开始或结束');
  c.recordingId=randomUUID();c.recordingStartedAt=now;c.recordingDeadline=c.expiresAt;c.stage='recording';room.version++;
  return {recordingId:c.recordingId,deadline:c.recordingDeadline};
}
export function beginTranscription(room,seat,id,durationMs,now=Date.now()) {
  const c=speechSession(room,seat,now);
  if(c.recordingId!==id||!id||c.uploaded||!['recording','transcribing'].includes(c.stage))throw Error('录音请求已失效');
  if(durationMs>c.recordingDeadline-c.recordingStartedAt)throw Error('录音超过剩余发言时间');
  if(c.stage==='recording'){c.stage='transcribing';c.expiresAt=now+60000;}
  c.uploaded=true;room.version++;return c;
}
export function confirmRecording(room,seat,id,now=Date.now()) {
  const c=speechSession(room,seat,now);
  if(!id||c.recordingId!==id||!['recording','transcribing','confirming'].includes(c.stage))throw Error('录音请求已失效');
  if(c.stage!=='confirming'){c.stage='confirming';c.expiresAt=now+15000;room.version++;}
  return c;
}
