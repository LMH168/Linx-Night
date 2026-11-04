import type { GameState } from '../types'

export interface WitchOptions {
  /** 能否使用解药 */
  canSave: boolean
  /** 能否使用毒药 */
  canPoison: boolean
  /** 女巫能看到的本夜死者（解药用尽后为 null，不再收到死者信息） */
  victim: number | null
  /** 解药不可用的原因 */
  saveBlockedReason: string | null
  poisonBlockedReason: string | null
}

/**
 * 女巫行动约束：
 * - 解药 / 毒药各限一次；
 * - 同一夜不能双开；
 * - 可自救，与当前项目规则一致；
 * - 解药使用后，夜间不再收到死者信息（victim 为 null）。
 */
export function witchOptions(state: GameState, _witchSeat: number): WitchOptions {
  const canSaveBase = state.witch.antidote
  const canPoisonBase = state.witch.poison
  const victim = state.witch.antidote ? state.night.wolfTarget : null

  let saveBlockedReason: string | null = null
  if (!canSaveBase) saveBlockedReason = '解药已用完'
  else if (state.night.witchPoison != null) saveBlockedReason = '同一夜不能同时开两瓶药'

  let canSave = canSaveBase && saveBlockedReason === null
  if (canSave && victim == null) {
    canSave = false
    saveBlockedReason = '今夜没有需要救的人'
  }

  let poisonBlockedReason: string | null = null
  if (!canPoisonBase) poisonBlockedReason = '毒药已用完'
  else if (state.night.witchSave) poisonBlockedReason = '同一夜不能同时开两瓶药'

  return {
    canSave,
    canPoison: canPoisonBase && poisonBlockedReason === null,
    victim,
    saveBlockedReason,
    poisonBlockedReason,
  }
}
