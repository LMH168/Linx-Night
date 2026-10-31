<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Stage } from './scene/Stage'
import { SEATS } from './data/seats'
import TopBar from './components/TopBar.vue'
import GateHero from './components/GateHero.vue'
import LobbyHud from './components/LobbyHud.vue'
import CornerTicks from './components/CornerTicks.vue'
import RoleCard from './components/RoleCard.vue'
import ClosedEyes from './components/ClosedEyes.vue'
import ResultBoard from './components/ResultBoard.vue'

const canvas = ref<HTMLCanvasElement | null>(null)
const view = ref<'gate' | 'lobby'>('gate')
const entering = ref(false)
const ready = ref(false)
const selected = ref<number | null>(null)
const hovered = ref<number | null>(null)
const overlay = ref<'none' | 'card' | 'eyes' | 'result'>('none')
const dockMode = ref<'kill' | 'vote'>('kill')
const tally = ref<Record<number, number>>({})
const cardFlipped = ref(false)
const tip = ref<{ id: number; x: number; y: number } | null>(null)

let stage: Stage | null = null

onMounted(() => {
  if (!canvas.value) return
  stage = new Stage(canvas.value, {
    onSeatHover: (id, x, y) => {
      hovered.value = id
      tip.value = id ? { id, x, y } : null
    },
    onSeatClick: (id) => {
      selected.value = id
    },
    onProgress: (p) => {
      if (p > 0.62 && view.value === 'gate') {
        view.value = 'lobby'
        entering.value = false
      }
    },
  })
  ;(window as unknown as Record<string, unknown>).__stage = stage
  ;(window as unknown as Record<string, unknown>).__jump = () => {
    stage?.setView('lobby', true)
    stage?.setSelected(null)
    view.value = 'lobby'
    entering.value = false
  }
  ;(window as unknown as Record<string, unknown>).__demo = (name: 'none' | 'card' | 'eyes' | 'vote' | 'result') => {
    stage?.setView('lobby', true)
    view.value = 'lobby'
    entering.value = false
    overlay.value = name === 'card' || name === 'eyes' || name === 'result' ? name : 'none'
    dockMode.value = name === 'vote' ? 'vote' : 'kill'
    tally.value = name === 'vote' ? { 2: 3, 5: 2, 8: 2 } : {}
    cardFlipped.value = false
    selected.value = name === 'vote' ? 5 : null
    stage?.setSelected(selected.value)
  }
  requestAnimationFrame(() => (ready.value = true))
})

onBeforeUnmount(() => stage?.dispose())

function enter() {
  entering.value = true
  stage?.enter()
}

function selectSeat(id: number) {
  const next = id === 0 ? null : id
  selected.value = next
  stage?.setSelected(next)
}

function hoverSeat(id: number | null) {
  hovered.value = id
  if (id) {
    const s = SEATS.find((x) => x.id === id)
    if (s) tip.value = { id, x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }
  } else tip.value = null
}

function confirm() {
  if (selected.value) {
    /* 演示：确认后清空 */
    selected.value = null
    stage?.setSelected(null)
  }
}
</script>

<template>
  <div class="root" :class="{ lobby: view === 'lobby', ready }">
    <canvas ref="canvas" class="canvas" />

    <div class="shade" aria-hidden="true" />

    <TopBar
      :phase="view === 'gate' ? '月升 · 暮色' : '第 1 夜'"
      :meta="view === 'gate' ? 'DUSK' : 'NIGHT ONE'"
      :clock="view === 'gate' ? '18:42' : '00:24'"
      :night="view === 'lobby'"
      @sound="() => {}"
    />

    <CornerTicks />

    <Transition name="fade">
      <GateHero v-if="view === 'gate'" :entering="entering" @enter="enter" />
    </Transition>

    <Transition name="rise">
      <LobbyHud
        v-if="view === 'lobby'"
        :seats="SEATS"
        :selected="selected"
        :hovered="hovered"
        :mode="dockMode"
        :tally="tally"
        @select="selectSeat"
        @hover="hoverSeat"
        @confirm="confirm"
      />
    </Transition>

    <div v-if="overlay === 'card'" class="card-stage">
      <div class="card-veil" @click="overlay = 'none'" />
      <RoleCard :role="'witch'" :seat="1" :flipped="cardFlipped" />
    </div>

    <ClosedEyes v-if="overlay === 'eyes'" :night="1" phase="02:41" />

    <ResultBoard v-if="overlay === 'result'" />

    <div v-if="view === 'gate'" class="gate-foot">
      <div class="scene-id">
        <span class="num">01</span>
        <div class="meta">
          <b>暮林 · 九席</b>
          <span>NINE SEATS · 3 WOLVES · 3 VILLAGERS</span>
        </div>
      </div>
      <div class="hint">
        <span class="mouse" aria-hidden="true" />
        <span>拖动环视&nbsp;&nbsp;·&nbsp;&nbsp;滚轮远近</span>
      </div>
    </div>

    <div v-if="view === 'gate'" class="coords" aria-hidden="true">
      <span>47°12′ N</span><span class="sep" /><span>ALT. 1,240 M</span>
    </div>

    <div v-if="tip && view === 'lobby'" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
      <span class="t-idx">{{ String(tip.id).padStart(2, '0') }}</span>
      <span class="t-name">{{ SEATS.find((s) => s.id === tip!.id)?.name }}</span>
      <span class="t-role">席位</span>
    </div>

    <div class="loader" :class="{ done: ready }" aria-hidden="true">
      <div class="l-mark">
        <svg viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="20.4" fill="none" stroke="currentColor" stroke-opacity=".34" stroke-width=".8" />
          <path d="M10.5 24.4 22 11.7l11.5 12.7" fill="none" stroke="currentColor" stroke-width="1" />
          <path d="M15.1 22.8v9.1h13.8v-9.1" fill="none" stroke="currentColor" stroke-width=".85" stroke-opacity=".7" />
        </svg>
      </div>
      <p>点燃炉火 · 摆放九席 · 让雪落下来</p>
    </div>
  </div>
</template>

<style scoped>
.card-stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 25;
}
.card-veil { z-index: 1;
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 60% at 50% 50%, rgba(4, 7, 6, 0.55), rgba(3, 6, 5, 0.88));
  backdrop-filter: blur(4px);
}
.root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #050806;
}
.canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
.root.lobby .canvas {
  cursor: grab;
}
.shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(3, 6, 5, 0.8) 0%, rgba(3, 6, 5, 0.35) 32%, rgba(3, 6, 5, 0) 58%),
    linear-gradient(180deg, rgba(3, 6, 5, 0.72) 0%, rgba(3, 6, 5, 0) 22%),
    linear-gradient(0deg, rgba(3, 6, 5, 0.82) 0%, rgba(3, 6, 5, 0) 34%),
    radial-gradient(ellipse at 50% 45%, rgba(0, 0, 0, 0) 42%, rgba(0, 0, 0, 0.55) 100%);
  z-index: 4;
}

.gate-foot {
  position: absolute;
  left: 46px;
  right: 46px;
  bottom: 34px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  z-index: 10;
}
.scene-id {
  display: flex;
  align-items: center;
  gap: 14px;
}
.scene-id .num {
  font-family: var(--serif);
  font-size: 30px;
  letter-spacing: 0.06em;
  color: var(--gold);
  opacity: 0.85;
}
.scene-id .meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.scene-id b {
  font-weight: 400;
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--ink-soft);
}
.scene-id span {
  font-size: 8.5px;
  letter-spacing: 0.24em;
  color: var(--ink-faint);
}
.hint {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 9.5px;
  letter-spacing: 0.2em;
  color: var(--ink-faint);
}
.mouse {
  width: 14px;
  height: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  position: relative;
}
.mouse::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 4px;
  width: 1px;
  height: 4px;
  background: var(--gold);
  transform: translateX(-50%);
  animation: wheel 2.2s var(--ease-inout) infinite;
}
@keyframes wheel {
  0%,
  100% {
    opacity: 0.2;
    transform: translate(-50%, 0);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, 4px);
  }
}

.coords {
  position: absolute;
  right: 46px;
  top: 108px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 8.5px;
  letter-spacing: 0.22em;
  color: var(--ink-faint);
  z-index: 10;
}
.coords .sep {
  width: 18px;
  height: 1px;
  background: var(--line);
}

.tip {
  position: fixed;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 12px;
  background: rgba(10, 15, 12, 0.88);
  border: 1px solid var(--line);
  backdrop-filter: blur(10px);
  pointer-events: none;
  z-index: 30;
  white-space: nowrap;
}
.t-idx {
  font-family: var(--serif);
  font-size: 10px;
  color: var(--gold);
}
.t-name {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--ink);
}
.t-role {
  font-size: 8px;
  letter-spacing: 0.2em;
  color: var(--ink-faint);
}

.loader {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: #050806;
  color: var(--gold);
  transition: opacity 0.9s var(--ease-out), visibility 0.9s;
}
.loader.done {
  opacity: 0;
  visibility: hidden;
}
.l-mark svg {
  width: 46px;
  height: 46px;
  opacity: 0.75;
}
.loader p {
  margin: 0;
  font-size: 9.5px;
  letter-spacing: 0.34em;
  color: var(--ink-faint);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.7s var(--ease-out);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.rise-enter-active {
  transition: opacity 0.9s var(--ease-out) 0.15s, transform 0.9s var(--ease-out) 0.15s;
}
.rise-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.rise-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
.rise-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 900px) {
  .gate-foot {
    left: 24px;
    right: 24px;
    bottom: 22px;
  }
  .coords,
  .hint {
    display: none;
  }
}
</style>
