import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { PrivateState, RoomEvent, RoomPublicState, SseCursor } from '../../../../packages/protocol/src/types';
import type { GameApiClient } from '../api/client';

export const useRoomStore = defineStore('room', () => {
  const publicState = ref<RoomPublicState | null>(null);
  const privateState = ref<PrivateState | null>(null);
  const connectionStatus = ref<'idle' | 'loading' | 'connected' | 'reconnecting' | 'error'>('idle');
  const error = ref<string | null>(null);
  const cursor = ref<SseCursor>({ version: 0, eventIds: [] });
  const recentEvents = ref<RoomEvent[]>([]);
  let refreshPromise: Promise<void> | null = null;

  const roomId = computed(() => publicState.value?.roomId || '');
  const phase = computed(() => publicState.value?.phase || 'LOBBY');

  function reset() {
    publicState.value = null;
    privateState.value = null;
    connectionStatus.value = 'idle';
    error.value = null;
    cursor.value = { version: 0, eventIds: [] };
    recentEvents.value = [];
  }

  async function hydrate(client: GameApiClient, nextRoomId = publicState.value?.roomId || '') {
    connectionStatus.value = 'loading';
    error.value = null;
    try {
      if (!nextRoomId) throw new Error('缺少房间号');
      const [nextPublic, nextPrivate] = await Promise.all([client.roomState(nextRoomId), client.privateState(nextRoomId)]);
      publicState.value = nextPublic;
      privateState.value = nextPrivate;
      const history = (nextPublic.events || []).slice(-100);
      cursor.value = { version: nextPublic.version || 0, eventIds: history.map(event => event.eventId) };
      recentEvents.value = history;
      connectionStatus.value = 'connected';
    } catch (cause) {
      connectionStatus.value = 'error';
      error.value = cause instanceof Error ? cause.message : '状态读取失败';
      throw cause;
    }
  }

  function acceptEvent(event: RoomEvent): boolean {
    if (!event?.eventId || cursor.value.eventIds.includes(event.eventId)) return false;
    if (event.version <= cursor.value.version) return false;
    cursor.value.version = event.version;
    cursor.value.eventIds = [...cursor.value.eventIds.slice(-99), event.eventId];
    recentEvents.value = [...recentEvents.value.slice(-99), event];
    return true;
  }

  async function refreshAfterEvent(client: GameApiClient, nextRoomId = publicState.value?.roomId || '') {
    if (refreshPromise) return refreshPromise;
    refreshPromise = hydrate(client, nextRoomId).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function markReconnecting() {
    if (connectionStatus.value !== 'error') connectionStatus.value = 'reconnecting';
  }

  function markConnected() {
    connectionStatus.value = 'connected';
  }

  return { publicState, privateState, connectionStatus, error, cursor, recentEvents, roomId, phase, reset, hydrate, acceptEvent, refreshAfterEvent, markReconnecting, markConnected };
});
