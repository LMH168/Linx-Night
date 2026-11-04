import { describe, expect, it } from 'vitest'
import {
  ackDeal,
  beginDeal,
  beginNight,
  resolveNight,
  seerCheck,
  setNightStep,
  wolfKill,
  witchAct,
} from '@/game/engine'
import { mulberry32 } from '@/game/rng'
import { gameWith } from '../helpers'

const rng = () => mulberry32(7)

function toNight() {
  let s = gameWith()
  s = beginDeal(s)
  s = ackDeal(s, 1)
  return s
}

describe('夜晚流程', () => {
  it('狼人确认一致目标，天亮单人死亡', () => {
    let s = toNight()
    expect(s.scene).toBe('night')
    expect(s.round).toBe(1)

    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'seer')
    s = seerCheck(s, 1)
    expect(s.night.seerCheck).toEqual({ target: 1, camp: 'wolf', by: 4 })
    s = setNightStep(s, 'witch')
    s = witchAct(s, 5, {})
    s = resolveNight(s, rng())

    expect(s.scene).toBe('dawn')
    expect(s.dawn.deaths).toEqual([8])
    expect(s.dawn.peaceNight).toBe(false)
    expect(s.players.find((p) => p.seat === 8)!.alive).toBe(false)
  })

  it('预言家查验结果只写入自己的私有日志', () => {
    let s = toNight()
    s = setNightStep(s, 'seer')
    s = seerCheck(s, 2)
    const privateLogs = s.log.filter((l) => l.visibility !== 'public')
    expect(privateLogs.length).toBe(1)
    expect(privateLogs[0]!.visibility).toEqual([4])
    expect(privateLogs[0]!.text).toContain('狼人')
  })

  it('女巫开解药形成平安夜', () => {
    let s = toNight()
    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'witch')
    s = witchAct(s, 5, { save: true })
    s = resolveNight(s, rng())
    expect(s.dawn.peaceNight).toBe(true)
    expect(s.dawn.deaths).toEqual([])
    expect(s.players.find((p) => p.seat === 8)!.alive).toBe(true)
  })

  it('狼刀 + 毒药形成双死', () => {
    let s = toNight()
    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'witch')
    s = witchAct(s, 5, { poison: 9 })
    s = resolveNight(s, rng())
    expect(s.dawn.deaths.sort()).toEqual([8, 9])
    expect(s.players.find((p) => p.seat === 9)!.deathCause).toBe('poison')
    expect(s.players.find((p) => p.seat === 8)!.deathCause).toBe('wolf')
  })

  it('拒绝不同提案、重复确认和攻击狼队友', () => {
    let s = toNight()
    expect(() => wolfKill(s,1,2)).toThrow('队友')
    s = wolfKill(s,1,7)
    expect(() => wolfKill(s,2,8)).toThrow('确认')
    expect(() => wolfKill(s,1,7)).toThrow('已确认')
    expect(s.night.wolfTarget).toBe(7)
  })

  it('下一夜轮次递增且夜间状态被重置', () => {
    let s = toNight()
    s = beginNight(s)
    expect(s.round).toBe(2)
    expect(s.night.wolfVotes).toEqual({})
    expect(s.night.witchSave).toBe(false)
  })
})
