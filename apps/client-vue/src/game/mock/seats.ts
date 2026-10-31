import type { Seat } from '../types';

export const MOCK_SEATS: Seat[] = [
  { id: 'P1', name: '岚', initial: '岚', role: 'villager', camp: 'good', alive: true },
  { id: 'P2', name: '砚', initial: '砚', role: 'werewolf', camp: 'wolf', alive: false },
  { id: 'P3', name: '禾', initial: '禾', role: 'villager', camp: 'good', alive: true },
  { id: 'P4', name: '棠', initial: '棠', role: 'villager', camp: 'good', alive: false },
  { id: 'P5', name: '渡', initial: '渡', role: 'witch', camp: 'good', alive: true },
  { id: 'P6', name: '鸦', initial: '鸦', role: 'werewolf', camp: 'wolf', alive: true },
  { id: 'P7', name: '烬', initial: '烬', role: 'seer', camp: 'good', alive: true },
  { id: 'P8', name: '梧', initial: '梧', role: 'guard', camp: 'good', alive: true },
  { id: 'P9', name: '溪', initial: '溪', role: 'werewolf', camp: 'wolf', alive: false },
];

export const MOCK_VOTE_TALLY = [
  { seatId: 'P6', votes: 4 },
  { seatId: 'P3', votes: 1 },
  { seatId: 'P1', votes: 1 },
];

export const MOCK_STORY = {
  roomId: 'WALD-02',
  day: 2,
  currentSpeakerId: 'P3',
  speech: '昨夜只倒了 P2。守卫还在，狼队就会犯错。P6，你从第一天开始就在跟票——今天该你解释。',
  guardLastTarget: 'P1',
  guardTarget: 'P3',
  wolfTarget: 'P3',
  witchPoisonTarget: 'P2',
};
