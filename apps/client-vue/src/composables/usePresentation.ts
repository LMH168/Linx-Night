import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { RoomPublicState } from '../../../../packages/protocol/src/types';
import type { LightKey } from '../data/light';

export function gameLight(state: RoomPublicState | null): LightKey {
  if (!state) return 'dusk';
  if (['NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH'].includes(state.phase)) return 'night';
  if (state.phase === 'DAY_ANNOUNCEMENT') return 'dawn';
  if (['LAST_WORDS', 'RESOLUTION', 'HUNTER_RESPONSE'].includes(state.phase)) {
    const cause = state.lastWords?.cause || state.lastWordsHistory?.at(-1)?.cause;
    if (state.phase === 'LAST_WORDS' && cause) return cause === 'night' ? 'dawn' : 'dusk';
    const events = [...(state.events || [])].reverse();
    return events.find(e => ['game.night_resolved', 'game.vote_resolved'].includes(e.type))?.type === 'game.night_resolved' ? 'dawn' : 'dusk';
  }
  if (state.phase === 'SPEECH') return 'day';
  return 'dusk';
}

export function usePresentation(state: Ref<RoomPublicState | null>, connection: Ref<string>) {
  const light = computed(() => gameLight(state.value));
  const reduced = ref(localStorage.getItem('linx-reduced-motion') === 'true' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const transition = ref(''); const eliminated = ref<string[]>([]); const reveal = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: RoomPublicState | null = null;
  watch(reduced, value => localStorage.setItem('linx-reduced-motion', String(value)));
  let restoring = false;
  watch(connection, status => { if (['reconnecting', 'error', 'idle'].includes(status)) restoring = true; }, { flush: 'sync' });
  watch(state, next => {
    const restored = restoring; restoring = false;
    const before = previous; previous = next ? JSON.parse(JSON.stringify(next)) : null;
    if (!next || !before || before.roomId !== next.roomId || before.gameId !== next.gameId || restored) {
      clearTimeout(timer); transition.value = ''; eliminated.value = []; reveal.value = false; return;
    }
    if ((next.version <= before.version && next.phase === before.phase) || reduced.value) return;
    if (next.phase !== 'GAME_OVER') reveal.value = false;
    eliminated.value = next.seats.filter(s => !s.alive && before.seats.find(old => old.seatId === s.seatId)?.alive).map(s => s.seatId);
    if (next.phase === 'GAME_OVER' && before.phase !== 'GAME_OVER') reveal.value = true;
    const nextLight = gameLight(next), oldLight = gameLight(before);
    const label = nextLight !== oldLight ? ({ night: '夜幕降临', dawn: '破晓', day: '天光渐明', dusk: '暮色将至' }[nextLight]) : next.phase === 'GAME_OVER' && before.phase !== 'GAME_OVER' ? '本局落幕' : '';
    if (label) { clearTimeout(timer); transition.value = label; timer = setTimeout(() => { transition.value = ''; eliminated.value = []; }, 1400); }
  }, { flush: 'sync' });
  onBeforeUnmount(() => clearTimeout(timer));
  return { light, reduced, transition, eliminated, reveal };
}
