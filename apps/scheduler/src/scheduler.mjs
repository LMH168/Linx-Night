import { createTurn, completeTurn, expireTurn } from '../../../packages/domain/src/model.mjs';

export class AiScheduler {
  #rooms = new Map();
  #running = new Set();
  constructor({ adapter, now = () => Date.now(), timeoutMs = 30_000, defaultAction, onEvent = () => {} }) { this.adapter = adapter; this.now = now; this.timeoutMs = timeoutMs; this.defaultAction = defaultAction; this.onEvent = onEvent; }
  register(room) { this.#rooms.set(room.roomId, room); return room.roomId; }
  unregister(roomId) { this.#rooms.delete(roomId); }
  async tick(roomId) {
    const room = this.#rooms.get(roomId); if (!room) throw new Error('room not registered');
    const seat = room.seats.find(item => item.playerType === 'ai' && item.alive && this.adapter.isTurn(room, item)); if (!seat) return { status: 'idle' };
    const controlSource = seat.controlSource || (seat.linxControlled ? 'linx' : 'rule_bot');
    const controller = room.controllers?.find(item => item.seatId === seat.seatId);
    const turn = createTurn(room, { seatId: seat.seatId, controlSource, controllerEpoch: controller?.controllerEpoch ?? null });
    const key = `${roomId}:${turn.turnId}`; if (this.#running.has(key)) return { status: 'running', seatId: seat.seatId, turnId: turn.turnId };
    this.#running.add(key); const started = this.now();
    try {
      const result = await Promise.race([this.adapter.play(room, seat, turn), new Promise((_, reject) => setTimeout(() => reject(new Error('AI turn timeout')), this.timeoutMs))]);
      completeTurn(room, turn.turnId); this.onEvent({ type: 'completed', turn }); return { status: 'completed', seatId: seat.seatId, turnId: turn.turnId, result, elapsedMs: this.now() - started };
    } catch (error) {
      if (controlSource === 'linx') { expireTurn(room, turn.turnId, error.message); this.onEvent({ type: 'waiting', turn, error }); return { status: 'waiting', seatId: seat.seatId, turnId: turn.turnId, error: error.message }; }
      const result = await this.defaultAction(room, seat, error, turn); completeTurn(room, turn.turnId); return { status: 'defaulted', seatId: seat.seatId, turnId: turn.turnId, error: error.message, result };
    } finally { this.#running.delete(key); }
  }
}
export function createDefaultAction({ submit }) { return async (room, seat, error, turn) => submit(room, seat, { source: 'timeout', reason: error.message, turnId: turn.turnId }); }
