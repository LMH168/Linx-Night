import { describe, expect, it } from 'vitest'
import { beginVote, castVote, revealNextBallot, resolveVote } from '@/game/engine'
import { gameWith } from '../helpers'

function voteState() {
  return beginVote(gameWith(), 1)
}

describe('放逐投票', () => {
  it('最高票出局并拥有遗言', () => {
    let s = voteState()
    for (const voter of [1, 2, 4, 5, 6]) s = castVote(s, voter, 3)
    s = castVote(s, 3, 1)
    s = resolveVote(s)
    expect(s.vote.out).toBe(3)
    expect(s.players.find((p) => p.seat === 3)!.alive).toBe(false)
    expect(s.players.find((p) => p.seat === 3)!.deathCause).toBe('vote')
    expect(s.day.lastWords).toEqual([3])
  })

  it('平票进入 PK 阶段', () => {
    let s = voteState()
    for (const voter of [1, 4, 5, 6]) s = castVote(s, voter, 2)
    for (const voter of [2, 7, 8, 9]) s = castVote(s, voter, 3)
    s = resolveVote(s)
    expect(s.vote.tied.sort()).toEqual([2, 3])
    expect(s.scene).toBe('pk')
    expect(s.vote.out).toBeNull()
  })

  it('PK 仅台下投候选人，二次平票无人出局', () => {
    let s = voteState()
    s.vote.pk = [2,3]
    s.players[8]!.alive = false
    s = beginVote(s,2)
    expect(s.vote.pk).toEqual([2,3])
    expect(() => castVote(s,2,3)).toThrow('台上')
    expect(() => castVote(s,1,4)).toThrow('候选人')
    for (const voter of [1,4,5]) s = castVote(s,voter,2)
    for (const voter of [6,7,8]) s = castVote(s,voter,3)
    s = resolveVote(s)
    expect(s.vote.none).toBe(true)
  })
  it('禁止重复投票、空目标和出局玩家投票', () => {
    let s = voteState()
    expect(() => castVote(s,1,null)).toThrow()
    s = castVote(s,1,1)
    expect(() => castVote(s,1,2)).toThrow('已经')
    s.players[1]!.alive=false
    expect(() => castVote(s,2,3)).toThrow()
  })

  it('逐票公示会累加票数', () => {
    let s = voteState()
    s = castVote(s, 1, 4)
    s = castVote(s, 2, 4)
    s = revealNextBallot(s)
    expect(s.vote.tally[4]).toBe(1)
    expect(s.vote.reveal).toBe(1)
    s = revealNextBallot(s)
    expect(s.vote.tally[4]).toBe(2)
  })
})
