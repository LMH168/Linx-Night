import { recordTurn } from '../../server/src/turn-diagnostics.mjs';
import { expireHunterResponse, expireLastWords } from '../../../packages/domain/src/engine.mjs';
import { completeTurn, createTurn, expireTurn, updateController } from '../../../packages/domain/src/model.mjs';
import { actionAvailable } from '../../../packages/domain/src/turns.mjs';
import { defaultTurn } from './local.mjs';

const validTimeout = (value, fallback) => { const timeout = Number(value); return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback; };

export class LinxTurnRuntime {
  constructor({ manager, publish = () => {}, timeoutMs = validTimeout(process.env.LINX_TURN_TIMEOUT_MS, 90000), nightTimeoutMs = validTimeout(process.env.LINX_NIGHT_TIMEOUT_MS, 10000), now = Date.now } = {}) {
    this.manager = manager; this.publish = publish; this.timeoutMs = timeoutMs; this.nightTimeoutMs = nightTimeoutMs; this.now = now; this.running = new Map(); this.pending = new Set(); this.again = new Set();
  }
  wake(room) {
    if (this.running.has(room.roomId)) { this.again.add(room); return; }
    if (this.pending.has(room)) return;
    this.pending.add(room);
    setImmediate(() => {
      this.pending.delete(room);
      this.tick(room).catch(() => recordTurn('runtime_error',{roomId:room.roomId}));
    });
  }
  tick(room) {
    if (this.running.has(room.roomId)) return this.running.get(room.roomId);
    if (!room.requireActionLease || room.preparing || room.invalidated || room.phase === 'LOBBY') return Promise.resolve();
    if (room.phase === 'GAME_OVER') {
      // Game-over cleanup still waits for the host task to settle.
      if(room.hostPlaybackBlocked)return Promise.resolve();
      if (room.controllers.some(c => c.status !== 'released') || room.settlement?.release?.controllers === 'pending') return this.track(room, () => this.releaseGame(room));
      return Promise.resolve();
    }
    // Host playback gates public day turns only; private night turns are independent.
    // This runtime drives Linx seats only; human seats act from the web client.
    if (room.controllers.some(c => c.status === 'failed')) return Promise.resolve();
    const seat = room.seats.find(s => s.controlSource === 'linx' && actionAvailable(room, s) && room.controllers.some(c => c.seatId === s.seatId && ['ready','released'].includes(c.status)));
    if (room.phase === 'SPEECH' && room.speechPlayback?.status === 'pending') this.prewarmNext(room);
    if (!seat) return Promise.resolve();
    return this.track(room, () => this.play(room, seat));
  }
  prewarmNext(room) {
    if (this.prewarming?.has(room.roomId) || !room.currentSeatId) return;
    const current = room.seats.find(seat => seat.seatId === room.currentSeatId);
    const next = room.seats.filter(seat => seat.alive && (!room.pk || room.pk.candidates.includes(seat.seatId)) && seat.seatId > room.currentSeatId).find(seat => seat.controlSource === 'linx');
    if (!current || !next) return;
    const controller = room.controllers.find(item => item.seatId === next.seatId);
    if (!controller) return;
    const previous = room.speechPrewarm;
    if (previous && previous.gameId === room.gameId && previous.round === room.round && previous.phase === room.phase && previous.currentSeatId === room.currentSeatId && previous.nextSeatId === next.seatId && previous.controllerEpoch === controller.controllerEpoch && ['connecting', 'ready', 'failed'].includes(previous.status)) return;
    this.prewarming ??= new Map();
    const marker = { gameId: room.gameId, round: room.round, phase: room.phase, currentSeatId: room.currentSeatId, nextSeatId: next.seatId, controllerEpoch: controller.controllerEpoch, status: 'connecting' };
    room.speechPrewarm = marker; this.prewarming.set(room.roomId, marker);
    const work = Promise.resolve().then(async () => {
      recordTurn('speech_prewarm_started', { roomId: room.roomId, gameId: room.gameId, seatId: next.seatId });
      await this.manager.ensureConnected(room, next);
      const valid = room.gameId === marker.gameId && room.round === marker.round && room.phase === marker.phase && room.currentSeatId === marker.currentSeatId && room.speechPlayback?.status === 'pending' && room.invalidated === false;
      if (!valid) { marker.status = 'stale'; recordTurn('stale_result_rejected', { roomId: room.roomId, gameId: room.gameId, seatId: next.seatId }); return; }
      marker.status = 'ready'; recordTurn('speech_prewarm_ready', { roomId: room.roomId, gameId: room.gameId, seatId: next.seatId });
    }).catch(error => { marker.status = 'failed'; marker.errorCode = error.message; recordTurn('speech_prewarm_failed', { roomId: room.roomId, gameId: room.gameId, seatId: next.seatId, code: error.message }); }).finally(() => { this.prewarming.delete(room.roomId); this.publish(room); });
  }
  track(room, task) {
    room.turnRunning = true;
    const work = Promise.resolve().then(task).finally(() => { this.running.delete(room.roomId); room.turnRunning = false; if (this.again.delete(room)) this.wake(room); });
    this.running.set(room.roomId, work); return work;
  }
  async releaseGame(room) {
    try {
      await this.manager.release(room);
      if (room.settlement) {
        const release = room.settlement.release ??= {};
        release.controllers = 'released';
        release.mcpBindings = 'released';
        release.hostPlayback = 'released';
      }
    } catch (error) {
      if (room.settlement) {
        const release = room.settlement.release ??= {};
        release.controllers = 'failed';
        release.mcpBindings = 'failed';
        release.hostPlayback = 'failed';
        release.error = error.message;
      }
      throw error;
    }
  }
  async play(room, seat, attempt = 0) {
    const gameId = room.gameId;
    let turn, timer, poll, stored, acceptedRecorded = false, retryVote = false;
    const hunterWindow = room.phase === 'HUNTER_RESPONSE' ? room.hunterResponse : null;
    const lastWordsWindow = room.phase === 'LAST_WORDS' ? room.lastWords : null;
    const responseWindow = hunterWindow || lastWordsWindow;
    const expireResponse = hunterWindow ? expireHunterResponse : expireLastWords;
    const expiredCode = hunterWindow ? 'HUNTER_WINDOW_EXPIRED' : 'LAST_WORDS_WINDOW_EXPIRED';
    const context = {roomId:room.roomId,gameId,seatId:seat.seatId,windowId:responseWindow?.windowId};
    recordTurn('selected',context);
    const active = () => !room.invalidated && room.gameId === gameId && room.phase !== 'LOBBY';
    try {
      const controllerBeforeConnect = room.controllers.find(item => item.seatId === seat.seatId);
      const reused = seat.controlSource === 'linx' && controllerBeforeConnect?.status === 'ready' && Boolean(controllerBeforeConnect.sessionId);
      if (seat.controlSource === 'linx') {
        recordTurn(reused ? 'connection_reused' : 'connection_started', context);
        const connectionStartedAt = this.now();
        await this.manager.ensureConnected(room, seat);
        recordTurn('connection_ready', {...context,durationMs:this.now() - connectionStartedAt});
      }
      if (active() && responseWindow && this.now() >= Date.parse(responseWindow.expiresAt)) { expireResponse(room,this.now()); recordTurn('finished',{...context,code:expiredCode}); return; }
      if (!active() || !actionAvailable(room, seat)) return;
      const c = room.controllers.find(c => c.seatId === seat.seatId);
      turn = createTurn(room, { seatId: seat.seatId, controlSource: seat.controlSource, controllerEpoch: c?.controllerEpoch ?? null });
      context.turnId = turn.turnId; recordTurn('lease_created',context);
      stored = room.turns.find(t => t.turnId === turn.turnId);
      const timeout = seat.controlSource === 'human' && room.phase.startsWith('NIGHT_') && this.timeoutMs >= 1000 ? Math.min(this.timeoutMs, this.nightTimeoutMs) : this.timeoutMs;
      stored.expiresAt = Math.min(this.now() + timeout, room.phase === 'HUNTER_RESPONSE' ? Date.parse(room.hunterResponse.expiresAt) : room.phase === 'LAST_WORDS' ? Date.parse(room.lastWords.expiresAt) : Infinity);
      this.publish(room);
      await new Promise((resolve, reject) => {
        const check = () => {
          if (stored.status === 'completed') { if (!acceptedRecorded) { recordTurn('accepted',context); acceptedRecorded = true; } resolve(); return true; }
          if (!active() || room.phase !== stored.phase || room.round !== stored.round || stored.status !== 'active') { reject(new Error('TURN_CANCELLED')); return true; }
          return false;
        };
        timer = setTimeout(() => { if (!check()) reject(new Error('TURN_TIMEOUT')); }, Math.max(1, stored.expiresAt - this.now()));
        poll = setInterval(check, 50);
        if (seat.controlSource === 'linx') Promise.resolve().then(() => this.manager.sendTurn(room, seat)).catch(() => { if (!check()) reject(new Error('LINX_INPUT_FAILED')); });
      });
    } catch (error) {
      const responseDeadline = responseWindow ? Date.parse(responseWindow.expiresAt) : null;
      // Honor the leased response deadline even if its timer fires one millisecond early.
      const windowExpired = responseWindow && (this.now() >= responseDeadline || (error.message === 'TURN_TIMEOUT' && ['HUNTER_RESPONSE','LAST_WORDS'].includes(turn?.phase) && stored?.expiresAt === responseDeadline));
      if (windowExpired && active()) expireResponse(room, Math.max(this.now(), responseDeadline));
      const cancelled = !active() || (turn && (room.phase !== turn.phase || room.round !== turn.round));
      const code = windowExpired ? expiredCode : cancelled ? 'TURN_CANCELLED' : error.message === 'TURN_TIMEOUT' ? 'TURN_TIMEOUT' : 'LINX_INPUT_FAILED';
      retryVote = code === 'TURN_TIMEOUT' && turn?.phase === 'VOTE' && attempt === 0 && seat.controlSource === 'linx' && actionAvailable(room, seat);
      recordTurn('finished',{...context,code});
      if (turn) expireTurn(room, turn.turnId, code);
      if (error.message === 'TURN_TIMEOUT' && seat.controlSource === 'human' && active() && actionAvailable(room, seat)) {
        try { defaultTurn(room, seat); completeTurn(room, turn.turnId); } catch { expireTurn(room, turn.turnId, 'TURN_DEFAULT_FAILED'); }
      } else if (!windowExpired && !cancelled && active() && actionAvailable(room, seat) && seat.controlSource === 'linx') {
        const c = room.controllers.find(c => c.seatId === seat.seatId);
        if (c) updateController(room, seat.seatId, { status: 'failed', errorCode: code });
      }
    } finally {
      clearTimeout(timer); clearInterval(poll);
      const c = room.controllers.find(c => c.seatId === seat.seatId), failed = c?.status === 'failed', code = c?.errorCode;
      // Keep a healthy Linx session alive across turns. Releasing here forced the
      // next AI seat to repeat WebSocket, OTA and MCP binding setup.
      if (failed && (room.gameId === gameId || room.gameId === null)) {
        try { await this.manager.releaseSeat(room, seat); }
        catch { if (c) { c.status = 'failed'; c.errorCode = 'LINX_RELEASE_FAILED'; } }
        if (c) { c.status = 'failed'; c.errorCode = code || c.errorCode; }
      }
      this.publish(room);
    }
    // A stalled model may query state without submitting. Retry once with a new
    // session and lease; never invent a vote or reuse an expired lease.
    if (retryVote && active() && room.phase === turn.phase && room.round === turn.round && actionAvailable(room, seat)) {
      updateController(room, seat.seatId, { status: 'released', errorCode: null });
      recordTurn('vote_retry_started', context);
      await this.play(room, seat, attempt + 1);
    }
  }
}
