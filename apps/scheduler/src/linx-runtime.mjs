import { createTurn, expireTurn, updateController } from '../../../packages/domain/src/model.mjs';
import { actionAvailable } from '../../../packages/domain/src/turns.mjs';

export class LinxTurnRuntime {
  constructor({ manager, publish = () => {}, timeoutMs = 60000, now = Date.now } = {}) {
    this.manager = manager; this.publish = publish; this.timeoutMs = timeoutMs; this.now = now; this.running = new Map();
  }
  tick(room) {
    if (this.running.has(room.roomId)) return this.running.get(room.roomId);
    if (!room.requireActionLease || room.preparing || room.invalidated || room.phase === 'LOBBY') return Promise.resolve();
    if (room.phase === 'GAME_OVER') {
      if (room.controllers.some(c => c.status !== 'released')) return this.track(room, () => this.manager.release(room));
      return Promise.resolve();
    }
    const seat = room.seats.find(s => s.controlSource === 'linx' && actionAvailable(room, s) && room.controllers.some(c => c.seatId === s.seatId && ['ready','released'].includes(c.status)));
    if (!seat) return Promise.resolve();
    return this.track(room, () => this.play(room, seat));
  }
  track(room, task) {
    room.turnRunning = true;
    const work = Promise.resolve().then(task).finally(() => { this.running.delete(room.roomId); room.turnRunning = false; });
    this.running.set(room.roomId, work); return work;
  }
  async play(room, seat) {
    const gameId = room.gameId;
    let turn, timer, poll;
    const active = () => !room.invalidated && room.gameId === gameId && room.phase !== 'LOBBY';
    try {
      await this.manager.ensureConnected(room, seat);
      if (!active() || !actionAvailable(room, seat)) return;
      const c = room.controllers.find(c => c.seatId === seat.seatId);
      turn = createTurn(room, { seatId: seat.seatId, controlSource: 'linx', controllerEpoch: c.controllerEpoch });
      const stored = room.turns.find(t => t.turnId === turn.turnId);
      stored.expiresAt = Math.min(this.now() + this.timeoutMs, room.phase === 'HUNTER_RESPONSE' ? Date.parse(room.hunterResponse.expiresAt) : Infinity);
      this.publish(room);
      await new Promise((resolve, reject) => {
        const check = () => {
          if (stored.status === 'completed') { resolve(); return true; }
          if (!active() || room.phase !== stored.phase || room.round !== stored.round || stored.status !== 'active') { reject(new Error('TURN_CANCELLED')); return true; }
          return false;
        };
        timer = setTimeout(() => { if (!check()) reject(new Error('TURN_TIMEOUT')); }, Math.max(1, stored.expiresAt - this.now()));
        poll = setInterval(check, 50);
        Promise.resolve().then(() => this.manager.sendTurn(room, seat)).catch(() => { if (!check()) reject(new Error('LINX_INPUT_FAILED')); });
      });
    } catch (error) {
      if (turn) expireTurn(room, turn.turnId, 'TURN_FAILED');
      if (active() && actionAvailable(room, seat)) {
        const c = room.controllers.find(c => c.seatId === seat.seatId);
        if (c) updateController(room, seat.seatId, { status: 'failed', errorCode: error.message === 'TURN_TIMEOUT' ? 'TURN_TIMEOUT' : 'LINX_TURN_FAILED' });
      }
    } finally {
      clearTimeout(timer); clearInterval(poll);
      const c = room.controllers.find(c => c.seatId === seat.seatId), failed = c?.status === 'failed', code = c?.errorCode;
      try { if (room.gameId === gameId || room.gameId === null) await this.manager.releaseSeat(room, seat); }
      catch { if (c) { c.status = 'failed'; c.errorCode = 'LINX_RELEASE_FAILED'; } }
      if (failed && c) { c.status = 'failed'; c.errorCode = code; }
      this.publish(room);
    }
  }
}
