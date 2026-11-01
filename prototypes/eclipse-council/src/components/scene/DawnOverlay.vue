<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const dawn = computed(() => game.ui.dawn)

const deaths = computed(() => dawn.value?.deaths ?? [])
const peace = computed(() => dawn.value?.peace === true)
</script>

<template>
  <Transition name="dawn">
    <div v-if="dawn" class="dawn" aria-live="polite">
      <span class="bar bar--top" aria-hidden="true"></span>
      <span class="bar bar--bottom" aria-hidden="true"></span>
      <div class="core">
        <p class="eyebrow">第 {{ dawn.round }} 日</p>
        <h1 class="title display">{{ peace ? '平安夜' : '天亮了' }}</h1>
        <p class="sub">
          {{ peace ? '昨夜没有人倒下。' : `${deaths.length} 人倒在了夜色里。` }}
        </p>
        <p class="text">{{ dawn.text }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dawn {
  position: fixed;
  inset: 0;
  z-index: 56;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 12vh;
  background: linear-gradient(180deg, rgba(2, 4, 8, 0.92), transparent);
}

.bar--top {
  top: 0;
}

.bar--bottom {
  bottom: 0;
  transform: rotate(180deg);
}

.core {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 0 24px;
  animation: fade-up 700ms var(--ease-out) both;
}

.title {
  margin-top: 6px;
  font-size: clamp(40px, 7vw, 88px);
  letter-spacing: 0.24em;
  color: #f4ecdc;
  text-shadow: 0 0 80px rgba(255, 244, 220, 0.45);
}

.sub {
  font-size: 12px;
  letter-spacing: 0.3em;
  color: var(--ink-2);
}

.text {
  margin-top: 12px;
  max-width: 34ch;
  font-family: var(--font-display);
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-3);
}

.dawn-enter-active,
.dawn-leave-active {
  transition: opacity 520ms var(--ease);
}

.dawn-enter-from,
.dawn-leave-to {
  opacity: 0;
}
</style>
