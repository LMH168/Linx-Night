import type { PublicConversationRecord, RoomEvent, RoomPublicState, SpeechRecord, VoteResolution } from '../../../../packages/protocol/src/types';

export interface RecordSource {
  round: number;
  events: RoomEvent[];
  speeches: SpeechRecord[];
  records?: PublicConversationRecord[];
  lastWordsHistory?: RoomPublicState['lastWordsHistory'];
  voteResolutions: VoteResolution[];
}

export function gameRecords(source: RecordSource, seatName: (id: string) => string) {
  let round = 0, seenNight = false, pk = false;
  const speechOrder = new Map<string, { sequence: number; pk: boolean }>();
  const timeline: Array<{ id: string; round: number; text: string }> = [];
  for (const event of source.events) {
    const d = event.data;
    if (typeof d.round === 'number') round = d.round;
    let text = '';
    if (event.type === 'game.phase_changed' && d.phase === 'NIGHT_WOLF') {
      if (seenNight) round += 1;
      seenNight = true; pk = false;
      text = `第${round + 1}夜 · 天黑请闭眼`;
    } else if (event.type === 'game.night_resolved') {
      const deaths = (d.deathSeatIds as string[]) || [];
      text = deaths.length ? `天亮 · ${deaths.map(seatName).join('、')} 出局` : '天亮 · 平安夜';
    } else if (event.type === 'game.pk_started') {
      pk = true;
      text = `平票 · ${((d.candidates as string[]) || []).map(seatName).join('、')} 进入 PK`;
    } else if (event.type === 'game.vote_resolved' && (d.eliminatedSeatId || d.pk)) {
      text = d.eliminatedSeatId ? `放逐结果 · ${seatName(String(d.eliminatedSeatId))} 出局` : 'PK 平票 · 无人出局';
    } else if (event.type === 'game.player_eliminated' && d.cause === 'hunter') {
      text = `公开技能结果 · ${seatName(String(d.seatId))} 出局`;
    } else if (event.type === 'game.settlement_created') {
      text = d.winner === 'good' ? '本局结束 · 好人阵营获胜' : d.winner === 'werewolf' ? '本局结束 · 狼人阵营获胜' : '本局结束';
    }
    if (event.type === 'game.speech_submitted' || event.type === 'game.last_words_submitted') {
      speechOrder.set(String(d.speechId || d.lastWordsId), { sequence: event.version, pk });
    }
    if (text) timeline.push({ id: event.eventId, round, text });
  }
  const entries = new Map<string, { id: string; sequence: number; round: number; seatId: string; text: string; label: string }>();
  const add = (id: string, day: number, seatId: string, text: string, lastwords: boolean, sequence?: number) => {
    const order = speechOrder.get(id);
    entries.set(id, { id, round: day, seatId, text, sequence: sequence ?? order?.sequence ?? Number.MAX_SAFE_INTEGER,
      label: lastwords ? '遗言' : order?.pk ? 'PK 发言' : '普通发言' });
  };
  for (const s of source.speeches) add(s.speechId, s.round, s.seatId, s.text, false);
  for (const w of source.lastWordsHistory || []) {
    if (w.text || w.audioId) add(w.lastWordsId, w.round, w.seatId, w.text || '', true);
  }
  // Settlement reports retain last words in public events rather than a separate history.
  for (const e of source.events) {
    if (e.type === 'game.last_words_submitted' && !entries.has(String(e.data.lastWordsId))) {
      add(String(e.data.lastWordsId), Number(e.data.round), String(e.data.seatId), String(e.data.text || ''), true);
    }
  }
  for (const r of source.records || []) add(r.id, r.round, r.seatId, r.text, r.kind === 'lastwords', r.sequence);
  const speeches = [...entries.values()].sort((a, b) => a.sequence - b.sequence);
  const lastRound = Math.max(source.round, ...speeches.map(s => s.round), ...source.voteResolutions.map(v => v.round), ...timeline.map(e => e.round));
  return { speeches, timeline, days: Array.from({ length: lastRound + 1 }, (_, i) => i) };
}
