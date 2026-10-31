import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRoomStream } from './useRoomStream';
import { useRoomStore } from '../stores/room';

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) { this.url = url; FakeEventSource.latest = this; }
  close() { this.closed = true; }
}

afterEach(() => {
  vi.useRealTimers();
  FakeEventSource.latest = null;
});

describe('useRoomStream', () => {
  it('opens from the current cursor, deduplicates through the store, and closes', async () => {
    setActivePinia(createPinia());
    Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: FakeEventSource });
    const store = useRoomStore();
    const client = {
      eventsUrl: (room: string, version: number) => `http://api.test/events/${room}?after=${version}`,
      roomState: async () => ({ roomId: 'room-1', version: 1 }),
      privateState: async () => ({ roomId: 'room-1', seatId: 'P1', playerId: 'p1', role: null, camp: null, alive: true, skills: {}, seerResults: [], currentTurn: null, hunterAction: null })
    } as never;
    const stream = useRoomStream(client, 'room-1');
    const source = FakeEventSource.latest;
    expect(source?.url).toContain('after=0');
    source?.onopen?.();
    source?.onmessage?.({ data: JSON.stringify({ eventId: 'evt-1', version: 1, type: 'room.updated', data: {} }) } as MessageEvent<string>);
    await Promise.resolve();
    expect(store.cursor.version).toBe(1);
    source?.onmessage?.({ data: JSON.stringify({ eventId: 'evt-1', version: 1, type: 'room.updated', data: {} }) } as MessageEvent<string>);
    expect(store.recentEvents).toHaveLength(1);
    stream.close();
    expect(source?.closed).toBe(true);
  });
});
