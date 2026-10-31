import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import { useRoomStore } from './stores/room';

describe('Vue game shell', () => {
  it('renders public seats and the private action for the current player', () => {
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
    expect(wrapper.text()).toContain('提交发言');
  });
});
