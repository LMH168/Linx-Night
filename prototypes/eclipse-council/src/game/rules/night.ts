import type { Rng } from '../rng'

/**
 * 狼人集体刀人：多数决；平票时在并列目标中随机。
 * 返回 null 表示狼人本夜没有形成目标。
 */
export function tallyWolfVotes(votes: Record<number, number>, rng: Rng): number | null {
  const counts = new Map<number, number>()
  for (const target of Object.values(votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  let best = -1
  for (const [, n] of counts) best = Math.max(best, n)
  const tied = [...counts.entries()].filter(([, n]) => n === best).map(([seat]) => seat)
  if (tied.length === 1) return tied[0]!
  return tied[Math.floor(rng() * tied.length)]!
}
