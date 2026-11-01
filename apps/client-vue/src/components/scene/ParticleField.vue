<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

type Mode = 'fog' | 'dust' | 'ember'

const props = withDefaults(defineProps<{ mode?: Mode; count?: number }>(), {
  mode: 'fog',
  count: 36,
})

const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0
let ctx: CanvasRenderingContext2D | null = null
let sprite: HTMLCanvasElement | null = null
let particles: Particle[] = []
let width = 0
let height = 0
let running = true
let lastDraw = 0

/**
 * 粒子只做氛围，不需要全分辨率：用 0.7 倍缓冲放大显示，
 * 填充率直接降到一半，肉眼几乎看不出差别。
 */
/**
 * 粒子只做氛围，不需要全分辨率：用 0.55 倍缓冲放大显示，
 * 填充率降到三分之一，肉眼几乎看不出差别。
 */
const RES = 0.55
/** 4K 屏也别把缓冲区拉爆：最大宽度封顶 */
const MAX_W = 1280
/** 约 24fps：柔和粒子看不出差别，省掉一半以上的重绘 */
const FRAME_MS = 42

interface Particle {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  a: number
  phase: number
}

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function buildSprite(color: string): HTMLCanvasElement {
  const size = 48
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (!g) return c
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, color)
  grad.addColorStop(0.4, color.replace(/[\d.]+\)$/, '0.32)'))
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

function palette(mode: Mode): { color: string; speed: number; size: [number, number] } {
  if (mode === 'dust') return { color: 'rgba(255,248,226,0.8)', speed: 0.16, size: [0.6, 2.0] }
  if (mode === 'ember') return { color: 'rgba(255,198,132,0.85)', speed: 0.28, size: [0.7, 2.4] }
  return { color: 'rgba(203,223,255,0.62)', speed: 0.11, size: [1.4, 5.0] }
}

function seedParticles(): void {
  const conf = palette(props.mode)
  const count = Math.round(props.count * (width < 720 ? 0.5 : 1))
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: conf.size[0] + Math.random() * (conf.size[1] - conf.size[0]),
    vx: (Math.random() - 0.5) * conf.speed * 0.6,
    vy: -conf.speed * (0.35 + Math.random()),
    a: 0.18 + Math.random() * 0.5,
    phase: Math.random() * Math.PI * 2,
  }))
}

function resize(): void {
  const el = canvas.value
  if (!el) return
  width = el.clientWidth || window.innerWidth
  height = el.clientHeight || window.innerHeight
  const scale = Math.min(RES, MAX_W / Math.max(1, width))
  el.width = Math.max(1, Math.round(width * scale))
  el.height = Math.max(1, Math.round(height * scale))
  ctx = el.getContext('2d', { alpha: true })
  if (ctx) ctx.setTransform(scale, 0, 0, scale, 0, 0)
  seedParticles()
}

function frame(time: number): void {
  if (!running || !ctx) return
  raf = requestAnimationFrame(frame)
  if (time - lastDraw < FRAME_MS) return
  lastDraw = time

  ctx.clearRect(0, 0, width, height)
  if (!sprite) sprite = buildSprite(palette(props.mode).color)
  for (const p of particles) {
    p.x += p.vx + Math.sin(p.phase + time / 3200) * 0.2
    p.y += p.vy
    p.phase += 0.01
    if (p.y < -20) {
      p.y = height + 20
      p.x = Math.random() * width
    }
    if (p.x < -20) p.x = width + 20
    if (p.x > width + 20) p.x = -20
    const s = p.r * 4
    ctx.globalAlpha = p.a * (0.7 + 0.3 * Math.sin(p.phase * 1.4))
    ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s)
  }
  ctx.globalAlpha = 1
}

function onVisibility(): void {
  running = !document.hidden
  if (running) {
    lastDraw = 0
    raf = requestAnimationFrame(frame)
  } else {
    cancelAnimationFrame(raf)
  }
}

let observer: ResizeObserver | null = null

onMounted(() => {
  if (reduced) return
  resize()
  if (!ctx || !globalThis.ResizeObserver) return
  observer = new ResizeObserver(() => resize())
  if (canvas.value) observer.observe(canvas.value)
  document.addEventListener('visibilitychange', onVisibility)
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  running = false
  cancelAnimationFrame(raf)
  document.removeEventListener('visibilitychange', onVisibility)
  observer?.disconnect()
})

watch(
  () => props.mode,
  () => {
    sprite = null
    seedParticles()
  },
)
</script>

<template>
  <canvas v-if="!reduced" ref="canvas" class="particles" aria-hidden="true" />
</template>

<style scoped>
.particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.85;
  /* 不用 mix-blend-mode：全屏混合会让下面所有面板的 backdrop 每帧重算 */
}
</style>
