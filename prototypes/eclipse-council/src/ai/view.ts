import type { GameState } from '../game/types'
import { playerAt } from '../game/selectors'
import type { AiPlayerView, AiSpeechView, AiView, PublicDeath } from './types'
import { witchOptions } from '../game/rules/witch'

/** 夜间死亡对外只公布为 night，不区分狼刀与毒杀 */
function publicDeathOf(state: GameState, seat: number): PublicDeath | null {
  const p = playerAt(state, seat)
  if (!p || p.alive) return null
  switch (p.deathCause) {
    case 'vote':
      return 'vote'
    case 'gun':
      return 'gun'
    case 'selfdestruct':
      return 'selfdestruct'
    default:
      return 'night'
  }
}

/**
 * 构造某个席位的合法信息视图。
 * 任何未公开的身份信息都不会进入返回值——这是 AI 不作弊的结构性保证。
 */
export function buildAiView(state: GameState, seat: number): AiView {
  const self = playerAt(state, seat)
  if (!self) throw new Error(`席位 ${seat} 不存在`)

  const players: AiPlayerView[] = state.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    alive: p.alive,
    isHuman: p.isHuman,
    death: publicDeathOf(state, p.seat),
    deathRound: p.alive ? null : (p.deathRound ?? null),
  }))

  const wolfTeammates =
    self.role === 'wolf'
      ? state.players.filter((p) => p.role === 'wolf' && p.seat !== seat).map((p) => p.seat)
      : []

  const seerChecks =
    self.role === 'seer'
      ? state.seerChecks
          .filter((c) => c.by === seat)
          .map((c) => ({ round: c.round, target: c.target, verdict: c.verdict }))
      : []

  const speeches: AiSpeechView[] = state.speeches.map((s) => ({
    seat: s.seat,
    round: s.round,
    scene: s.scene,
    text: s.text,
    claims: s.claims,
    kind: s.kind,
  }))

  const voteOrder = state.players
    .filter((p) => p.alive)
    .map((p) => p.seat)
    .sort((a, b) => a - b)
  const revealedVotes = voteOrder.slice(0, state.vote.reveal).map((voter) => ({
    voter,
    target: state.vote.ballots[voter] ?? null,
  }))

  let witch: AiView['witch'] = null
  let witchVictim: number | null = null
  if (self.role === 'witch' && self.alive) {
    witch = { antidote: state.witch.antidote, poison: state.witch.poison }
    if (state.scene === 'night' && state.night.step === 'witch') {
      witchVictim = witchOptions(state, seat).victim
    } else {
      witchVictim = state.witch.antidote ? (state.night.wolfTarget ?? null) : null
    }
  }

  return {
    self: {
      seat,
      name: self.name,
      role: self.role,
      camp: self.camp,
      persona: self.persona,
    },
    round: state.round,
    scene: state.scene,
    aliveSeats: state.players.filter((p) => p.alive).map((p) => p.seat),
    players,
    wolfTeammates,
    seerChecks,
    witch,
    witchVictim,
    speeches,
    roundDeaths: state.dawn.deaths.slice(),
    revealedVotes,
    turnSeconds: state.turnSeconds,
  }
}
