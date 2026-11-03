/**
 * 光时（light clock）：把"时间"从散落的布尔值收敛成四个可枚举的状态。
 *
 * 一局的时间线：黄昏入座 → 发牌 → 深夜 → 破晓 → 白昼 → 黄昏投票 → 深夜……
 * 大厅和发牌沿用黄昏，所以"进房间"不是换场景，而是同一束光慢慢灭下去。
 *
 * 这里只放"选哪一档"和"粒子怎么变"，具体色值全部留在 CSS 里——
 * 换光时不触发 JS 重排，只让浏览器合成 opacity，滚动和席位动画不掉帧。
 */

export type LightKey = 'dusk' | 'night' | 'dawn' | 'day'

/** 粒子形态：雾絮 / 暖薄霭 / 尘埃 / 余烬 */
export type ParticleMode = 'fog' | 'mist' | 'dust' | 'ember'

export interface LightLook {
  key: LightKey
  label: string
  particle: ParticleMode
  /** 粒子数量：夜里多一点，白天克制 */
  particles: number
}

export const LIGHT_LOOKS: Record<LightKey, LightLook> = {
  dusk: { key: 'dusk', label: '黄昏', particle: 'ember', particles: 24 },
  night: { key: 'night', label: '深夜', particle: 'fog', particles: 32 },
  dawn: { key: 'dawn', label: '破晓', particle: 'mist', particles: 20 },
  day: { key: 'day', label: '白昼', particle: 'dust', particles: 16 },
}

/**
 * 场景 → 光时。没有匹配到的一律落到黄昏：
 * 大厅与发牌是"入夜前最后的暖光"，结算回到黄昏收束整局。
 */
export function lightOfScene(scene: string | null | undefined): LightKey {
  switch (scene) {
    case 'dawn':
      return 'dawn'
    case 'day':
      return 'day'
    case 'night':
    case 'result':
      // 结算页的背景是那张月夜剪影插画，UI 也留在夜色里
      return 'night'
    case 'vote':
    case 'pk':
    case 'lobby':
    case 'deal':
      return 'dusk'
    default:
      return 'dusk'
  }
}
