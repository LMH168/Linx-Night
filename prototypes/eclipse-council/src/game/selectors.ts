import type { Claim, GameState, Player, Scene, Speech } from './types'

export function playerAt(state: GameState, seat: number): Player | undefined {
  return state.players.find((p) => p.seat === seat)
}

export function aliveSeatsOf(state: GameState): number[] {
  return state.players.filter((p) => p.alive).map((p) => p.seat)
}

export function deadSeatsOf(state: GameState): number[] {
  return state.players.filter((p) => !p.alive).map((p) => p.seat)
}

/** 某席位身份对某观察者是否可见 */
export function roleVisibleTo(state: GameState, seat: number, viewer: number | null): boolean {
  const target = playerAt(state, seat)
  if (!target) return false
  if (state.winner != null) return true
  if (target.revealed) return true
  if (viewer != null && viewer === seat) return true
  if (viewer != null) {
    const me = playerAt(state, viewer)
    if (me && me.role === 'wolf' && target.role === 'wolf') return true
  }
  return false
}

export function aliveCount(state: GameState): { total: number; good: number; wolf: number } {
  const alive = state.players.filter((p) => p.alive)
  return {
    total: alive.length,
    good: alive.filter((p) => p.camp === 'good').length,
    wolf: alive.filter((p) => p.camp === 'wolf').length,
  }
}

export function currentSpeaker(state: GameState): number | null {
  if (state.scene !== 'day') return null
  return state.day.current
}

export function speechesOf(state: GameState, seat: number): Speech[] {
  return state.speeches.filter((s) => s.seat === seat)
}

export function lastSpeech(state: GameState, seat: number): Speech | undefined {
  return [...state.speeches].reverse().find((s) => s.seat === seat)
}

export function allClaims(state: GameState): Array<Claim & { by: number; round: number }> {
  return state.speeches.flatMap((s) => s.claims.map((c) => ({ ...c, by: s.seat, round: s.round })))
}

export const SCENE_TEXT: Record<Scene, string> = {
  lobby: '候场',
  deal: '发牌',
  night: '深夜',
  dawn: '破晓',
  day: '白昼',
  vote: '黄昏',
  pk: '对决',
  result: '终局',
}

export function phaseLabel(state: GameState): string {
  if (state.scene === 'night') return `第 ${state.round} 夜`
  if (state.scene === 'dawn' || state.scene === 'day') return `第 ${state.round} 日`
  if (state.scene === 'vote' || state.scene === 'pk') return `第 ${state.round} 日 · 黄昏`
  return SCENE_TEXT[state.scene]
}
