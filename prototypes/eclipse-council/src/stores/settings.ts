import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { DEFAULT_LINGXI, type LingxiSettings } from '@/ai/lingxi'
import { SEAT_NAMES } from '@/data/names'

export type Speed = 'cinematic' | 'brisk' | 'instant'

const STORAGE_KEY = 'eclipse-council:settings:v1'

function defaultNames(): Record<number, string> {
  const out: Record<number, string> = {}
  SEAT_NAMES.forEach((name, index) => {
    out[index + 1] = name
  })
  return out
}

interface Persisted {
  humanSeats: number[]
  names: Record<number, string>
  turnSeconds: number
  speed: Speed
  lingxi: LingxiSettings
  showGodView: boolean
}

export const useSettingsStore = defineStore('settings', () => {
  const humanSeats = ref<number[]>([1])
  const names = ref<Record<number, string>>(defaultNames())
  const turnSeconds = ref(40)
  const speed = ref<Speed>('cinematic')
  const lingxi = reactive<LingxiSettings>({ ...DEFAULT_LINGXI })
  const showGodView = ref(false)

  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as Partial<Persisted>
      if (Array.isArray(data.humanSeats) && data.humanSeats.length >= 1) {
        humanSeats.value = data.humanSeats
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 9)
          .slice(0, 9)
        if (!humanSeats.value.length) humanSeats.value = [1]
      }
      if (data.names && typeof data.names === 'object') {
        names.value = { ...defaultNames(), ...data.names }
      }
      if (typeof data.turnSeconds === 'number') {
        turnSeconds.value = Math.min(120, Math.max(15, data.turnSeconds))
      }
      if (data.speed === 'cinematic' || data.speed === 'brisk' || data.speed === 'instant') {
        speed.value = data.speed
      }
      if (data.lingxi) Object.assign(lingxi, { ...DEFAULT_LINGXI, ...data.lingxi })
      if (typeof data.showGodView === 'boolean') showGodView.value = data.showGodView
    } catch {
      // 忽略损坏的本地配置
    }
  }

  function persist(): void {
    const data: Persisted = {
      humanSeats: humanSeats.value,
      names: names.value,
      turnSeconds: turnSeconds.value,
      speed: speed.value,
      lingxi: { ...lingxi },
      showGodView: showGodView.value,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // 隐私模式下可能不可写
    }
  }

  watch([humanSeats, names, turnSeconds, speed, lingxi, showGodView], persist, { deep: true })

  function toggleHuman(seat: number): void {
    if (humanSeats.value.includes(seat)) {
      if (humanSeats.value.length <= 1) return
      humanSeats.value = humanSeats.value.filter((s) => s !== seat)
      return
    }
    humanSeats.value = [...humanSeats.value, seat].sort((a, b) => a - b)
  }

  function setHumanCount(count: number): void {
    const n = Math.min(9, Math.max(1, Math.round(count)))
    humanSeats.value = Array.from({ length: n }, (_, i) => i + 1)
  }

  function setName(seat: number, value: string): void {
    names.value = { ...names.value, [seat]: value.slice(0, 8) }
  }

  return {
    humanSeats,
    names,
    turnSeconds,
    speed,
    lingxi,
    showGodView,
    load,
    persist,
    toggleHuman,
    setHumanCount,
    setName,
  }
})
