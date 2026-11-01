import { createGame } from '@/game/engine'
import type { GameState, Role } from '@/game/types'

export const LAYOUT: Role[] = [
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

/** 构造一个身份固定的对局（席位 1..9 按数组顺序），用于单测 */
export function gameWith(
  roles: Role[] = LAYOUT,
  humanSeats: number[] = [1],
): GameState {
  const state = createGame({
    humanSeats,
    names: {},
    personas: {},
    seed: 20261101,
    turnSeconds: 40,
  })
  state.players.forEach((p, index) => {
    const role = roles[index]!
    p.role = role
    p.camp = role === 'wolf' ? 'wolf' : 'good'
  })
  return state
}

export function seatsAlive(state: GameState): number[] {
  return state.players.filter((p) => p.alive).map((p) => p.seat)
}
