import { mulberry32, type Rng } from '../game/rng'
import { ROLES } from '../game/roles'
import type { Agent, AgentSpeech, AiView, WitchPlan } from './types'
import { accusationsAgainst, collectSeerClaims, computeBelief, topSuspect } from './belief'
import { personaOf, type Persona } from './personas'
import {
  TemplatePool,
  sayAccuse,
  sayAnalyze,
  sayCounterAccuse,
  sayDefend,
  sayFakeSeerClaim,
  sayLastWords,
  sayPass,
  sayPk,
  saySeerClaim,
} from './speechTemplates'

/**
 * 本地 AI 玩家：基于公开信息的怀疑度模型 + 人格化模板发言。
 * 没有网络依赖，也不会读取任何隐藏信息。
 */
export class LocalAgent implements Agent {
  readonly seat: number
  private readonly rng: Rng
  private readonly persona: Persona
  private readonly pool: TemplatePool

  constructor(seat: number, personaId: string, seed: number) {
    this.seat = seat
    this.persona = personaOf(personaId)
    this.rng = mulberry32(seed + seat * 7919)
    this.pool = new TemplatePool(this.rng)
  }

  private beliefOf(view: AiView): Map<number, number> {
    return computeBelief(view)
  }

  async decideNightKill(view: AiView, candidates: number[]): Promise<number | null> {
    const mates = new Set(view.wolfTeammates)
    const pool = candidates.filter((s) => !mates.has(s) && s !== this.seat)
    if (!pool.length) return null

    // 优先解决跳预言家的好人
    const claims = collectSeerClaims(view)
      .map((c) => c.by)
      .filter((by) => pool.includes(by))
    if (claims.length) return claims[0]!

    // 其次处理影响力最大的好人：发言多、指控多
    const influence = new Map<number, number>()
    for (const seat of pool) influence.set(seat, 0)
    for (const speech of view.speeches) {
      const cur = influence.get(speech.seat)
      if (cur != null) influence.set(speech.seat, cur + 2)
      for (const claim of speech.claims) {
        if (claim.kind === 'accuse') {
          const t = influence.get(claim.target)
          if (t != null) influence.set(claim.target, t + 1)
        }
      }
    }
    let bestSeat = pool[0]!
    let best = -1
    for (const [seat, score] of influence) {
      const jitter = this.rng() * 2
      if (score + jitter > best) {
        best = score + jitter
        bestSeat = seat
      }
    }
    return bestSeat
  }

  async decideSeerCheck(view: AiView, candidates: number[]): Promise<number> {
    const checked = new Set(view.seerChecks.map((c) => c.target))
    const pool = candidates.filter((s) => s !== this.seat && !checked.has(s))
    const source = pool.length ? pool : candidates.filter((s) => s !== this.seat)
    if (!source.length) return this.seat
    const belief = this.beliefOf(view)
    let bestSeat = source[0]!
    let best = -Infinity
    for (const seat of source) {
      const score = (belief.get(seat) ?? 20) + this.rng() * 8
      if (score > best) {
        best = score
        bestSeat = seat
      }
    }
    return bestSeat
  }

  async decideWitch(view: AiView): Promise<WitchPlan> {
    const plan: WitchPlan = { save: false, poison: null }
    if (!view.witch) return plan
    const victim = view.witchVictim
    const claims = collectSeerClaims(view)
    const belief = this.beliefOf(view)

    if (victim != null && view.witch.antidote) {
      const isSelf = victim === this.seat
      const victimIsSeer = claims.some((c) => c.by === victim)
      const suspicion = belief.get(victim) ?? 20
      if (isSelf && view.round === 1) plan.save = true
      else if (victimIsSeer) plan.save = true
      else if (view.round === 1) plan.save = this.rng() < 0.7
      else plan.save = suspicion < 12 && this.rng() < 0.5
    }

    if (!plan.save && view.witch.poison && view.round >= 2) {
      const candidates = view.aliveSeats.filter((s) => s !== this.seat && s !== victim)
      let target: number | null = null
      let best = 55
      for (const seat of candidates) {
        const score = belief.get(seat) ?? 20
        if (score > best) {
          best = score
          target = seat
        }
      }
      if (target != null && this.rng() < 0.55) plan.poison = target
    }

    return plan
  }

  async decideVote(view: AiView, candidates: number[]): Promise<number | null> {
    const belief = this.beliefOf(view)
    if (!candidates.length) return null

    if (view.self.role === 'wolf') {
      const mates = new Set(view.wolfTeammates)
      const targets = candidates.filter((s) => !mates.has(s) && s !== this.seat)
      if (!targets.length) return null
      // 优先跟票压死跳预言家的好人
      const claimed = collectSeerClaims(view)
        .map((c) => c.by)
        .filter((by) => targets.includes(by))
      if (claimed.length && this.rng() < 0.7) return claimed[0]!
      const sorted = [...targets].sort((a, b) => {
        const sa = (belief.get(a) ?? 20) + this.rng() * 10
        const sb = (belief.get(b) ?? 20) + this.rng() * 10
        return sb - sa
      })
      return sorted[0] ?? null
    }

    const suspect = topSuspect(belief, [this.seat])
    if (suspect != null && candidates.includes(suspect)) return suspect
    return candidates[Math.floor(this.rng() * candidates.length)] ?? null
  }

  async decideHunterShot(view: AiView, candidates: number[]): Promise<number | null> {
    const belief = this.beliefOf(view)
    const suspect = topSuspect(belief, [this.seat])
    if (suspect != null && candidates.includes(suspect)) {
      const score = belief.get(suspect) ?? 0
      if (score >= 30 || this.rng() < 0.5) return suspect
    }
    return null
  }

  async speak(view: AiView, phase: 'day' | 'pk'): Promise<AgentSpeech> {
    const p = this.persona
    const claims = collectSeerClaims(view)
    const myClaim = claims.find((c) => c.by === this.seat)
    const againstMe = accusationsAgainst(view, this.seat)
    const belief = this.beliefOf(view)
    const otherClaimant = claims.find((c) => c.by !== this.seat)

    if (phase === 'pk') {
      const target = topSuspect(belief, [this.seat])
      if (target != null) return sayPk(p, target, this.rng, this.pool)
      return sayDefend(p, this.rng, this.pool)
    }

    if (view.self.role === 'seer') {
      const checks = view.seerChecks.map((c) => ({ target: c.target, verdict: c.verdict }))
      const nextTarget = this.pickNextCheck(view)
      if (!myClaim) {
        return saySeerClaim(p, this.seat, checks, nextTarget, this.rng, this.pool)
      }
      if (otherClaimant && this.rng() < 0.6) {
        return sayCounterAccuse(p, otherClaimant.by, this.rng, this.pool)
      }
      return saySeerClaim(p, this.seat, checks, nextTarget, this.rng, this.pool)
    }

    if (view.self.role === 'wolf') {
      const aliveWolves = view.aliveSeats.filter(
        (s) => s === this.seat || view.wolfTeammates.includes(s),
      )
      const isFirstWolf = aliveWolves[0] === this.seat
      if (!claims.length && isFirstWolf && view.round <= 2 && this.rng() < 0.5) {
        const goodTarget = this.pickGoodTarget(view)
        if (goodTarget != null) {
          const mate = view.wolfTeammates.find((s) => view.aliveSeats.includes(s))
          const fake: Array<{ target: number; verdict: 'good' | 'wolf' }> = [
            { target: goodTarget, verdict: 'wolf' },
          ]
          if (mate != null) fake.push({ target: mate, verdict: 'good' })
          return sayFakeSeerClaim(p, this.seat, fake, this.rng, this.pool)
        }
      }
      if (againstMe.length) {
        return this.rng() < 0.6
          ? sayCounterAccuse(p, againstMe[0]!, this.rng, this.pool)
          : sayDefend(p, this.rng, this.pool)
      }
      const target = this.pickGoodTarget(view)
      if (target != null) return sayAccuse(p, target, this.rng, this.pool)
      return sayAnalyze(p, view.round, view.aliveSeats.length, this.rng, this.pool)
    }

    // 好人阵营（神职 / 平民）
    if (againstMe.length && this.rng() < 0.7) {
      return sayDefend(p, this.rng, this.pool)
    }
    const suspect = topSuspect(belief, [this.seat])
    if (suspect != null && (belief.get(suspect) ?? 0) >= 28) {
      return sayAccuse(p, suspect, this.rng, this.pool)
    }
    if (this.rng() < 0.55) {
      return sayAnalyze(p, view.round, view.aliveSeats.length, this.rng, this.pool)
    }
    return sayPass(p, this.rng, this.pool)
  }

  async lastWords(view: AiView): Promise<string> {
    const meta = ROLES[view.self.role]
    return sayLastWords(this.persona, meta.name, this.rng).text
  }

  private pickNextCheck(view: AiView): number | null {
    const checked = new Set(view.seerChecks.map((c) => c.target))
    const pool = view.aliveSeats.filter((s) => s !== this.seat && !checked.has(s))
    if (!pool.length) return null
    return pool[Math.floor(this.rng() * pool.length)] ?? null
  }

  private pickGoodTarget(view: AiView): number | null {
    const mates = new Set(view.wolfTeammates)
    const pool = view.aliveSeats.filter((s) => s !== this.seat && !mates.has(s))
    if (!pool.length) return null
    return pool[Math.floor(this.rng() * pool.length)] ?? null
  }
}

export function makeLocalAgent(seat: number, personaId: string, seed: number): Agent {
  return new LocalAgent(seat, personaId, seed)
}
