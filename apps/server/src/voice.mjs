const phases={NIGHT_WOLF:'天黑请闭眼，狼人行动。',NIGHT_SEER:'预言家行动。',NIGHT_WITCH:'女巫行动。',SPEECH:'天亮了，开始依次发言。',VOTE:'发言结束，请投票。',GAME_OVER:'本局结束。'};
export function publicNarration(room,eventId) {
  const event=room.events.find(e=>e.eventId===eventId);if(!event)throw new Error('公开事件不存在');
  if(event.type==='game.speech_submitted'){
    const speech=room.speeches.find(s=>s.speechId===event.data.speechId);if(speech)return `${speech.seatId} 发言：${speech.text}`;
  }
  if(event.type==='game.phase_changed' && phases[event.data.phase])return phases[event.data.phase];
  if(event.type==='game.hunter_response_closed' && event.data.status==='completed')return `${event.data.seatId} 发动猎人技能，带走 ${event.data.targetSeatId}。`;
  if(event.type==='game.player_eliminated')return `${event.data.seatId} 已出局。`;
  if(event.type==='game.vote_resolved')return `投票结果：${event.data.leaders.join('、')}。`;
  throw new Error('该事件不允许公共播报');
}
export async function readVoiceBody(req) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1300000)throw new Error('录音超过 30 秒限制');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString());
}
