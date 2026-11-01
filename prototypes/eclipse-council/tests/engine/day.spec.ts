import { describe, expect, it } from 'vitest'
import {
  ackDeal,
  beginDay,
  beginDeal,
  beginVote,
  endDayToVote,
  giveLastWords,
  nextSpeaker,
  resolveNight,
  setNightStep,
  selfDestruct,
  speak,
  wolfKill,
  witchAct,
} from '@/game/engine'
import { mulberry32 } from '@/game/rng'
import { gameWith } from '../helpers'

const rng = () => mulberry32(5)

function dawnWithDeaths(targets: number[], poison?: number) {
  let s = gameWith()
  s = beginDeal(s)
  s = ackDeal(s, 1)
  for (const [i, wolf] of [1, 2, 3].entries()) s = wolfKill(s, wolf, targets[i] ?? targets[0]!)
  s = setNightStep(s, 'witch')
  s = witchAct(s, 5, { poison: poison ?? null })
  s = resolveNight(s, rng())
  return s
}

describe('白天流程', () => {
  it('首夜死者拥有遗言', () => {
    const s = beginDay(dawnWithDeaths([8]))
    expect(s.scene).toBe('day')
    expect(s.day.lastWords).toEqual([8])
  })

  it('第二夜及之后夜间死亡无遗言', () => {
    let s = dawnWithDeaths([8])
    s.round = 2
    s = beginDay(s)
    expect(s.day.lastWords).toEqual([])
  })

  it('发言按存活号码递增', () => {
    const s = beginDay(dawnWithDeaths([8], 9))
    expect(s.day.queue).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(s.day.current).toBe(1)
  })

  it('平安夜从最小存活号起', () => {
    let s = gameWith()
    s = beginDeal(s)
    s = ackDeal(s, 1)
    s = wolfKill(s, 1, 8)
    s = wolfKill(s, 2, 8)
    s = wolfKill(s, 3, 8)
    s = setNightStep(s, 'witch')
    s = witchAct(s, 5, { save: true })
    s = resolveNight(s, rng())
    s = beginDay(s)
    expect(s.day.queue[0]).toBe(1)
  })

  it('发言推到底后标记结束', () => {
    let s = beginDay(dawnWithDeaths([8]))
    const total = s.day.queue.length
    for (let i = 1; i < total; i++) s = nextSpeaker(s)
    expect(s.day.current).toBe(s.day.queue[total - 1])
    s = nextSpeaker(s)
    expect(s.day.ended).toBe(true)
    expect(s.day.endReason).toBe('speeches-done')
  })

  it('本项目禁止狼人自爆', () => {
    const s = beginDay(dawnWithDeaths([8]))
    expect(() => selfDestruct(s, 1)).toThrow('不支持')
    expect(s.players[0]!.alive).toBe(true)
  })

  it('好人不能自爆', () => {
    const s = beginDay(dawnWithDeaths([8]))
    expect(() => selfDestruct(s, 4)).toThrow()
  })

  it('发言与遗言都会进入时间线', () => {
    let s = beginDay(dawnWithDeaths([8]))
    s = speak(s, 7, '我觉得 2 号有问题', [{ kind: 'accuse', target: 2 }])
    s = giveLastWords(s, 8, '我是好人')
    expect(s.speeches.length).toBe(2)
    expect(s.speeches[0]!.claims[0]).toEqual({ kind: 'accuse', target: 2 })
    expect(s.players.find((p) => p.seat === 8)!.lastWords).toBe('我是好人')
  })

  it('发言结束进入黄昏投票', () => {
    let s = beginDay(dawnWithDeaths([8]))
    s = endDayToVote(s)
    expect(s.scene).toBe('vote')
    expect(s.vote.round).toBe(1)
  })

  it('投票阶段可以重置进入第二轮', () => {
    let s = beginDay(dawnWithDeaths([8]))
    s = endDayToVote(s)
    s = beginVote(s, 2)
    expect(s.vote.round).toBe(2)
    expect(s.vote.ballots).toEqual({})
  })
})
