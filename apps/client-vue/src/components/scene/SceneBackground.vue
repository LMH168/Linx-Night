<script setup lang="ts">
import { computed } from 'vue'
import ParticleField from './ParticleField.vue'

const props = defineProps<{ scene: string }>()

const isNight = computed(() => props.scene === 'night')
const isDay = computed(() => props.scene === 'day' || props.scene === 'dawn')
const isDusk = computed(
  () => props.scene === 'vote' || props.scene === 'pk' || props.scene === 'lobby',
)

const particleMode = computed<'fog' | 'dust' | 'ember'>(() => {
  if (isNight.value) return 'fog'
  if (isDay.value) return 'dust'
  return 'ember'
})

/**
 * 星空用静态贴图：一次栅格化，永不重绘。
 * 以前是两层全屏 div + 透明度动画，等于每帧重画整屏，这是夜里最大的开销之一。
 */
function starTile(seed: number, count: number, size: number, maxR: number): string {
  let s = seed
  const rand = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  let dots = ''
  for (let i = 0; i < count; i++) {
    const x = (rand() * size).toFixed(1)
    const y = (rand() * size).toFixed(1)
    const r = (0.45 + rand() * maxR).toFixed(2)
    const o = (0.25 + rand() * 0.65).toFixed(2)
    dots += `<circle cx='${x}' cy='${y}' r='${r}' opacity='${o}'/>`
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><g fill='#ffffff'>${dots}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const skyVars = {
  '--stars-far': starTile(7331, 130, 320, 0.7),
  '--stars-near': starTile(20261101, 40, 520, 1.1),
}

function ridgePath(seed: number, base: number, amp: number, step: number): string {
  let s = seed
  const rand = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  let d = `M0,300 L0,${(base - rand() * amp).toFixed(0)}`
  let x = 0
  while (x < 1200) {
    x += step * (0.55 + rand() * 0.9)
    const y = base - rand() * amp
    d += ` L${x.toFixed(0)},${y.toFixed(0)}`
  }
  d += ` L1200,300 Z`
  return d
}

const farRidge = ridgePath(97, 168, 84, 34)
const nearRidge = ridgePath(413, 232, 52, 26)
</script>

<template>
  <div class="scene-bg" :style="skyVars" aria-hidden="true">
    <div class="layer" :class="{ on: isNight }">
      <div class="sky sky--night"></div>
      <div class="moon">
        <span class="moon-glow"></span>
        <span class="moon-disc"></span>
      </div>
    </div>

    <div class="layer" :class="{ on: isDay }">
      <div class="sky sky--day"></div>
    </div>

    <div class="layer" :class="{ on: isDusk }">
      <div class="sky sky--dusk"></div>
      <div class="sun"><span></span></div>
    </div>

    <svg class="ridges" viewBox="0 0 1200 300" preserveAspectRatio="none">
      <path :d="farRidge" class="ridge ridge--far" />
      <path :d="nearRidge" class="ridge ridge--near" />
    </svg>

    <ParticleField :mode="particleMode" :count="isNight ? 40 : 32" />

    <div class="grain"></div>
    <div class="vignette"></div>
  </div>
</template>

<style scoped>
.scene-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: #05070c;
  contain: strict;
}

.layer {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 900ms cubic-bezier(0.4, 0, 0.2, 1);
}

.layer.on {
  opacity: 1;
}

/* ---------------- 深夜 ----------------
   所有光效合并成同一个元素的背景层：
   1 个元素 = 1 次栅格化，没有逐层合成开销。 */
.sky--night {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(
      103deg,
      transparent 38%,
      rgba(178, 206, 250, 0.05) 46%,
      rgba(202, 226, 255, 0.1) 50%,
      rgba(178, 206, 250, 0.04) 55%,
      transparent 66%
    ),
    var(--stars-near),
    var(--stars-far),
    radial-gradient(58% 42% at 76% 2%, rgba(126, 164, 220, 0.22), transparent 66%),
    radial-gradient(120% 80% at 50% 112%, rgba(28, 50, 84, 0.55), transparent 72%),
    linear-gradient(178deg, #04060b 0%, #070c16 40%, #0a1220 76%, #060a12 100%);
  background-size:
    auto,
    520px 520px,
    320px 320px,
    auto,
    auto,
    auto;
  background-repeat: no-repeat, repeat, repeat, no-repeat, no-repeat, no-repeat;
}

/* ---------------- 月亮（小而锐利，不靠模糊） ---------------- */
.moon {
  position: absolute;
  top: 9%;
  left: 6.5%;
  width: clamp(66px, 7.4vmin, 104px);
  aspect-ratio: 1;
}

.moon-glow {
  position: absolute;
  inset: -150%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(188, 216, 255, 0.26) 0%,
    rgba(140, 176, 226, 0.1) 32%,
    transparent 60%
  );
}

.moon-disc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle at 34% 28%,
    #f8fbff 0%,
    #e0e9f8 32%,
    #bfcee1 56%,
    #94a7c0 80%,
    #72849d 100%
  );
  box-shadow:
    inset -7px -11px 20px rgba(20, 32, 54, 0.52),
    inset 4px 4px 10px rgba(255, 255, 255, 0.3),
    0 0 26px 2px rgba(176, 206, 250, 0.16);
}

.moon-disc::after {
  content: '';
  position: absolute;
  inset: 13%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 62% 30%, rgba(116, 136, 164, 0.34) 0 6.5%, transparent 7.5%),
    radial-gradient(circle at 40% 58%, rgba(116, 136, 164, 0.26) 0 9.5%, transparent 10.5%),
    radial-gradient(circle at 68% 66%, rgba(116, 136, 164, 0.2) 0 5.5%, transparent 6.5%),
    radial-gradient(circle at 26% 44%, rgba(116, 136, 164, 0.18) 0 4.5%, transparent 5.5%);
}

/* ---------------- 白昼 ---------------- */
.sky--day {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(
      100deg,
      transparent 30%,
      rgba(255, 253, 238, 0.12) 44%,
      rgba(255, 255, 248, 0.22) 50%,
      rgba(255, 253, 238, 0.1) 56%,
      transparent 70%
    ),
    linear-gradient(
      116deg,
      transparent 52%,
      rgba(255, 253, 238, 0.09) 63%,
      rgba(255, 255, 248, 0.17) 69%,
      transparent 82%
    ),
    linear-gradient(
      92deg,
      transparent 64%,
      rgba(255, 253, 238, 0.07) 74%,
      rgba(255, 255, 248, 0.12) 79%,
      transparent 90%
    ),
    radial-gradient(64% 46% at 22% 0%, rgba(255, 253, 240, 0.72), transparent 58%),
    radial-gradient(62% 40% at 50% 104%, rgba(226, 240, 232, 0.34), transparent 62%),
    radial-gradient(120% 70% at 50% 118%, rgba(18, 38, 32, 0.92), transparent 72%),
    linear-gradient(178deg, #b3cec1 0%, #82a195 36%, #47635a 72%, #1b2824 100%);
}

/* ---------------- 黄昏 ---------------- */
.sky--dusk {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(180deg, transparent 46%, rgba(255, 176, 108, 0.16) 74%, rgba(255, 196, 140, 0.26) 100%),
    radial-gradient(72% 56% at 60% 102%, rgba(255, 186, 118, 0.5), transparent 62%),
    radial-gradient(64% 48% at 8% 2%, rgba(78, 50, 102, 0.94), transparent 60%),
    linear-gradient(172deg, #241528 0%, #43263f 32%, #7c4136 64%, #c0723f 90%, #e2a465 100%);
}

.sun {
  position: absolute;
  left: 56%;
  bottom: 3%;
  width: clamp(84px, 11vmin, 150px);
  aspect-ratio: 1;
}

.sun span {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    #fff6e0 0%,
    #ffd79a 32%,
    #f2a566 60%,
    rgba(226, 124, 66, 0.4) 82%,
    transparent 100%
  );
  box-shadow: 0 0 70px 18px rgba(255, 178, 108, 0.2);
}

/* ---------------- 山脊 ---------------- */
.ridges {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 46vh;
  min-height: 240px;
  display: block;
}

.ridge--far {
  fill: #131c28;
  opacity: 0.5;
}

.ridge--near {
  fill: #04070b;
  opacity: 0.96;
}

/* 颗粒与暗角都是静态层：只栅格化一次，不参与每帧合成 */
.grain {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    118% 96% at 50% 46%,
    transparent 34%,
    rgba(3, 5, 9, 0.34) 74%,
    rgba(2, 3, 6, 0.74) 100%
  );
}

@media (max-width: 720px) {
  .ridges {
    height: 34vh;
  }
  .moon {
    top: 5%;
    left: 5%;
    width: 54px;
    opacity: 0.75;
  }
}
</style>
