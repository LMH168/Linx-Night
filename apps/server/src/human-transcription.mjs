import { readFile } from 'node:fs/promises';
import { appendEvent } from '../../../packages/domain/src/model.mjs';
import { syncPublicContextClocks } from '../../../packages/domain/src/public-conversation.mjs';
import { recordTurn } from './turn-diagnostics.mjs';

export function updateTranscript(room, record, kind, status, text = '', source = null) {
  record.transcriptionStatus = status;
  record.text = text;
  record.textSource = source;
  room.version++;
  appendEvent(room, { type: kind === 'speech' ? 'game.speech_transcript_updated' : 'game.last_words_transcript_updated', data: { seatId: record.seatId, ...(kind === 'speech' ? { speechId: record.speechId } : { lastWordsId: record.lastWordsId }) } });
  syncPublicContextClocks(room);
}
export class HumanTranscriptions {
  constructor({ voice, publish = () => {}, valid = room => !room.invalidated, deadlineMs = 90000, retryMs = 1000 } = {}) {
    this.voice = voice; this.publish = publish; this.valid = valid; this.deadlineMs = deadlineMs; this.retryMs = retryMs; this.jobs = new Set(); this.tail = Promise.resolve();
  }
  enqueue(room, record, kind) {
    const job = { room, record, kind, gameId: room.gameId, deadline: Date.now() + this.deadlineMs, abort: new AbortController() };
    record.transcriptionStatus = 'pending'; record.textSource = null;
    this.jobs.add(job); syncPublicContextClocks(room);
    job.timer = setTimeout(() => this.finish(job, 'failed', '', 'TRANSCRIPTION_TIMEOUT'), this.deadlineMs); job.timer.unref?.();
    this.tail = this.tail.then(() => this.run(job)).catch(() => this.finish(job, 'failed', '', 'TRANSCRIPTION_FAILED'));
  }
  current(job) { return this.jobs.has(job) && this.valid(job.room) && job.room.gameId === job.gameId; }
  finish(job, status, text = '', code) {
    if (!this.jobs.delete(job)) return;
    clearTimeout(job.timer); clearTimeout(job.retryTimer); job.retryResolve?.(); job.abort.abort();
    if (this.valid(job.room) && job.room.gameId === job.gameId && job.record.textSource !== 'player_supplement') {
      updateTranscript(job.room, job.record, job.kind, status, text, status === 'completed' ? 'transcription' : null);
      recordTurn(status === 'completed' ? 'human_transcription_completed' : 'human_transcription_failed', { roomId: job.room.roomId, gameId: job.gameId, seatId: job.record.seatId, code });
      this.publish(job.room);
    }
  }
  async run(job) {
    if (!this.current(job)) { this.cancelJob(job); return; }
    const { room, record } = job;
    for (let attempt = 0; attempt < 2 && this.current(job); attempt++) {
      updateTranscript(room, record, job.kind, 'processing'); this.publish(room);
      recordTurn('human_transcription_started', { roomId: room.roomId, gameId: job.gameId, seatId: record.seatId });
      const remaining = job.deadline - Date.now();
      const timeout = Math.max(1, Math.min(remaining, (record.durationMs || 30000) + 10000));
      try {
        const signal = AbortSignal.any([job.abort.signal, AbortSignal.timeout(timeout)]);
        const operation = (async () => {
          if (!this.voice) throw Error('REALTIME_TRANSCRIBE_UNAVAILABLE');
          const wav = await readFile(record.audioPath); signal.throwIfAborted();
          const result = await this.voice({ kind: 'transcribe', wav, signal });
          const text = result?.text?.trim();
          if (!text) throw Error('TRANSCRIPTION_EMPTY');
          return text;
        })();
        const text = await new Promise((resolve, reject) => {
          const abort = () => reject(Error('TRANSCRIPTION_TIMEOUT'));
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
          operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
        });
        if (this.current(job)) this.finish(job, 'completed', text.slice(0, job.kind === 'lastwords' ? 200 : 1200));
        return;
      } catch (error) {
        if (!this.current(job)) return;
        if (attempt || Date.now() + this.retryMs >= job.deadline) { this.finish(job, 'failed', '', ['TRANSCRIPTION_EMPTY','TRANSCRIPTION_TIMEOUT','REALTIME_TRANSCRIBE_UNAVAILABLE'].includes(error.message) ? error.message : 'TRANSCRIPTION_FAILED'); return; }
        await new Promise(resolve => { job.retryTimer = setTimeout(resolve, this.retryMs); job.retryResolve = resolve; });
      }
    }
  }
  cancelJob(job) { this.jobs.delete(job); clearTimeout(job.timer); clearTimeout(job.retryTimer); job.retryResolve?.(); job.abort.abort(); }
  cancel(room) { for (const job of this.jobs) if (!room || job.room === room) this.cancelJob(job); }
}
