export type GamePhase =
  | 'LOBBY'
  | 'ROLE_ASSIGNMENT'
  | 'NIGHT_GUARD'
  | 'NIGHT_WOLF'
  | 'NIGHT_SEER'
  | 'NIGHT_WITCH'
  | 'DAY_ANNOUNCEMENT'
  | 'SPEECH'
  | 'VOTE'
  | 'RESULT';

export type GameRole = 'werewolf' | 'villager' | 'seer' | 'witch' | 'guard';
export type GameCamp = 'wolf' | 'good';
export type DemoScene = 'speech' | 'vote' | 'guard' | 'wolf' | 'seer' | 'witch' | 'result';

export interface Seat {
  id: string;
  name: string;
  initial: string;
  role: GameRole;
  camp: GameCamp;
  alive: boolean;
  isSelf?: boolean;
}

/** The only seat shape public HUD components are allowed to receive. */
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

export interface SeerCheck {
  targetSeatId: string;
  result: 'wolf' | 'good';
  night: number;
}

export interface VoteTally {
  seatId: string;
  votes: number;
}

export const ROLE_CATALOG: Record<GameRole, { name: string; en: string; avatar: string; full: string; camp: GameCamp; ability: string; quote: string }> = {
  werewolf: {
    name: '狼人', en: 'THE WEREWOLF', avatar: '/assets/werewolf/avatars/werewolf.webp', full: '/assets/werewolf/full/werewolf.webp', camp: 'wolf',
    ability: '每晚与狼队共同袭击一名玩家。', quote: '月色越深，牙齿越亮。',
  },
  villager: {
    name: '村民', en: 'THE VILLAGER', avatar: '/assets/werewolf/avatars/villager.webp', full: '/assets/werewolf/full/villager.webp', camp: 'good',
    ability: '没有夜间技能，靠发言和投票找出狼人。', quote: '灯亮着，人就还在。',
  },
  seer: {
    name: '预言家', en: 'THE SEER', avatar: '/assets/werewolf/avatars/seer.webp', full: '/assets/werewolf/full/seer.webp', camp: 'good',
    ability: '每晚查验一名玩家的阵营。', quote: '我看见了明天，只是没人愿意听。',
  },
  witch: {
    name: '女巫', en: 'THE WITCH', avatar: '/assets/werewolf/avatars/witch.webp', full: '/assets/werewolf/full/witch.webp', camp: 'good',
    ability: '拥有一瓶解药与一瓶毒药，各限一次。', quote: '药与毒，只差一个念头。',
  },
  guard: {
    name: '守卫', en: 'THE WARDEN', avatar: '/assets/werewolf/avatars/warden.webp', full: '/assets/werewolf/full/warden.webp', camp: 'good',
    ability: '每晚守护一名玩家，不可连续两晚守护同一人。', quote: '门在，灯在，我就还在。',
  },
};

export const PHASE_LABEL: Record<GamePhase, string> = {
  LOBBY: '等待开局',
  ROLE_ASSIGNMENT: '身份揭晓',
  NIGHT_GUARD: '守卫行动',
  NIGHT_WOLF: '狼人行动',
  NIGHT_SEER: '预言家行动',
  NIGHT_WITCH: '女巫行动',
  DAY_ANNOUNCEMENT: '天亮了',
  SPEECH: '顺序发言',
  VOTE: '放逐投票',
  RESULT: '本局结束',
};

export const NIGHT_PHASES: GamePhase[] = ['NIGHT_GUARD', 'NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH'];
export const isNightPhase = (phase: GamePhase) => NIGHT_PHASES.includes(phase);
