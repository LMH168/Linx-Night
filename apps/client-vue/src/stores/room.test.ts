import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRoomStore } from './room';

describe('room store event cursor', () => {
  it('ignores snapshots completing after the player leaves', async () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    let finish!: (value: unknown) => void;
    const client = { roomState: () => new Promise(resolve => { finish = resolve; }), privateState: async () => ({ roomId: 'old' }) } as never;
    const pending = store.hydrate(client, 'old');
    store.reset();
    finish({ roomId: 'old', version: 10 });
    await pending;
    expect(store.publicState).toBeNull();
    expect(store.connectionStatus).toBe('idle');
  });

  it('refreshes again if another event arrives while reading a snapshot', async () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    let reads = 0;
    let finish!: (value: unknown) => void;
    const client = {
      roomState: () => ++reads === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ roomId: 'r', version: 2 }),
      privateState: async () => ({ roomId: 'r' })
    } as never;
    const first = store.refreshAfterEvent(client, 'r');
    const second = store.refreshAfterEvent(client, 'r');
    finish({ roomId: 'r', version: 1 });
    await Promise.all([first, second]);
    expect(reads).toBe(2);
    expect(store.publicState?.version).toBe(2);
  });
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

  it('replaces a high cursor when hydrating a different lower-version room', async () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    let roomId = 'room-1';
    const client = {
      roomState: async () => roomId === 'room-1'
        ? { roomId, version: 10, events: [{ eventId: 'evt-10', version: 10, type: 'room.updated', data: {} }] }
        : { roomId, version: 2, events: [{ eventId: 'evt-2', version: 2, type: 'room.updated', data: {} }] },
      privateState: async () => ({ roomId, seatId: 'P1', playerId: 'p1', role: null, camp: null, alive: true, skills: {}, seerResults: [], currentTurn: null, hunterAction: null })
    } as never;
    await store.hydrate(client, 'room-1');
    roomId = 'room-2';
    await store.hydrate(client, 'room-2');
    expect(store.cursor.version).toBe(2);
    expect(store.acceptEvent({ eventId: 'evt-3', version: 3, type: 'room.updated', data: {} })).toBe(true);
  });
});
