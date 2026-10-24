import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { publicEventData } from '../../../packages/domain/src/model.mjs';

export class EventHub {
  #rooms = new Map();
  subscribe(roomId, listener) { if (!this.#rooms.has(roomId)) this.#rooms.set(roomId, new Set()); const listeners = this.#rooms.get(roomId); listeners.add(listener); return () => { listeners.delete(listener); if (!listeners.size) this.#rooms.delete(roomId); }; }
  publish(roomId, event) { for (const listener of this.#rooms.get(roomId) ?? []) listener(event); }
}

export class TimeoutScheduler extends EventEmitter {
  #jobs = new Map();
  schedule({ key = randomUUID(), delayMs, task, onError = error => this.emit('error', error) }) { this.cancel(key); const timer = setTimeout(async () => { this.#jobs.delete(key); try { await task(); this.emit('completed', { key }); } catch (error) { onError(error); this.emit('failed', { key, error }); } }, delayMs); this.#jobs.set(key, timer); return key; }
  cancel(key) { const timer = this.#jobs.get(key); if (timer) clearTimeout(timer); this.#jobs.delete(key); }
  cancelAll() { for (const key of this.#jobs.keys()) this.cancel(key); }
}

export function eventStream(res, hub, roomId, { version = 0, history = [] } = {}) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
  const safe = event => ({ eventId: event.eventId, version: event.version, type: event.type, roomId: event.roomId, data: publicEventData(event.type, event.data) });
  const write = event => res.write(`id: ${event.eventId}\ndata: ${JSON.stringify(safe(event))}\n\n`);
  const unsubscribe = hub.subscribe(roomId, event => { if (event.version > version) write(event); });
  for (const event of history.filter(e => e.version > version)) write(event);
  res.write(': connected\n\n');
  res.on('close', unsubscribe); return unsubscribe;
}
