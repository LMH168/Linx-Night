import { describe, expect, it } from 'vitest'
import { buildAiView } from '@/ai/view'
import { LocalAgent } from '@/ai/localAgent'
import { ackDeal, beginDeal, beginVote, seerCheck, setNightStep } from '@/game/engine'
import { gameWith } from '../helpers'

describe('本地 AI 行为合法性', () => {
  const seats = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  it('投票永远落在候选范围内且不投自己', async () => {
    for (const seed of [1, 7, 99, 2026]) {
      const state = beginVote(gameWith(), 1)
      for (const seat of seats) {
        const view = buildAiView(state, seat)
        const candidates = view.aliveSeats.filter((s) => s !== seat)
        const agent = new LocalAgent(seat, view.self.persona, seed)
        const target = await agent.decideVote(view, candidates)
        if (target !== null) {
          expect(candidates).toContain(target)
          expect(target).not.toBe(seat)
        }
      }
    }
  })

  it('狼人不会把队友当成刀口', async () => {
    for (const seed of [3, 11, 42]) {
      const state = gameWith()
      const view = buildAiView(state, 1)
      const agent = new LocalAgent(1, view.self.persona, seed)
      const candidates = view.aliveSeats.filter((s) => s !== 1)
      const target = await agent.decideNightKill(view, candidates)
      if (target !== null) {
        expect(view.wolfTeammates).not.toContain(target)
        expect(target).not.toBe(1)
      }
    }
  })

  it('预言家不会重复查验同一个人', async () => {
    const state = gameWith()
    const view = buildAiView(state, 4)
    const agent = new LocalAgent(4, view.self.persona, 5)
    const candidates = view.aliveSeats.filter((s) => s !== 4)
    const target = await agent.decideSeerCheck(view, candidates)
    expect(candidates).toContain(target)
  })

  it('发言一定会产出非空文本与合法主张', async () => {
    const state = gameWith()
    for (const seat of seats) {
      const view = buildAiView(state, seat)
      const agent = new LocalAgent(seat, view.self.persona, 13)
      const speech = await agent.speak(view, 'day')
      expect(speech.text.length).toBeGreaterThan(0)
      for (const claim of speech.claims) {
        expect(['seer', 'accuse', 'defend', 'pass']).toContain(claim.kind)
      }
    }
  })

  it('预言家会在白天报出验人结果', async () => {
    let state = gameWith()
    state = beginDeal(state)
    state = ackDeal(state, 1)
    state = setNightStep(state, 'seer')
    state = seerCheck(state, 2)
    const view = buildAiView(state, 4)
    const agent = new LocalAgent(4, view.self.persona, 21)
    const speech = await agent.speak(view, 'day')
    expect(speech.claims.some((c) => c.kind === 'seer')).toBe(true)
    expect(speech.claims.find((c) => c.kind === 'seer')).toMatchObject({
      target: 2,
      verdict: 'wolf',
    })
  })

  it('相同种子下决策可复现', async () => {
    const state = beginVote(gameWith(), 1)
    const view = buildAiView(state, 8)
    const a = new LocalAgent(8, view.self.persona, 777)
    const b = new LocalAgent(8, view.self.persona, 777)
    const candidates = view.aliveSeats.filter((s) => s !== 8)
    const first = await a.decideVote(view, candidates)
    const second = await b.decideVote(view, candidates)
    expect(first).toBe(second)
  })
})
