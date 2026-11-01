import type { AiView } from './types'
import type { CheckLine } from './speechTemplates'

export interface SeerClaimRecord {
  by: number
  checks: CheckLine[]
}

/** 从公开发言里汇总「自称预言家」的记录（狼人的悍跳也算） */
export function collectSeerClaims(view: AiView): SeerClaimRecord[] {
  const map = new Map<number, CheckLine[]>()
  for (const speech of view.speeches) {
    for (const claim of speech.claims) {
      if (claim.kind !== 'seer') continue
      const arr = map.get(speech.seat) ?? []
      if (!arr.some((c) => c.target === claim.target)) {
        arr.push({ target: claim.target, verdict: claim.verdict })
      }
      map.set(speech.seat, arr)
    }
  }
  return [...map.entries()].map(([by, checks]) => ({ by, checks }))
}

export function accusationsAgainst(view: AiView, seat: number): number[] {
  const out: number[] = []
  for (const speech of view.speeches) {
    for (const claim of speech.claims) {
      if (claim.kind === 'accuse' && claim.target === seat && speech.seat !== seat) {
        out.push(speech.seat)
      }
    }
  }
  return out
}

/**
 * 怀疑度：分数越高越像狼。负数表示「排除」（自己 / 狼队友）。
 * 只依赖公开信息，因此不会泄漏身份。
 */
export function computeBelief(view: AiView): Map<number, number> {
  const belief = new Map<number, number>()
  for (const p of view.players) {
    if (p.alive) belief.set(p.seat, 20)
  }
  belief.set(view.self.seat, -999)
  if (view.self.role === 'wolf') {
    for (const mate of view.wolfTeammates) belief.set(mate, -999)
  }

  const claims = collectSeerClaims(view)
  const multi = claims.length > 1
  for (const claim of claims) {
    const weight = multi ? 0.45 : 1
    for (const check of claim.checks) {
      const target = belief.get(check.target)
      if (target != null && target > -900) {
        belief.set(
          check.target,
          target + (check.verdict === 'wolf' ? 55 * weight : -42 * weight),
        )
      }
    }
    const claimant = belief.get(claim.by)
    if (claimant != null && claimant > -900) {
      // 多人跳预言家必然有人说谎
      belief.set(claim.by, claimant + (multi ? 34 : -6))
    }
  }

  for (const speech of view.speeches) {
    for (const claim of speech.claims) {
      if (claim.kind === 'accuse') {
        const t = belief.get(claim.target)
        if (t != null && t > -900) belief.set(claim.target, t + 7)
      } else if (claim.kind === 'defend') {
        const t = belief.get(claim.target)
        if (t != null && t > -900) belief.set(claim.target, t - 5)
      }
    }
  }

  // 狼人视角：跳预言家的好人必须被压下去
  if (view.self.role === 'wolf') {
    for (const claim of claims) {
      const b = belief.get(claim.by)
      if (b != null && b > -900) belief.set(claim.by, b + 60)
    }
  }

  return belief
}

export function topSuspect(belief: Map<number, number>, exclude: number[] = []): number | null {
  let bestSeat: number | null = null
  let best = -Infinity
  for (const [seat, score] of belief) {
    if (exclude.includes(seat)) continue
    if (score <= -900) continue
    if (score > best) {
      best = score
      bestSeat = seat
    }
  }
  return bestSeat
}
