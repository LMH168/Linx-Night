import { recordTurn } from '../../server/src/turn-diagnostics.mjs';
import { expireHunterResponse } from '../../../packages/domain/src/engine.mjs';
import { completeTurn, createTurn, expireTurn, updateController } from '../../../packages/domain/src/model.mjs';
import { actionAvailable } from '../../../packages/domain/src/turns.mjs';
import { defaultTurn } from './local.mjs';

export class LinxTurnRuntime {
  constructor({ manager, publish = () => {}, timeoutMs = 60000, nightTimeoutMs = 10000, now = Date.now } = {}) {
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
      if (room.controllers.some(c => c.status !== 'released')) return this.track(room, () => this.manager.release(room));
      return Promise.resolve();
    }
    // Host playback gates public day turns only; private night turns are independent.
    // This runtime drives Linx seats only; human seats act from the web client.
    const seat = room.seats.find(s => s.controlSource === 'linx' && actionAvailable(room, s) && room.controllers.some(c => c.seatId === s.seatId && ['ready','released'].includes(c.status)));
    if (!seat) return Promise.resolve();
    return this.track(room, () => this.play(room, seat));
  }
  track(room, task) {
    room.turnRunning = true;
    const work = Promise.resolve().then(task).finally(() => { this.running.delete(room.roomId); room.turnRunning = false; if (this.again.delete(room)) this.wake(room); });
    this.running.set(room.roomId, work); return work;
  }
  async play(room, seat) {
    const gameId = room.gameId;
    let turn, timer, poll, acceptedRecorded = false;
    const hunterWindow = room.phase === 'HUNTER_RESPONSE' ? room.hunterResponse : null;
    const context = {roomId:room.roomId,gameId,seatId:seat.seatId,windowId:hunterWindow?.windowId};
    recordTurn('selected',context);
    const active = () => !room.invalidated && room.gameId === gameId && room.phase !== 'LOBBY';
    try {
      const controllerBeforeConnect = room.controllers.find(item => item.seatId === seat.seatId);
      const reused = seat.controlSource === 'linx' && controllerBeforeConnect?.status === 'ready' && Boolean(controllerBeforeConnect.sessionId);
      if (seat.controlSource === 'linx') await this.manager.ensureConnected(room, seat);
      if (reused) recordTurn('connection_reused', context);
      recordTurn('connection_ready',context);
      if (active() && hunterWindow && this.now() >= Date.parse(hunterWindow.expiresAt)) { expireHunterResponse(room,this.now()); recordTurn('finished',{...context,code:'HUNTER_WINDOW_EXPIRED'}); return; }
      if (!active() || !actionAvailable(room, seat)) return;
      const c = room.controllers.find(c => c.seatId === seat.seatId);
      turn = createTurn(room, { seatId: seat.seatId, controlSource: seat.controlSource, controllerEpoch: c?.controllerEpoch ?? null });
      context.turnId = turn.turnId; recordTurn('lease_created',context);
      const stored = room.turns.find(t => t.turnId === turn.turnId);
      const timeout = seat.controlSource === 'human' && room.phase.startsWith('NIGHT_') && this.timeoutMs >= 1000 ? Math.min(this.timeoutMs, this.nightTimeoutMs) : this.timeoutMs;
      stored.expiresAt = Math.min(this.now() + timeout, room.phase === 'HUNTER_RESPONSE' ? Date.parse(room.hunterResponse.expiresAt) : Infinity);
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
      const windowExpired = hunterWindow && this.now() >= Date.parse(hunterWindow.expiresAt);
      if (windowExpired && active()) expireHunterResponse(room,this.now());
      const cancelled = !active() || (turn && (room.phase !== turn.phase || room.round !== turn.round));
      const code = windowExpired ? 'HUNTER_WINDOW_EXPIRED' : cancelled ? 'TURN_CANCELLED' : error.message === 'TURN_TIMEOUT' ? 'TURN_TIMEOUT' : 'LINX_INPUT_FAILED';
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
  }
}
