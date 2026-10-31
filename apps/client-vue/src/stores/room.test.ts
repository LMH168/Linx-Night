import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRoomStore } from './room';

describe('room store event cursor', () => {
  it('deduplicates event ids and rejects stale versions', () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    const event = (eventId: string, version: number) => ({ eventId, version, type: 'room.updated', data: {} });

    expect(store.acceptEvent(event('evt-1', 1))).toBe(true);
    expect(store.acceptEvent(event('evt-1', 1))).toBe(false);
    expect(store.acceptEvent(event('evt-old', 1))).toBe(false);
    expect(store.acceptEvent(event('evt-2', 2))).toBe(true);
    expect(store.cursor.version).toBe(2);
    expect(store.recentEvents.map(item => item.eventId)).toEqual(['evt-1', 'evt-2']);
  });

  it('hydrates the event history and cursor after refresh', async () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    const client = {
      roomState: async () => ({ roomId: 'room-1', version: 4, events: [{ eventId: 'evt-4', version: 4, type: 'room.updated', data: {} }] }),
      privateState: async () => ({ roomId: 'room-1', seatId: 'P1', playerId: 'p1', role: null, camp: null, alive: true, skills: {}, seerResults: [], currentTurn: null, hunterAction: null })
    } as never;
    await store.hydrate(client, 'room-1');
    expect(store.cursor.version).toBe(4);
    expect(store.recentEvents[0].eventId).toBe('evt-4');
  });
});
