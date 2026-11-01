import type { Camp, Claim, Role, Scene } from '../game/types'

/** 公开可见的死因：夜间死亡不区分狼刀/毒杀 */
export type PublicDeath = 'night' | 'vote' | 'gun' | 'selfdestruct'

export interface AiPlayerView {
  seat: number
  name: string
  alive: boolean
  isHuman: boolean
  death: PublicDeath | null
  deathRound: number | null
}

export interface AiSpeechView {
  seat: number
  round: number
  scene: Scene
  text: string
  claims: Claim[]
  kind: 'day' | 'pk' | 'lastwords'
}

/** AI 只能看到这个视图，绝不包含任何隐藏信息 */
export interface AiView {
  self: {
    seat: number
    name: string
    role: Role
    camp: Camp
    persona: string
  }
  round: number
  scene: Scene
  aliveSeats: number[]
  players: AiPlayerView[]
  wolfTeammates: number[]
  seerChecks: Array<{ round: number; target: number; verdict: 'good' | 'wolf' }>
  witch: { antidote: boolean; poison: boolean } | null
  witchVictim: number | null
  speeches: AiSpeechView[]
  roundDeaths: number[]
  revealedVotes: Array<{ voter: number; target: number | null }>
  turnSeconds: number
}

export interface WitchPlan {
  save: boolean
  poison: number | null
}

export interface AgentSpeech {
  text: string
  claims: Claim[]
}

export interface Agent {
  readonly seat: number
  decideNightKill(view: AiView, candidates: number[]): Promise<number | null>
  decideSeerCheck(view: AiView, candidates: number[]): Promise<number>
  decideWitch(view: AiView): Promise<WitchPlan>
  decideVote(view: AiView, candidates: number[]): Promise<number | null>
  decideHunterShot(view: AiView, candidates: number[]): Promise<number | null>
  speak(view: AiView, phase: 'day' | 'pk'): Promise<AgentSpeech>
  lastWords(view: AiView): Promise<string>
}

export type HostCue =
  | { kind: 'lobby' }
  | { kind: 'deal' }
  | { kind: 'night-fall'; round: number }
  | { kind: 'wolves-wake' }
  | { kind: 'wolves-close' }
  | { kind: 'seer-wake' }
  | { kind: 'witch-wake' }
  | { kind: 'dawn'; round: number; deaths: number[]; peace: boolean }
  | { kind: 'hunter-wake'; seat: number }
  | { kind: 'speech-turn'; seat: number }
  | { kind: 'vote-open'; round: 1 | 2 }
  | { kind: 'vote-tie'; seats: number[] }
  | { kind: 'vote-none' }
  | { kind: 'vote-out'; seat: number }
  | { kind: 'selfdestruct'; seat: number }
  | { kind: 'result'; winner: 'wolf' | 'good'; reason: string }

export interface Host {
  narrate(cue: HostCue): Promise<string>
}
