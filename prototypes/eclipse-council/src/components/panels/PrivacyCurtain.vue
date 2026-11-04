<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const request = computed(() => game.request)
const isHandoff = computed(() => request.value?.kind === 'handoff')
const seat = computed(() => request.value?.seat ?? 0)
const reason = computed(() => String(request.value?.payload.reason ?? '私密操作'))
const name = computed(
  () => game.state?.players.find((p) => p.seat === seat.value)?.name ?? '',
)

function proceed(): void {
  game.respond(true)
}

function onKey(event: KeyboardEvent): void {
  if (!isHandoff.value) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    proceed()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="veil">
    <div v-if="isHandoff" class="curtain" role="dialog" aria-modal="true" aria-label="交接设备">
      <div class="glow" aria-hidden="true"></div>
      <div class="card">
        <p class="eyebrow">移交设备 · 请其他人回避</p>
        <div class="seat-no display">{{ String(seat).padStart(2, '0') }}</div>
        <h2 class="title display">请将设备交给 {{ seat }} 号{{ name ? `「${name}」` : '' }}</h2>
        <p class="reason">{{ reason }}</p>
        <p class="privacy">
          屏幕即将显示只有你能看到的信息。<br />
          在你按下按钮之前，请确认旁人已经移开视线。
        </p>
        <button class="primary" type="button" @click="proceed">
          我是 {{ seat }} 号，继续
          <span class="hint">Enter</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.curtain {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(90% 70% at 50% 40%, rgba(3, 6, 10, 0.72), rgba(1, 3, 6, 0.94));
}

.glow {
  position: absolute;
  width: 62vmin;
  height: 62vmin;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(213, 177, 132, 0.14), transparent 68%);
  animation: breathe 6s ease-in-out infinite;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  max-width: 460px;
  padding: 34px 34px 30px;
  border-radius: var(--radius-l);
  border: 1px solid rgba(213, 177, 132, 0.22);
  background: linear-gradient(180deg, rgba(14, 18, 26, 0.9), rgba(5, 7, 11, 0.96));
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.7);
  animation: pop-in 360ms var(--ease-out) both;
}

.seat-no {
  font-size: 46px;
  line-height: 1;
  letter-spacing: 0.1em;
  color: rgba(213, 177, 132, 0.32);
  margin: 2px 0 4px;
}

.title {
  font-size: 19px;
  letter-spacing: 0.06em;
  color: var(--ink);
}

.reason {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--gold-text);
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(213, 177, 132, 0.2);
  background: rgba(213, 177, 132, 0.06);
}

.privacy {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--ink-3);
}

.primary {
  margin-top: 16px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 11px 26px;
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.12em;
  color: #1a1206;
  background: linear-gradient(180deg, #f0d6ac, #c9a169);
  box-shadow: 0 10px 30px rgba(201, 161, 105, 0.24);
  transition: transform 220ms var(--ease), box-shadow 220ms var(--ease);
}

.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 36px rgba(201, 161, 105, 0.34);
}

.hint {
  font-size: 9px;
  letter-spacing: 0.1em;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.16);
  opacity: 0.6;
}

.veil-enter-active,
.veil-leave-active {
  transition: opacity 320ms var(--ease);
}

.veil-enter-from,
.veil-leave-to {
  opacity: 0;
}
</style>
