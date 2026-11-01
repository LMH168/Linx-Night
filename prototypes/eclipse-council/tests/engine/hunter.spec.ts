import { describe, expect, it } from 'vitest'
import {
  ackDeal,
  beginDay,
  beginDeal,
  beginVote,
  castVote,
  hunterShoot,
  resolveNight,
  resolveVote,
  setNightStep,
  wolfKill,
  witchAct,
} from '@/game/engine'
import { canHunterShoot } from '@/game/rules/hunter'
import { mulberry32 } from '@/game/rng'
import { gameWith } from '../helpers'

const rng = () => mulberry32(11)

function toNight() {
  let s = gameWith()
  s = beginDeal(s)
  s = ackDeal(s, 1)
  return s
}

describe('猎人', () => {
  it('被狼刀可以开枪，且枪杀计入当夜死亡', () => {
    let s = toNight()
    s = wolfKill(s, 1, 6)
    s = wolfKill(s, 2, 6)
    s = wolfKill(s, 3, 6)
    s = setNightStep(s, 'witch')
    s = witchAct(s, 5, {})
    s = resolveNight(s, rng())
    expect(s.pendingHunter).toBe(6)

    s = hunterShoot(s, 7)
    expect(s.players.find((p) => p.seat === 7)!.alive).toBe(false)
    expect(s.players.find((p) => p.seat === 7)!.deathCause).toBe('gun')
    expect(s.dawn.deaths).toEqual([6, 7])
    expect(s.pendingHunter).toBeNull()
  })

  it('被毒杀也可以开枪', () => {
    let s = toNight()
    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'witch')
    s = witchAct(s, 5, { poison: 6 })
    s = resolveNight(s, rng())
    expect(s.players.find((p) => p.seat === 6)!.alive).toBe(false)
    expect(s.pendingHunter).toBe(6)
  })

  it('被放逐出局可以开枪', () => {
    let s = toNight()
    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'witch')
    s = witchAct(s, 5, {})
    s = resolveNight(s, rng())
    s = beginDay(s)
    s = beginVote(s, 1)
    for (const seat of [1, 2, 3, 4, 5, 7, 9]) s = castVote(s, seat, 6)
    s = resolveVote(s)
    expect(s.vote.out).toBe(6)
    expect(s.pendingHunter).toBe(6)

    s = hunterShoot(s, 3)
    expect(s.players.find((p) => p.seat === 3)!.alive).toBe(false)
  })

  it('自爆与被枪杀都不能开枪', () => {
    expect(canHunterShoot('selfdestruct')).toBe(false)
    expect(canHunterShoot('gun')).toBe(false)
    expect(canHunterShoot('poison')).toBe(true)
    expect(canHunterShoot('wolf')).toBe(true)
    expect(canHunterShoot('vote')).toBe(true)
  })

  it('没有待开枪猎人时不能开枪', () => {
    const s = toNight()
    expect(() => hunterShoot(s, 3)).toThrow()
  })
})
