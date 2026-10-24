import { appendEvent } from './model.mjs';

const notify = (room, seat) => appendEvent(room, {type:'player.control_changed',data:{seatId:seat.seatId,connectionState:seat.connectionState,controlSource:seat.controlSource}});
export function heartbeat(room, seat, now = Date.now()) {
  if (seat.playerType !== 'human') throw new Error('only human players have presence');
  seat.lastHeartbeat = now;
  if (seat.connectionState !== 'online') { seat.connectionState = 'online'; notify(room, seat); }
}
export function expirePresence(room, now = Date.now(), timeoutMs = 30000) {
  for (const seat of room.seats) if (seat.playerType === 'human' && seat.connectionState === 'online' && now - seat.lastHeartbeat > timeoutMs) {
    seat.connectionState = 'disconnected'; notify(room, seat);
  }
}
export function setHumanControl(room, seat, mode) {
  if (seat.playerType !== 'human' || seat.controlSource === 'linx') throw new Error('only a human seat can change control');
  if (!['human','rule_bot'].includes(mode)) throw new Error('invalid control mode');
  if (room.invalidated || room.preparing || ['LOBBY','GAME_OVER'].includes(room.phase)) throw new Error('control is unavailable');
  if (seat.controlSource === mode) return;
  seat.controlSource = mode; seat.controlEpoch = (seat.controlEpoch || 0) + 1; notify(room, seat);
}
