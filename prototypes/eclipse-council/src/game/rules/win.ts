import type { Player, Winner } from '../types'
import { GOD_ROLES } from '../roles'

export interface WinResult {
  winner: Winner | null
  reason: string
}

/**
 * 屠边判定：狼人杀光神职 或 杀光平民即胜；好人杀光狼人即胜。
 * 同时达成时优先判好人（最后一只狼出局的瞬间好人已达成目标）。
 */
export function evaluateWin(players: readonly Player[]): WinResult {
  const alive = players.filter((p) => p.alive)
  const wolves = alive.filter((p) => p.role === 'wolf')
  const gods = alive.filter((p) => GOD_ROLES.includes(p.role))
  const villagers = alive.filter((p) => p.role === 'villager')

  if (wolves.length === 0) {
    return { winner: 'good', reason: '狼人全部出局，好人阵营胜利' }
  }
  if (gods.length === 0) {
    return { winner: 'wolf', reason: '神职全部出局（屠神），狼人阵营胜利' }
  }
  if (villagers.length === 0) {
    return { winner: 'wolf', reason: '平民全部出局（屠民），狼人阵营胜利' }
  }
  return { winner: null, reason: '' }
}
