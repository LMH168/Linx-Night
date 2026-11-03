/**
 * 席位环的几何：把 n 个席位按「等弧长」铺在椭圆上。
 *
 * 等角度会让椭圆长轴两端挤成一堆，等弧长才是肉眼看上去的平均分散。
 * 桌面椭圆的短轴 / 长轴比在 CSS 里是 --th: var(--tw) * 0.56，这里保持一致。
 */
export const RING_RATIO = 0.56

export interface RingPoint {
  x: number
  y: number
}

export function evenRingPoints(n: number, ratio = RING_RATIO): RingPoint[] {
  const M = 960
  const px: number[] = []
  const py: number[] = []
  for (let i = 0; i <= M; i++) {
    const t = (i / M) * Math.PI * 2
    px.push(Math.sin(t))
    py.push(-Math.cos(t) * ratio)
  }
  const cum: number[] = [0]
  for (let i = 1; i <= M; i++) {
    cum.push(cum[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!))
  }
  const total = cum[M]!
  const out: RingPoint[] = []
  let k = 0
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total
    while (k < M - 1 && cum[k + 1]! < target) k++
    const seg = Math.max(1e-9, cum[k + 1]! - cum[k]!)
    const t = ((k + (target - cum[k]!) / seg) / M) * Math.PI * 2
    out.push({ x: Number(Math.sin(t).toFixed(4)), y: Number((-Math.cos(t)).toFixed(4)) })
  }
  return out
}
