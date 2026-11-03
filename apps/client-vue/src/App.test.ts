import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import { useRoomStore } from './stores/room';

describe('Vue game shell', () => {
  it('renders public seats and the private action for the current player', async () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    store.publicState = {
      roomId: 'room-test', hostPlayerId: 'p1', gameId: 'game-test', controllerEpoch: 1, controllerPhase: 'ready', preparing: false,
      phase: 'SPEECH', version: 2, round: 0, currentSeatId: 'P1', submittedVoteRound: null, submittedVoteSeatIds: [],
      seats: [{ seatId: 'P1', displayName: '真人', playerType: 'human', controlSource: 'human', alive: true }, { seatId: 'P2', displayName: '灵矽 AI', playerType: 'ai', controlSource: 'linx', alive: true }],
      controllers: [], speeches: [], voteResolutions: [], events: [], hostPlaybackEnabled: false, hostPlaybackBlocked: false
    };
    store.privateState = { roomId: 'room-test', seatId: 'P1', playerId: 'p1', role: 'villager', camp: 'good', alive: true, skills: {}, seerResults: [], currentTurn: null, hunterAction: null };

    const wrapper = mount(App);
    expect(wrapper.text()).toContain('依次发言');
    expect(wrapper.text()).toContain('灵矽 AI');
    expect(wrapper.text()).toContain('我的私密状态');
    expect(wrapper.text()).toContain('开始发言');
    expect(wrapper.find('.voice-transcript textarea').exists()).toBe(false);
    store.connectionStatus = 'connected';
    await wrapper.vm.$nextTick();
    await wrapper.find('.voice-transcript button').trigger('click');
    expect(wrapper.find('.voice-transcript textarea').exists()).toBe(true);
    wrapper.unmount();
  });
  it('reveals roles only after the authenticated settlement response arrives', async () => {
    setActivePinia(createPinia());
    const seats = [{ seatId: 'P1', displayName: '真人', playerType: 'human', alive: true }, { seatId: 'P2', displayName: 'AI', playerType: 'ai', alive: false }];
    sessionStorage.setItem('linx-room', 'finished-room'); sessionStorage.setItem('linx-player', 'p1');
    let finish!: (response: Response) => void;
    const report = new Promise<Response>(resolve => { finish = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.endsWith('/settlement')) return report;
      if (input.endsWith('/private-state')) return new Response(JSON.stringify({ private_state: { seatId: 'P1', playerId: 'p1', role: 'villager', skills: {}, seerResults: [] } }));
      if (input.endsWith('/state')) return new Response(JSON.stringify({ state: { roomId: 'finished-room', gameId: 'g', phase: 'GAME_OVER', version: 10, round: 0, seats, controllers: [], events: [], speeches: [], voteResolutions: [], submittedVoteSeatIds: [], settlement: { settlementId: 's' } } }));
      return new Response('{}');
    }));
    const wrapper = mount(App);
    try {
      await flushPromises();
      expect(wrapper.findAll('.result-roles article')).toHaveLength(0);
      expect(wrapper.text()).toContain('等待授权结算');
      finish(new Response(JSON.stringify({ settlement: { settlementId: 's', winner: 'good', seats: seats.map((seat, i) => ({ ...seat, role: i ? 'werewolf' : 'villager' })) } })));
      await flushPromises();
      expect(wrapper.findAll('.result-roles article')).toHaveLength(2);
      expect(wrapper.text()).toContain('好人阵营获胜');
    } finally { wrapper.unmount(); vi.unstubAllGlobals(); sessionStorage.clear(); }
  });
});
