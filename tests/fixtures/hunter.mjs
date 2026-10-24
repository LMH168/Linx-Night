import { addPlayer, createRoom } from '../../packages/domain/src/model.mjs';
import { announceDay, submitVote } from '../../packages/domain/src/engine.mjs';

export function hunterRoom(cause = 'night') {
  const room = createRoom({ hostPlayerId: 'p1' });
  const roles = ['villager', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager'];
  roles.forEach((role, index) => {
    addPlayer(room, { playerId: `p${index + 1}`, displayName: `玩家 ${index + 1}` });
    Object.assign(room.seats[index], { role, camp: role === 'werewolf' ? 'werewolf' : 'good', skills: { hunterShotAvailable: role === 'hunter' } });
  });
  if (cause === 'vote') {
    room.phase = 'VOTE';
    for (const seat of room.seats) submitVote(room, seat.seatId, 'P7', `vote-${seat.seatId}`);
  } else {
    room.phase = 'DAY_ANNOUNCEMENT';
    room.pendingNight = cause === 'poison' ? { witch: { action: 'poison', targetSeatId: 'P7' } } : { wolfTarget: 'P7' };
    announceDay(room);
  }
  return room;
}
