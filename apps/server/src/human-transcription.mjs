import { appendEvent } from '../../../packages/domain/src/model.mjs';
import { syncPublicContextClocks } from '../../../packages/domain/src/public-conversation.mjs';

export function updateTranscript(room, record, kind, status, text = '', source = null) {
  record.transcriptionStatus = status;
  record.text = text;
  record.textSource = source;
  room.version++;
  appendEvent(room, { type: kind === 'speech' ? 'game.speech_transcript_updated' : 'game.last_words_transcript_updated', data: { seatId: record.seatId, ...(kind === 'speech' ? { speechId: record.speechId } : { lastWordsId: record.lastWordsId }) } });
  syncPublicContextClocks(room);
}
