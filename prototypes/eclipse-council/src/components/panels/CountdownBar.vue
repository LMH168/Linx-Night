<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ seconds: number; paused?: boolean; tone?: 'gold' | 'cold' }>(), {
  paused: false,
  tone: 'gold',
})

const emit = defineEmits<{ timeout: [] }>()

const left = ref(props.seconds)
let timer: number | null = null
let fired = false

const progress = computed(() => {
  if (props.seconds <= 0) return 0
  return Math.max(0, Math.min(1, left.value / props.seconds))
})

const label = computed(() => `${Math.ceil(left.value)}s`)

const urgent = computed(() => left.value <= 8)

function stop(): void {
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
}

function tick(): void {
  if (props.paused) return
  left.value = Math.max(0, left.value - 0.2)
  if (left.value <= 0 && !fired) {
    fired = true
    stop()
    emit('timeout')
  }
}

function start(): void {
  stop()
  left.value = props.seconds
  fired = false
  if (props.seconds > 0) timer = window.setInterval(tick, 200)
}

onMounted(start)
onBeforeUnmount(stop)
watch(() => props.seconds, start)
watch(() => props.paused, (paused) => {
  if (!paused && timer == null && left.value > 0) {
    timer = window.setInterval(tick, 200)
  }
})
</script>

<template>
  <div class="countdown" :class="{ urgent, cold: tone === 'cold' }">
    <div class="rail">
      <div class="fill" :style="{ transform: `scaleX(${progress})` }"></div>
    </div>
    <span class="label">{{ label }}</span>
  </div>
</template>

<style scoped>
.countdown {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.rail {
  position: relative;
  flex: 1 1 auto;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  background: linear-gradient(90deg, rgba(213, 177, 132, 0.5), #efd3a6);
  transition: transform 200ms linear;
}

.cold .fill {
  background: linear-gradient(90deg, rgba(138, 176, 230, 0.45), #c3dcf7);
}

.urgent .fill {
  background: linear-gradient(90deg, rgba(194, 90, 78, 0.5), #e0907f);
}

.label {
  flex: 0 0 auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
  color: var(--ink-3);
}

.urgent .label {
  color: #e0a296;
}
</style>
