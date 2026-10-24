import { randomUUID } from 'node:crypto';

export class AiScheduler {
  #rooms = new Map();
  #running = new Set();
  constructor({ adapter, now = () => Date.now(), timeoutMs = 30_000, defaultAction }) { this.adapter = adapter; this.now = now; this.timeoutMs = timeoutMs; this.defaultAction = defaultAction; }
  register(room) { this.#rooms.set(room.roomId, room); return room.roomId; }
  unregister(roomId) { this.#rooms.delete(roomId); }
  async tick(roomId) {
    const room = this.#rooms.get(roomId); if (!room) throw new Error('room not registered');
    const seat = room.seats.find(item => item.playerType === 'ai' && item.alive && this.adapter.isTurn(room, item)); if (!seat) return { status: 'idle' };
    const key = `${roomId}:${room.version}:${seat.seatId}`; if (this.#running.has(key)) return { status: 'running', seatId: seat.seatId };
    this.#running.add(key); const started = this.now();
    try { const result = await Promise.race([this.adapter.play(room, seat), new Promise((_, reject) => setTimeout(() => reject(new Error('AI turn timeout')), this.timeoutMs))]); return { status: 'completed', seatId: seat.seatId, result, elapsedMs: this.now() - started }; }
    catch (error) { const result = await this.defaultAction(room, seat, error); return { status: 'defaulted', seatId: seat.seatId, error: error.message, result }; }
    finally { this.#running.delete(key); }
  }
}

export function createDefaultAction({ submit }) { return async (room, seat, error) => submit(room, seat, { source: 'timeout', reason: error.message }); }
