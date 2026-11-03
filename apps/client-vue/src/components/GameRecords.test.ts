import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import GameRecords from './GameRecords.vue';
import PublicVoiceStatus from './PublicVoiceStatus.vue';
import { gameRecords, type RecordSource } from '../game/records';
import type { PublicConversationRecord, RoomEvent } from '../../../../packages/protocol/src/types';

const event = (version: number, type: string, data: Record<string, unknown>): RoomEvent => ({ eventId: `e${version}`, version, type, data });
const source = (): RecordSource => ({
  round: 1,
  events: [
    event(1, 'game.phase_changed', { phase: 'NIGHT_WOLF' }),
    event(2, 'game.phase_changed', { phase: 'NIGHT_SEER' }),
    event(3, 'game.night_resolved', { round: 0, deathSeatIds: ['P1'] }),
    event(4, 'game.last_words_submitted', { lastWordsId: 'w1', seatId: 'P1', round: 0, text: '我的遗言' }),
    event(5, 'game.speech_submitted', { speechId: 's1', seatId: 'P2' }),
    event(6, 'game.pk_started', { round: 0, candidates: ['P2', 'P3'] }),
    event(7, 'game.phase_changed', { phase: 'SPEECH', seatId: 'P2' }),
    event(8, 'game.speech_submitted', { speechId: 's2', seatId: 'P2' }),
    event(9, 'game.vote_resolved', { round: 0, pk: true, eliminatedSeatId: null }),
    event(10, 'game.phase_changed', { phase: 'NIGHT_ANNOUNCEMENT' }),
    event(11, 'game.phase_changed', { phase: 'NIGHT_WOLF' }),
    event(12, 'game.night_resolved', { round: 1, deathSeatIds: [] }),
    event(13, 'game.speech_submitted', { speechId: 's3', seatId: 'P3' }),
  ],
  speeches: [
    { speechId: 's1', seatId: 'P2', round: 0, text: '第一天发言', audioId: 'a1' },
    { speechId: 's2', seatId: 'P2', round: 0, text: '我的 PK 发言' },
    { speechId: 's3', seatId: 'P3', round: 1, text: '第二天发言' },
  ],
  voteResolutions: [{ resolutionId: 'v1', round: 0, pk: true, entries: [{ seatId: 'P2', votes: 2 }, { seatId: 'P3', votes: 2 }], totalVotes: 4, maxVotes: 2, leaders: ['P2', 'P3'], eliminatedSeatId: null }],
});
const seatName = (id: string) => `${id} · 玩家`;

describe('day-based public records', () => {
  it('merges last words chronologically, labels PK speeches and keeps only public milestones on their own day', () => {
    const data = source();
    data.records = [{ id: 's1', sequence: 5, round: 0, kind: 'speech', seatId: 'P2', text: '更新的文字', transcriptionStatus: 'completed', textSource: 'transcription' }];
    const result = gameRecords(data, seatName);
    expect(result.days).toEqual([0, 1]);
    expect(result.speeches.map(s => [s.id, s.label])).toEqual([['w1', '遗言'], ['s1', '普通发言'], ['s2', 'PK 发言'], ['s3', '普通发言']]);
    expect(result.speeches[1].text).toBe('更新的文字');
    expect(result.timeline.filter(e => e.round === 1).map(e => e.text)).toEqual(['第2夜 · 天黑请闭眼', '天亮 · 平安夜']);
    expect(result.timeline).toHaveLength(6);
  });

  it('defaults to today, switches days and tabs, and preserves the chosen history day when play advances', async () => {
    const wrapper = mount(GameRecords, { props: { source: source(), seatName } });
    await wrapper.get('.records-toggle').trigger('click');
    expect(wrapper.text()).toContain('第二天发言');
    expect(wrapper.text()).not.toContain('第一天发言');
    await wrapper.findAll('.record-days button')[0].trigger('click');
    expect(wrapper.findAll('.record-card')).toHaveLength(3);
    expect(wrapper.text()).not.toContain('重播原声');
    await wrapper.findAll('.record-tabs button')[1].trigger('click');
    expect(wrapper.text()).toContain('PK 重投');
    expect(wrapper.text()).toContain('结果：平票，无人出局');
    await wrapper.setProps({ source: { ...source(), round: 2 } });
    expect(wrapper.get('.record-days button[aria-pressed="true"]').text()).toBe('第 1 天');
    await wrapper.findAll('.record-tabs button')[2].trigger('click');
    expect(wrapper.text()).toContain('天亮 · P1 · 玩家 出局');
    expect(wrapper.text()).not.toContain('夜间行动中');
    wrapper.unmount();
  });

  it('hides transcription diagnostics and retains only the current player’s failed-record recovery', async () => {
    const record: PublicConversationRecord = { id: 'r1', sequence: 1, round: 0, kind: 'speech', seatId: 'P1', text: '不应重复展示', transcriptionStatus: 'completed', textSource: 'transcription' };
    const wrapper = mount(PublicVoiceStatus, { props: { records: [record], selfSeatId: 'P1', client: null, roomId: 'room' } });
    expect(wrapper.find('section').exists()).toBe(false);
    await wrapper.setProps({ records: [{ ...record, transcriptionStatus: 'failed', seatId: 'P2' }] });
    expect(wrapper.find('section').exists()).toBe(false);
    await wrapper.setProps({ records: [{ ...record, transcriptionStatus: 'failed' }] });
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('不应重复展示');
    wrapper.unmount();
  });
});
