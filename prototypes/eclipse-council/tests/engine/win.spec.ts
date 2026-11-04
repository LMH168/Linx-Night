import { describe, expect, it } from 'vitest'
import { checkWin } from '@/game/engine'
import { gameWith } from '../helpers'

describe('胜利判定（屠边）', () => {
  it('狼人全灭，好人胜利', () => {
    let s = gameWith()
    s.players.forEach((p) => {
      if (p.role === 'wolf') p.alive = false
    })
    s = checkWin(s)
    expect(s.winner).toBe('good')
    expect(s.scene).toBe('result')
    expect(s.endReason).toContain('狼人')
  })

  it('神职全灭，狼人屠神胜利', () => {
    let s = gameWith()
    s.players.forEach((p) => {
      if (p.role === 'seer' || p.role === 'witch' || p.role === 'hunter') p.alive = false
    })
    s = checkWin(s)
    expect(s.winner).toBe('wolf')
    expect(s.endReason).toContain('屠神')
  })

  it('平民全灭，狼人屠民胜利', () => {
    let s = gameWith()
    s.players.forEach((p) => {
      if (p.role === 'villager') p.alive = false
    })
    s = checkWin(s)
    expect(s.winner).toBe('wolf')
    expect(s.endReason).toContain('屠民')
  })

  it('只死一个平民时不结束', () => {
    let s = gameWith()
    s.players.find((p) => p.seat === 7)!.alive = false
    s = checkWin(s)
    expect(s.winner).toBeNull()
    expect(s.scene).not.toBe('result')
  })

  it('结算后所有身份公开', () => {
    let s = gameWith()
    s.players.forEach((p) => {
      if (p.role === 'wolf') p.alive = false
    })
    s = checkWin(s)
    expect(s.players.every((p) => p.revealed)).toBe(true)
  })
})
