<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const kind = computed(() => game.ui.transition)
</script>

<template>
  <Transition name="wipe">
    <div v-if="kind" class="wipe" :class="`wipe--${kind}`" aria-hidden="true">
      <template v-if="kind === 'dawn'">
        <span class="sweep"></span>
        <span class="flash"></span>
      </template>
      <template v-else-if="kind === 'boom'">
        <span class="boom"></span>
        <span class="streak"></span>
      </template>
      <template v-else>
        <span class="devour"></span>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.wipe {
  position: fixed;
  inset: 0;
  z-index: 55;
  pointer-events: none;
  overflow: hidden;
}

.sweep {
  position: absolute;
  top: -20%;
  left: -35%;
  width: 45%;
  height: 140%;
  transform: rotate(8deg);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 250, 235, 0.55),
    rgba(255, 255, 255, 0.9),
    rgba(255, 250, 235, 0.55),
    transparent
  );
  animation: sweep-light 1150ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 60% at 50% 46%, rgba(255, 252, 240, 0.72), transparent 70%);
  animation: flash-soft 1150ms ease-out forwards;
}

@keyframes flash-soft {
  0% {
    opacity: 0;
  }
  22% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
  }
}

.devour {
  position: absolute;
  inset: -8%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(2, 4, 8, 0.2) 0%, rgba(2, 4, 8, 0.98) 72%);
  animation: devour 1000ms cubic-bezier(0.5, 0, 0.3, 1) forwards;
}

.boom {
  position: absolute;
  inset: 0;
  background: radial-gradient(50% 50% at 50% 50%, rgba(255, 236, 214, 0.9), rgba(120, 30, 24, 0.4) 40%, transparent 72%);
  animation: flash-boom 620ms ease-out forwards;
}

.streak {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 42%, rgba(255, 255, 255, 0.75) 50%, transparent 58%);
  animation: streak 620ms ease-out forwards;
}

.wipe-enter-active,
.wipe-leave-active {
  transition: opacity 220ms var(--ease);
}

.wipe-enter-from,
.wipe-leave-to {
  opacity: 0;
}
</style>
