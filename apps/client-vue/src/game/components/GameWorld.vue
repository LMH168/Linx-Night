<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { isNightPhase, type GamePhase } from '../types';
import {
  createStage,
  type Stage as StageHandle,
  type StageMode,
  type StageOptions,
} from '../stage';

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
const perfText = ref('');

const perfMode =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('perf') === '1';

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

/** 低端机启发式：窄屏 + 核心数少 → 直接进 low 画质，不做 3 秒基准测试。 */
function shouldStartLow(): boolean {
  if (typeof window === 'undefined') return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  return window.innerWidth < 820 && cores <= 4;
}

async function runBenchmark(handle: StageHandle): Promise<void> {
  const bench = await handle.benchmark(3000);
  const before = handle.stats().renders;
  await new Promise((resolve) => window.setTimeout(resolve, 2500));
  const idleFrames = handle.stats().renders - before;

  let note = '';
  if (bench.fps < 30) {
    handle.setQuality('low');
    const low = await handle.benchmark(2000);
    note = ` → low 画质重测 ${low.fps.toFixed(0)} fps`;
  }

  perfText.value = [
    `${bench.fps.toFixed(0)} fps`,
    `${bench.calls} calls`,
    `${Math.round(bench.triangles / 1000)}k tris`,
    `dpr ${handle.stats().dpr}`,
    `静止 2.5s ${idleFrames} 帧`,
  ].join(' · ') + note;

  if (typeof console !== 'undefined') {
    console.info('[linx stage]', perfText.value, bench);
  }
}

onMounted(() => {
  const element = canvas.value;
  if (!element) return;
  try {
    const handle = createStage(element, toOptions());
    world.value = handle;
    if (shouldStartLow()) handle.setQuality('low');
    // 首帧已同步画出，等一个宏任务再淡入，避免闪现空白
    window.setTimeout(() => {
      ready.value = true;
    }, 60);
    if (perfMode) {
      (window as unknown as { __linxStage?: StageHandle }).__linxStage = handle;
      window.setTimeout(() => {
        void runBenchmark(handle);
      }, 700);
    }
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
    <div v-if="perfMode" class="game-world-perf" aria-hidden="true">
      <span v-if="!perfText">测量中…（3 秒连续渲染）</span>
      <span v-else>{{ perfText }}</span>
    </div>
  </div>
</template>

<style scoped>
.game-world { position: fixed; inset: 0; z-index: 0; overflow: hidden; background: radial-gradient(circle at 50% 35%, #11231a, #050b08 75%); }
.game-world-scene { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; opacity: 0; pointer-events: none; background: #050b08; transition: opacity 1.1s ease; display: block; }
.game-world-scene.is-ready { opacity: 1; }
.game-world-scene.is-lost { opacity: 0; }
.game-world-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 48%, transparent 42%, rgba(0,0,0,.42) 100%); }
.game-world-grain { position: absolute; inset: 0; pointer-events: none; opacity: .16; mix-blend-mode: soft-light; background-image: url('/assets/game/noise.png'); background-size: 256px 256px; }
.game-world-perf { position: absolute; left: 12px; bottom: 12px; z-index: 5; padding: 6px 10px; border-radius: 6px; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #ffe6c2; background: rgba(6, 14, 11, .78); border: 1px solid rgba(212, 178, 122, .35); pointer-events: none; }
</style>
