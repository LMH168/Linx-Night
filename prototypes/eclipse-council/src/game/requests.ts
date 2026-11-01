import type { NightStep } from './types'

export type RequestKind =
  | 'handoff'
  | 'deal-ack'
  | 'wolf-target'
  | 'seer-check'
  | 'seer-result'
  | 'witch-action'
  | 'vote'
  | 'hunter-shot'
  | 'speech'
  | 'last-words'

export interface UiRequest {
  kind: RequestKind
  seat: number | null
  payload: Record<string, unknown>
}

export interface DawnPayload {
  deaths: number[]
  peace: boolean
  text: string
  round: number
}

export type TransitionKind = 'dawn' | 'dusk' | 'boom' | null

export interface DirectorHost {
  getState(): GameStateLike
  speedFactor(): number
  commit(fn: (state: GameStateLike) => GameStateLike): void
  ask(kind: RequestKind, payload?: Record<string, unknown>): Promise<unknown>
  narrate(text: string, kind?: 'host' | 'system'): void
  setNightStage(stage: NightStep | null): void
  setThinking(seat: number, thinking: boolean): void
  setDawn(payload: DawnPayload | null): void
  setTransition(kind: TransitionKind): void
  abortRequest(reason: string): void
  onFinished(): void
}

// 仅用于类型占位，避免 director 依赖 Vue/Pinia
export type GameStateLike = import('./types').GameState
