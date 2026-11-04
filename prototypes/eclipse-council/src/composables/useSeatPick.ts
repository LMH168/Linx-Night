import { reactive } from 'vue'

export type PickMode = 'wolf' | 'seer' | 'vote' | 'hunter' | 'poison'

interface PickState {
  active: boolean
  mode: PickMode | ''
  label: string
  candidates: number[]
  selected: number | null
}

/**
 * 全局「点选席位」状态。
 * 席位环、底部确认条、各处面板共享同一份状态，
 * 避免每个面板各自维护一套选择逻辑。
 */
export const seatPick = reactive<PickState>({
  active: false,
  mode: '',
  label: '',
  candidates: [],
  selected: null,
})

let confirmHandler: ((seat: number | null) => void) | null = null
let cancelHandler: (() => void) | null = null
let stateAllowsNone = false

export function startPick(options: {
  candidates: number[]
  mode: PickMode
  label: string
  allowNone?: boolean
  onConfirm: (seat: number | null) => void
  onCancel?: () => void
}): void {
  seatPick.active = true
  seatPick.mode = options.mode
  seatPick.label = options.label
  seatPick.candidates = options.candidates.slice()
  seatPick.selected = null
  stateAllowsNone = options.allowNone === true
  confirmHandler = options.onConfirm
  cancelHandler = options.onCancel ?? null
}

export function pickSeat(seat: number): void {
  if (!seatPick.active) return
  if (!seatPick.candidates.includes(seat)) return
  seatPick.selected = seat
}

export function confirmPick(): void {
  if (!seatPick.active) return
  const handler = confirmHandler
  const selected = seatPick.selected
  stopPick()
  handler?.(selected)
}

export function skipPick(): void {
  if (!seatPick.active || !stateAllowsNone) return
  const handler = confirmHandler
  stopPick()
  handler?.(null)
}

export function cancelPick(): void {
  const handler = cancelHandler
  stopPick()
  handler?.()
}

export function stopPick(): void {
  seatPick.active = false
  seatPick.mode = ''
  seatPick.label = ''
  seatPick.candidates = []
  seatPick.selected = null
  confirmHandler = null
  cancelHandler = null
  stateAllowsNone = false
}

export function pickAllowsNone(): boolean {
  return stateAllowsNone
}

export function pickCancellable(): boolean {
  return cancelHandler != null
}
