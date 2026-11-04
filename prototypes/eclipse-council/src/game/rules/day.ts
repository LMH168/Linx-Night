import type { GameState, Player } from '../types'

/** 是否拥有遗言：夜间死亡仅首夜有，白天放逐永久有。 */
export function hasLastWords(_p: Player, round: number, scene: 'night' | 'day'): boolean {
  if (scene === 'day') return true
  return round === 1
}

export function aliveSeats(state: GameState): number[] {
  return state.players.filter((p) => p.alive).map((p) => p.seat)
}

export function seatOf(state: GameState, seat: number): Player {
  const p = state.players.find((x) => x.seat === seat)
  if (!p) throw new Error(`不存在的席位 ${seat}`)
  return p
}
