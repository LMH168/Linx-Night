export interface SeatMeta {
  id: number
  name: string
  role: string
  me?: boolean
}

/** 九席 · 3 狼 / 3 民 / 预言家 / 女巫 / 猎人 */
export const SEATS: SeatMeta[] = [
  { id: 1, name: '你', role: '村民', me: true },
  { id: 2, name: '樵夫', role: '？' },
  { id: 3, name: '旅人', role: '？' },
  { id: 4, name: '钟表匠', role: '？' },
  { id: 5, name: '守夜人', role: '？' },
  { id: 6, name: '说书人', role: '？' },
  { id: 7, name: '学徒', role: '？' },
  { id: 8, name: '猎户', role: '？' },
  { id: 9, name: '老妇', role: '？' },
]

export const SEAT_RING = { x: 2.6, z: 1.75 }
