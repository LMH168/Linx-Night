<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GamePhase } from '../types';
import {
  applyGameScene,
  dressGameScene,
  type CabinWindow,
  type SceneMode,
  type SceneOptions,
} from '../launchScene';

type Stage = 'launch' | 'lobby' | 'table' | 'result';

const props = defineProps<{
  stage: Stage;
  phase: GamePhase;
  deadSeatIds: string[];
  selectedSeatId?: string | null;
  selfSeatId?: string;
  shieldSeatId?: string | null;
}>();

const frame = ref<HTMLIFrameElement | null>(null);
const sceneReady = ref(false);
let pollTimer: number | undefined;
let started = 0;

function sceneOptions(): SceneOptions {
  return {
    mode: props.phase.startsWith('NIGHT_') ? 'night' : 'day' as SceneMode,
    stage: props.stage === 'lobby' || props.stage === 'result' ? props.stage : 'table',
    deadSeats: props.deadSeatIds,
    shieldSeat: props.shieldSeatId ?? null,
  };
}

function pollScene() {
  window.clearTimeout(pollTimer);
  if (sceneReady.value) return;
  started = performance.now();
  const check = () => {
    let win: CabinWindow | null;
    try {
      win = frame.value?.contentWindow as CabinWindow | null;
    } catch {
      sceneReady.value = true;
      return;
    }
    if (win?.__forestCabin) {
      try {
        dressGameScene(win, sceneOptions());
      } catch (error) {
        console.warn('game backdrop dressing skipped', error);
      }
      sceneReady.value = true;
      return;
    }
    if (performance.now() - started > 12000) {
      sceneReady.value = true;
      return;
    }
    pollTimer = window.setTimeout(check, 120);
  };
  check();
}

function updateScene() {
  if (!sceneReady.value) return;
  const win = frame.value?.contentWindow as CabinWindow | null;
  if (!win?.__forestCabin) return;
  try {
    applyGameScene(win, sceneOptions());
  } catch (error) {
    console.warn('game backdrop update skipped', error);
  }
}

watch(
  () => [props.stage, props.phase, props.deadSeatIds, props.shieldSeatId],
  updateScene,
  { deep: true },
);

onMounted(pollScene);
onBeforeUnmount(() => {
  window.clearTimeout(pollTimer);
});
</script>

<template>
  <div class="game-world">
    <iframe
      ref="frame"
      class="game-world-scene"
      :class="{ 'is-ready': sceneReady }"
      src="/assets/splash/forest-cabin.html?linx-game=1"
      title="暮林山舍对局长桌"
      aria-hidden="true"
      tabindex="-1"
      @load="pollScene"
    ></iframe>
    <div class="game-world-vignette" aria-hidden="true"></div>
    <div class="game-world-grain" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.game-world { position: fixed; inset: 0; z-index: 0; overflow: hidden; background: radial-gradient(circle at 50% 35%, #11231a, #050b08 75%); }
.game-world-scene { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; opacity: 0; pointer-events: none; background: #050b08; transition: opacity 1.1s ease; }
.game-world-scene.is-ready { opacity: 1; }
.game-world-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 48%, transparent 42%, rgba(0,0,0,.42) 100%); }
.game-world-grain { position: absolute; inset: 0; pointer-events: none; opacity: .16; mix-blend-mode: soft-light; background-image: url('/assets/game/noise.png'); background-size: 256px 256px; }
</style>
