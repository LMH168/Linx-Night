<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import SceneBackground from '@/components/scene/SceneBackground.vue'
import GameStage from '@/scenes/GameStage.vue'
import LobbyScene from '@/scenes/LobbyScene.vue'
import ResultScene from '@/scenes/ResultScene.vue'
import PrototypeDemo from '@/components/layout/PrototypeDemo.vue'
import RulesPanel from '@/components/layout/RulesPanel.vue'
import SettingsDialog from '@/components/layout/SettingsDialog.vue'
import { cancelPick, confirmPick, pickSeat, seatPick } from '@/composables/useSeatPick'

const game = useGameStore()

const inGame = computed(() => game.state != null)
const finished = computed(() => game.state?.scene === 'result')

const sceneKey = computed(() => {
  const s = game.state
  if (!s) return 'lobby'
  return s.scene
})

const bgScene = computed(() => {
  const s = game.state
  if (!s || s.scene === 'lobby') return 'lobby'
  if (s.scene === 'deal') return 'vote'
  if (s.scene === 'night') return 'night'
  if (s.scene === 'dawn' || s.scene === 'day') return 'day'
  if (s.scene === 'result') return 'vote'
  return 'vote'
})

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

function onKey(event: KeyboardEvent): void {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')]
  const dialog = dialogs[dialogs.length - 1]
  if (event.key === 'Tab' && dialog) {
    const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]')].filter(el => el.getBoundingClientRect().width > 0)
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length
    if (items.length) { event.preventDefault(); items[next]?.focus() }
    return
  }
  if (isTyping(event.target)) return

  if (event.key === 'Escape') {
    if (seatPick.active) {
      cancelPick()
      return
    }
    game.ui.showRules = false
    game.ui.showSettings = false
    game.ui.logOpen = false
    return
  }

  if (!seatPick.active) return

  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault()
    pickSeat(Number(event.key))
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    confirmPick()
  }
}

watch(() => [game.request, game.ui.showSettings, game.ui.showRules, game.flow.endConfirm], async () => {
  await nextTick()
  const dialogs = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')]
  dialogs[dialogs.length - 1]?.querySelector<HTMLElement>('button, input, textarea, select')?.focus()
})
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app" :data-scene="sceneKey">
    <SceneBackground :scene="bgScene" />

    <LobbyScene v-if="!inGame" class="view" />
    <template v-else>
      <GameStage :key="'stage'" class="view" />
      <Transition name="result">
        <ResultScene v-if="finished" />
      </Transition>
    </template>
    <PrototypeDemo />
    <RulesPanel />
    <SettingsDialog />
    <div v-if="game.blocked && game.request" class="connection-veil" role="alert"><template v-if="!game.flow.connected"><p>连接中断，正在重新连接…</p><button @click="game.flow.connected=true">模拟连接恢复</button></template><template v-else-if="game.flow.aiFailed"><p>AI 回合失败，等待房主重试。</p><button v-if="game.flow.host" @click="game.flow.aiFailed=false">重试 AI 回合</button></template><template v-else><p>{{game.flow.playback==='failed'?'主持播放失败，请重试':'正在等待主持播报结束'}}</p><button v-if="game.flow.playback==='failed' || game.flow.playback==='paused'" @click="game.flow.playback='playing'">重试 / 继续播放</button><button v-if="game.flow.playback==='playing'" @click="game.finishPlayback()">模拟播放完成</button></template></div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  min-height: 100dvh;
  color: var(--ink);
}

.view {
  position: relative;
  z-index: 10;
}

.result-enter-active {
  transition: opacity 900ms var(--ease);
}

.result-enter-from {
  opacity: 0;
}
</style>

<style>.connection-veil{position:fixed;inset:0;z-index:145;background:#050914ed;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}.connection-veil button{border:1px solid #c9a86a;padding:12px 24px;border-radius:9px}</style>
