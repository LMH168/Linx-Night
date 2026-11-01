import { describe, expect, it } from 'vitest'
import {
  GameError,
  ackDeal,
  beginDeal,
  resolveNight,
  setNightStep,
  wolfKill,
  witchAct,
} from '@/game/engine'
import { witchOptions } from '@/game/rules/witch'
import { mulberry32 } from '@/game/rng'
import { gameWith } from '../helpers'

function toNight() {
  let s = gameWith()
  s = beginDeal(s)
  s = ackDeal(s, 1)
  s = wolfKill(s, 1, 8)
  s = wolfKill(s, 2, 8)
  s = wolfKill(s, 3, 8)
  s = setNightStep(s, 'witch')
  return s
}

describe('女巫', () => {
  it('同一夜不能同时开解药与毒药', () => {
    const s = toNight()
    expect(() => witchAct(s, 5, { save: true, poison: 9 })).toThrow(GameError)
  })

  it('解药用尽后不再收到死者信息', () => {
    let s = toNight()
    s = witchAct(s, 5, { save: true })
    expect(s.witch.antidote).toBe(false)
    const opts = witchOptions({ ...s, round: 2 }, 5)
    expect(opts.victim).toBeNull()
  })

  it('与项目一致，各夜均可自救', () => {
    let s = toNight()
    const opts1 = witchOptions({ ...s, round: 1, night: { ...s.night, wolfTarget: 5 } }, 5)
    expect(opts1.canSave).toBe(true)
    const opts2 = witchOptions({ ...s, round: 2, night: { ...s.night, wolfTarget: 5 } }, 5)
    expect(opts2.canSave).toBe(true)
    expect(opts2.saveBlockedReason).toBeNull()
  })

  it('解药与毒药各限一次', () => {
    let s = toNight()
    s = witchAct(s, 5, { poison: 9 })
    expect(s.witch.poison).toBe(false)
    expect(() => witchAct(s, 5, { poison: 8 })).toThrow(GameError)
  })

  it('毒药可以毒死狼人', () => {
    let s = toNight()
    s = witchAct(s, 5, { poison: 1 })
    s = resolveNight(s, mulberry32(1))
    expect(s.players.find((p) => p.seat === 1)!.alive).toBe(false)
    expect(s.players.find((p) => p.seat === 1)!.deathCause).toBe('poison')
  })

  it('不用药也能正常结束夜晚', () => {
    let s = toNight()
    s = witchAct(s, 5, {})
    expect(s.night.witchActed).toBe(true)
    expect(s.witch.antidote).toBe(true)
    expect(s.witch.poison).toBe(true)
  })
})
