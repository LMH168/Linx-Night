import { describe, expect, it } from 'vitest'
import { ackDeal, beginDeal, seerCheck, setNightStep, wolfKill } from '@/game/engine'
import { buildAiView } from '@/ai/view'
import { gameWith } from '../helpers'

function nightGame() {
  let s = gameWith()
  s = beginDeal(s)
  s = ackDeal(s, 1)
  return s
}

describe('AI 信息边界', () => {
  it('平民视角不包含任何身份字段', () => {
    const view = buildAiView(gameWith(), 7)
    expect(view.players.every((p) => !('role' in p))).toBe(true)
    expect(view.wolfTeammates).toEqual([])
    expect(view.seerChecks).toEqual([])
    expect(view.witch).toBeNull()
    expect(view.self.role).toBe('villager')
  })

  it('平民视角的序列化结果里没有任何狼人身份字样', () => {
    const serialized = JSON.stringify(buildAiView(gameWith(), 7))
    expect(serialized).not.toContain('"wolf"')
  })

  it('狼人只看得到狼队友，看不到其他身份', () => {
    const view = buildAiView(gameWith(), 1)
    expect(view.self.role).toBe('wolf')
    expect(view.wolfTeammates.sort()).toEqual([2, 3])
    expect(view.seerChecks).toEqual([])
    expect(view.players.every((p) => !('role' in p))).toBe(true)
  })

  it('预言家可以看到自己的验人记录', () => {
    let s = nightGame()
    s = setNightStep(s, 'seer')
    s = seerCheck(s, 2)
    const view = buildAiView(s, 4)
    expect(view.seerChecks).toEqual([{ round: 1, target: 2, verdict: 'wolf' }])
  })

  it('女巫只在轮到自己时看到死者', () => {
    let s = nightGame()
    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'witch')
    const view = buildAiView(s, 5)
    expect(view.witchVictim).toBe(8)
    expect(view.witch).toEqual({ antidote: true, poison: true })
  })

  it('其他席位看不到女巫的死者信息', () => {
    let s = nightGame()
    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'witch')
    const view = buildAiView(s, 7)
    expect(view.witchVictim).toBeNull()
  })
})
