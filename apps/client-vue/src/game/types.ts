import type { Role, Phase } from '../../../../packages/protocol/src/types';

export type GamePhase = Phase;
export type GameRole = Role;
export type GameCamp = 'wolf' | 'good';
export interface PublicSeat {
  id: string;
  name: string;
  initial: string;
  alive: boolean;
  isSelf: boolean;
  isSpeaking: boolean;
  isSelected: boolean;
  voted: boolean;
  voteCount: number;
}
export interface SeerCheck { targetSeatId: string; result: 'wolf' | 'good'; night: number; }
export interface VoteTally { seatId: string; votes: number; }
export const ROLE_CATALOG: Record<GameRole, { name: string; en: string; avatar: string; full: string; camp: GameCamp; ability: string; quote: string }> = {
  werewolf: { name: '狼人', en: 'THE WEREWOLF', avatar: '/assets/werewolf/avatars/werewolf.webp', full: '/assets/werewolf/full/werewolf.webp', camp: 'wolf', ability: '每晚与狼队共同袭击一名玩家。', quote: '月色越深，牙齿越亮。' },
  villager: { name: '村民', en: 'THE VILLAGER', avatar: '/assets/werewolf/avatars/villager.webp', full: '/assets/werewolf/full/villager.webp', camp: 'good', ability: '没有夜间技能，靠发言和投票找出狼人。', quote: '灯亮着，人就还在。' },
  seer: { name: '预言家', en: 'THE SEER', avatar: '/assets/werewolf/avatars/seer.webp', full: '/assets/werewolf/full/seer.webp', camp: 'good', ability: '每晚查验一名玩家的阵营。', quote: '我看见了明天，只是没人愿意听。' },
  witch: { name: '女巫', en: 'THE WITCH', avatar: '/assets/werewolf/avatars/witch.webp', full: '/assets/werewolf/full/witch.webp', camp: 'good', ability: '拥有一瓶解药与一瓶毒药，各限一次。', quote: '药与毒，只差一个念头。' },
  hunter: { name: '猎人', en: 'THE HUNTER', avatar: '/assets/werewolf/avatars/hunter.webp', full: '/assets/werewolf/full/hunter.webp', camp: 'good', ability: '被放逐或夜间死亡时可开枪带走一名玩家。', quote: '箭离弦前，所有人都还有机会。' },
};
export const PHASE_LABEL: Record<GamePhase, string> = {
  LOBBY: '等待开局', ROLE_ASSIGNMENT: '身份揭晓', NIGHT_WOLF: '狼人行动', NIGHT_SEER: '预言家行动', NIGHT_WITCH: '女巫行动',
  DAY_ANNOUNCEMENT: '天亮了', HUNTER_RESPONSE: '猎人响应', LAST_WORDS: '遗言', SPEECH: '顺序发言', VOTE: '放逐投票', RESOLUTION: '结算中', GAME_OVER: '本局结束',
};
export const NIGHT_PHASES: GamePhase[] = ['NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH'];
export const isNightPhase = (phase: GamePhase) => NIGHT_PHASES.includes(phase);
