import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { gameLight, usePresentation } from './usePresentation';
import type { RoomPublicState } from '../../../../packages/protocol/src/types';
const snapshot = (phase = 'LOBBY', version = 1) => ({ roomId: 'r', gameId: 'g', phase, version, seats: [{ seatId: 'P1', alive: true }], events: [] }) as unknown as RoomPublicState;
describe('server-driven presentation', () => {
  it('keeps the host confirmation at dusk and preserves last-words lighting', () => {
    expect(gameLight(snapshot('NIGHT_ANNOUNCEMENT'))).toBe('dusk');
    expect(gameLight(snapshot('NIGHT_WOLF'))).toBe('night');
    expect(gameLight(snapshot('DAY_ANNOUNCEMENT'))).toBe('dawn');
    expect(gameLight(snapshot('SPEECH'))).toBe('day');
    expect(gameLight({ ...snapshot('LAST_WORDS'), lastWords: { cause: 'night' } as RoomPublicState['lastWords'] })).toBe('dawn');
    expect(gameLight({ ...snapshot('LAST_WORDS'), lastWordsHistory: [{ cause: 'vote' }] as RoomPublicState['lastWordsHistory'] })).toBe('dusk');
  });
  it('never replays history on hydration/reconnect or advances state after an animation', () => {
    vi.useFakeTimers(); localStorage.removeItem('linx-reduced-motion');
    const state = ref<RoomPublicState | null>(null), connection = ref('connected');
    let display!: ReturnType<typeof usePresentation>;
    const wrapper = mount(defineComponent({ setup() { display = usePresentation(state, connection); return () => null; } }));
    state.value = snapshot('NIGHT_WOLF'); expect(display.transition.value).toBe('');
    connection.value = 'loading'; state.value = snapshot('DAY_ANNOUNCEMENT', 2);
    expect(display.transition.value).toBe('破晓');
    vi.advanceTimersByTime(2000); expect(state.value.phase).toBe('DAY_ANNOUNCEMENT');
    connection.value = 'reconnecting'; connection.value = 'loading'; state.value = snapshot('GAME_OVER', 10);
    expect(display.transition.value).toBe(''); expect(display.reveal.value).toBe(false);
    display.reduced.value = true; state.value = snapshot('NIGHT_WOLF', 11); expect(display.transition.value).toBe('');
    wrapper.unmount(); vi.useRealTimers();
  });
});
