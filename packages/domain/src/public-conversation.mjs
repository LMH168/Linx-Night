// Project the existing records; do not create a second transcript store.
export function publicConversation(room, hidden = new Set()) {
  return (room.events || []).flatMap(event => {
    const kind = event.type === 'game.speech_submitted' ? 'speech' : event.type === 'game.last_words_submitted' ? 'lastwords' : null;
    if (!kind) return [];
    const id = kind === 'speech' ? event.data.speechId : event.data.lastWordsId;
    if (kind === 'speech' && hidden.has(id)) return [];
    const record = kind === 'speech' ? room.speeches.find(s => s.speechId === id) : room.lastWordsHistory?.find(s => s.lastWordsId === id);
    if (!record) return [];
    return [{ id, sequence: event.version, kind, seatId: record.seatId, round: record.round, text: record.text || '', ...(record.audioId ? { audioId: record.audioId } : {}), transcriptionStatus: record.transcriptionStatus || (record.text ? 'completed' : 'failed'), textSource: record.textSource || (record.text ? 'submitted' : null) }];
  });
}
export function publicContextVersion(room) {
  return (room.events || []).reduce((version, event) => /^game\.(speech|last_words)_(submitted|transcript_updated)$/.test(event.type) ? Math.max(version, event.version) : version, 0);
}
export function pendingPublicContext(room) {
  return [...(room.speeches || []), ...(room.lastWordsHistory || [])].some(s => ['pending', 'processing'].includes(s.transcriptionStatus));
}
// Pause only decision windows. Human microphone windows keep running normally.
export function syncPublicContextClocks(room, now = Date.now()) {
  const pending = pendingPublicContext(room);
  const windows = [room.nightWindow?.phase === room.phase ? room.nightWindow : null, ...[room.hunterResponse, room.lastWords].filter(w => w?.status === 'open' && room.seats.find(s => s.seatId === w.seatId)?.controlSource === 'linx')].filter(Boolean);
  for (const window of windows) {
    if (pending && window.publicContextPausedAt === undefined) window.publicContextPausedAt = now;
    if (!pending && window.publicContextPausedAt !== undefined) {
      const elapsed = Math.max(0, now - window.publicContextPausedAt);
      window.expiresAt = typeof window.expiresAt === 'number' ? window.expiresAt + elapsed : new Date(Date.parse(window.expiresAt) + elapsed).toISOString();
      delete window.publicContextPausedAt;
    }
  }
  return pending;
}
