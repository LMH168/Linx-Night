/**
 * 暗林月夜 · 九人局 —— 领域模型
 * 纯数据 + 纯函数，不依赖 Vue，可直接单测。
 */

export type Role = 'wolf' | 'seer' | 'witch' | 'hunter' | 'villager'
export type Camp = 'wolf' | 'good'
export type Winner = 'wolf' | 'good'

/** 场景（前端页面） */
export type Scene = 'lobby' | 'deal' | 'night' | 'dawn' | 'day' | 'vote' | 'pk' | 'result'

/** 夜间子步骤，严格按 狼 → 预 → 巫 轮换 */
export type NightStep = 'wolf' | 'seer' | 'witch' | 'resolve'

export type DeathCause = 'wolf' | 'poison' | 'vote' | 'gun' | 'selfdestruct'

export type LogKind =
  | 'system'
  | 'host'
  | 'night'
  | 'death'
  | 'speech'
  | 'vote'
  | 'skill'
  | 'win'
  | 'selfdestruct'

export type VotePhase = 'collect' | 'reveal' | 'done'

/** 公开发言里的「主张」，让 AI 不必解析自然语言也能推理 */
export type Claim =
  | { kind: 'seer'; target: number; verdict: 'good' | 'wolf' }
  | { kind: 'accuse'; target: number }
  | { kind: 'defend'; target: number }
  | { kind: 'pass' }

export interface Player {
  seat: number
  name: string
  role: Role
  camp: Camp
  alive: boolean
  isHuman: boolean
  persona: string
  /** 出局信息 */
  deathCause?: DeathCause
  deathRound?: number
  deathScene?: Scene
  /** 身份是否已公开（出局 / 结算 / 自爆） */
  revealed: boolean
  lastWords?: string
}

export interface LogEntry {
  id: number
  round: number
  scene: Scene
  kind: LogKind
  text: string
  seat?: number
  ts: number
  /** public 所有人可见；number[] 仅这些席位可见 */
  visibility: 'public' | number[]
}

export interface Speech {
  seat: number
  round: number
  scene: Scene
  text: string
  claims: Claim[]
  kind: 'day' | 'pk' | 'lastwords'
}

export interface NightState {
  step: NightStep
  wolfVotes: Record<number, number>
  wolfTarget: number | null
  seerCheck: { target: number; camp: Camp; by: number } | null
  witchSave: boolean
  witchPoison: number | null
  witchActed: boolean
  /** 结算出的死亡席位（含毒杀，不含枪杀） */
  deaths: number[]
}

export interface DawnState {
  /** 昨夜死亡（含天亮枪杀），用于发言顺序 */
  deaths: number[]
  /** 纯夜间死亡（狼刀 / 毒），用于首夜遗言 */
  nightDeaths: number[]
  peaceNight: boolean
  /** 天亮后已发布遗言的席位 */
  lastWordsGiven: number[]
}

export interface DayState {
  queue: number[]
  index: number
  current: number | null
  /** 待发布遗言的席位队列 */
  lastWords: number[]
  lastWordIndex: number
  ended: boolean
  endReason: 'speeches-done' | 'selfdestruct' | null
}

export interface VoteState {
  round: 1 | 2
  phase: VotePhase
  /** 投票者 → 目标（null = 弃票） */
  ballots: Record<number, number | null>
  /** 已公示的票数索引 */
  reveal: number
  tally: Record<number, number>
  tied: number[]
  out: number | null
  none: boolean
  /** 平票进入 PK 的席位 */
  pk: number[]
  pkRound: number
}

export interface DealState {
  /** 当前正在看牌的席位 */
  preview: number | null
  acked: number[]
}

export interface GameState {
  version: 1
  scene: Scene
  round: number
  players: Player[]
  humanSeats: number[]
  witch: { antidote: boolean; poison: boolean }
  night: NightState
  dawn: DawnState
  day: DayState
  vote: VoteState
  deal: DealState
  /** 天亮后待开枪的猎人 */
  pendingHunter: number | null
  /** 预言家的历史验人记录（仅本人可见） */
  seerChecks: Array<{ round: number; target: number; verdict: 'good' | 'wolf'; by: number }>
  winner: Winner | null
  endReason: string
  log: LogEntry[]
  logSeq: number
  speeches: Speech[]
  /** 每个席位的发言倒计时（秒） */
  turnSeconds: number
  createdAt: number
}

export interface GameConfig {
  /** 真人席位（1..9），至少 1 个 */
  humanSeats: number[]
  names: Record<number, string>
  personas: Record<number, string>
  seed: number
  turnSeconds?: number
}

export const SEAT_COUNT = 9
export const ROLE_POOL: Role[] = [
  'wolf',
  'wolf',
  'wolf',
  'seer',
  'witch',
  'hunter',
  'villager',
  'villager',
  'villager',
]
