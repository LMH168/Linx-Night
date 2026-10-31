<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { isNightPhase, type GamePhase } from '../types';
import { createStage, type Stage as StageHandle, type StageMode, type StageOptions } from '../stage';

type WorldStage = 'launch' | 'lobby' | 'table' | 'result';

const props = defineProps<{
  stage: WorldStage;
  phase: GamePhase;
  deadSeatIds: string[];
  selectedSeatId?: string | null;
  selfSeatId?: string;
  shieldSeatId?: string | null;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const world = shallowRef<StageHandle | null>(null);
const ready = ref(false);
const failed = ref(false);

function modeOf(): StageMode {
  if (props.stage === 'lobby') return 'lobby';
  if (props.stage === 'result') return 'result';
  return 'table';
}

function toOptions(): StageOptions {
  return {
    mode: modeOf(),
    night: isNightPhase(props.phase) || props.phase === 'GAME_OVER',
    deadSeats: props.deadSeatIds ?? [],
    selectedSeat: props.selectedSeatId ?? null,
    selfSeat: props.selfSeatId ?? null,
    shieldSeat: props.shieldSeatId ?? null,
  };
}

onMounted(() => {
  const element = canvas.value;
  if (!element) return;
  try {
    world.value = createStage(element, toOptions());
    // 首帧已同步画出，等一个宏任务再淡入，避免闪现空白
    window.setTimeout(() => {
      ready.value = true;
    }, 60);
  } catch (error) {
    failed.value = true;
    console.warn('3D stage unavailable, falling back to gradient backdrop', error);
  }
});

watch(
  () => [props.stage, props.phase, props.deadSeatIds, props.selectedSeatId, props.shieldSeatId],
  () => {
    world.value?.setOptions(toOptions());
  },
  { deep: true },
);

onBeforeUnmount(() => {
  world.value?.dispose();
  world.value = null;
});
</script>

<template>
  <div class="game-world" :class="{ 'is-failed': failed }">
    <canvas
      ref="canvas"
      class="game-world-scene"
      :class="{ 'is-ready': ready }"
      aria-hidden="true"
      tabindex="-1"
    ></canvas>
    <div class="game-world-vignette" aria-hidden="true"></div>
    <div class="game-world-grain" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.game-world { position: fixed; inset: 0; z-index: 0; overflow: hidden; background: radial-gradient(circle at 50% 35%, #11231a, #050b08 75%); }
.game-world-scene { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; opacity: 0; pointer-events: none; background: #050b08; transition: opacity 1.1s ease; display: block; }
.game-world-scene.is-ready { opacity: 1; }
.game-world-scene.is-lost { opacity: 0; }
.game-world-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 48%, transparent 42%, rgba(0,0,0,.42) 100%); }
.game-world-grain { position: absolute; inset: 0; pointer-events: none; opacity: .16; mix-blend-mode: soft-light; background-image: url('/assets/game/noise.png'); background-size: 256px 256px; }
</style>
