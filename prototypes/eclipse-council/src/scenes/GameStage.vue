<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import TopStatusBar from '@/components/layout/TopStatusBar.vue'
import MessageLog from '@/components/layout/MessageLog.vue'
import SeatRing from '@/components/seats/SeatRing.vue'
import PickBar from '@/components/panels/PickBar.vue'
import RequestLayer from '@/components/panels/RequestLayer.vue'
import SceneWipe from '@/components/scene/SceneWipe.vue'
import DawnOverlay from '@/components/scene/DawnOverlay.vue'
import DealScene from '@/scenes/DealScene.vue'
import FlowPanel from '@/components/panels/FlowPanel.vue'
import NightScene from '@/scenes/NightScene.vue'
import DawnScene from '@/scenes/DawnScene.vue'
import DayScene from '@/scenes/DayScene.vue'
import VoteScene from '@/scenes/VoteScene.vue'

const game = useGameStore()

const scene = computed(() => game.state?.scene ?? 'night')
const round = computed(() => game.state?.round ?? 1)

const panel = computed(() => {
  switch (scene.value) {
    case 'dawn':
      return DawnScene
    case 'day':
      return DayScene
    case 'vote':
    case 'pk':
      return VoteScene
    default:
      return NightScene
  }
})

const stageName = computed(() => {
  const map: Record<string, string> = {
    wolf: '狼人行动',
    seer: '预言家行动',
    witch: '女巫行动',
    done: '等待天亮',
  }
  const stage = game.ui.nightStage ?? game.state?.night.step ?? 'wolf'
  return map[stage] ?? '夜色'
})

const hub = computed(() => {
  const s = game.state
  if (!s) return { mark: '☾', title: '暗林', sub: '九人围坐' }
  if (s.scene === 'night') {
    return { mark: '☾', title: `第 ${s.round} 夜`, sub: stageName.value }
  }
  if (s.pendingHunter != null) return s.pendingHunter === game.viewerSeat ? {mark: '✦', title: '猎人响应', sub: '仅你可见'} : {mark: '✧', title: '结算中', sub: '等待处理完成'}
  if (s.scene === 'dawn') {
    const dead = s.dawn.deaths.length
    return { mark: '✧', title: '破晓', sub: dead ? `${dead} 人倒下` : '平安夜' }
  }
  if (s.scene === 'day') {
    const current = s.day.current
    return {
      mark: '❝',
      title: current ? `${current} 号` : '第 ' + s.round + ' 日',
      sub: current ? '正在发言' : `${s.day.index} / ${s.day.queue.length} 已发言`,
    }
  }
  if (s.scene === 'pk') {
    return { mark: '✕', title: 'PK', sub: s.vote.pk.join(' · ') || '平票对决' }
  }
  const voted = Object.keys(s.vote.ballots).length
  const alive = s.players.filter((p) => p.alive).length
  const eligible = s.vote.round === 2 ? alive - s.vote.pk.length : alive
  return { mark: '▲', title: s.vote.round === 2 ? 'PK 再投票' : '放逐投票', sub: `已投 ${voted} / ${eligible}` }
})
</script>

<template>
  <div class="stage">
    <TopStatusBar />

    <main class="main">
      <section class="ring-zone">
        <SeatRing>
          <template #hub>
            <div class="hub-inner">
              <span class="hub-mark" aria-hidden="true">{{ hub.mark }}</span>
              <p class="hub-title display">{{ hub.title }}</p>
              <p class="hub-sub">{{ hub.sub }}</p>
            </div>
          </template>
        </SeatRing>
      </section>

      <aside class="dock" aria-label="阶段面板">
        <FlowPanel />
        <Transition name="dock" mode="out-in">
          <component :is="panel" :key="scene" />
        </Transition>
      </aside>
    </main>

    <MessageLog />

    <PickBar />
    <RequestLayer />
    <DealScene />
    <DawnOverlay />
    <SceneWipe />

    <Transition name="toast">
      <div v-if="game.ui.toast" class="toast" :data-tone="game.ui.toast.tone">
        {{ game.ui.toast.text }}
      </div>
    </Transition>

    <span class="sr-phase" aria-live="polite">
      {{ round }} 轮，{{ game.state?.scene }}
    </span>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}

.main {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 3vw, 52px);
  padding: 0 clamp(12px, 2.4vw, 40px);
}

.ring-zone {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  place-items: center;
}

.hub-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  animation: fade-up 520ms var(--ease-out) both;
}

.hub-mark {
  font-size: 17px;
  color: rgba(213, 177, 132, 0.6);
}

.hub-title {
  font-size: clamp(15px, 1.5vw, 21px);
  letter-spacing: 0.16em;
  color: var(--scene-tint);
}

.hub-sub {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--ink-3);
}

.dock {
  flex: 0 0 var(--dock-w);
  width: var(--dock-w);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: 76vh;
  padding: 4px 0;
}

.dock > :deep(*) {
  width: 100%;
  flex-shrink: 0;
}
.dock > :deep(.glass) { min-height: 260px; }

.dock-enter-active,
.dock-leave-active {
  transition: opacity 320ms var(--ease), transform 320ms var(--ease-out);
}

.dock-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.dock-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.toast {
  position: fixed;
  top: calc(var(--header-h) + 16px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 85;
  padding: 9px 18px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--ink);
  background: rgba(10, 14, 20, 0.94);
  border: 1px solid var(--line);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
}

.toast[data-tone='warn'] {
  color: #e6c39a;
  border-color: rgba(226, 190, 130, 0.34);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 240ms var(--ease), transform 240ms var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}

.sr-phase {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .dock {
    flex-basis: 328px;
    width: 328px;
  }
}

@media (max-width: 900px) {
  .main {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 6px;
    padding: 6px 10px 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 18px;
  }

  .ring-zone {
    flex: 0 0 auto;
  }

  .dock {
    flex: 0 0 auto;
    width: 100%;
    overflow: visible;
    max-height: none;
    padding-bottom: 8px;
  }
}
</style>
