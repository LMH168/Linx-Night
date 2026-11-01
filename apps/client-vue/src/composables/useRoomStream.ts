import { ref } from 'vue';
import type { RoomEvent } from '../../../../packages/protocol/src/types';
import type { GameApiClient } from '../api/client';
import { useRoomStore } from '../stores/room';

export function useRoomStream(client: GameApiClient | null, roomId: string) {
  const store = useRoomStore();
  const connected = ref(false);
  const lastError = ref<string | null>(null);
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let delay = 500;

  const close = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    source?.close();
    source = null;
    connected.value = false;
  };

  const schedule = () => {
    if (stopped || timer) return;
    store.markReconnecting();
    timer = setTimeout(() => { timer = null; open(); }, delay);
    delay = Math.min(delay * 2, 8000);
  };

  const open = () => {
    if (stopped || !client || !roomId) return;
    source?.close();
    source = new EventSource(client.eventsUrl(roomId, store.cursor.version));
    const refresh = () => store.refreshAfterEvent(client, roomId).catch(cause => {
      if (!stopped) lastError.value = cause instanceof Error ? cause.message : '状态同步失败';
    });
    source.onopen = () => { connected.value = true; delay = 500; store.markConnected(); void refresh(); };
    source.onmessage = event => {
      try {
        const payload = JSON.parse(event.data) as RoomEvent;
        if (store.acceptEvent(payload)) void refresh();
      } catch (cause) {
        lastError.value = cause instanceof Error ? cause.message : '事件解析失败';
      }
    };
    source.onerror = () => { connected.value = false; source?.close(); source = null; schedule(); };
  };

  stopped = false;
  open();
  return { connected, lastError, close, open };
}
