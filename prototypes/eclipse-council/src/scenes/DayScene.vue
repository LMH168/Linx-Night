<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import { playerAt } from '@/game/selectors'
import GlassPanel from '@/components/panels/GlassPanel.vue'

const game = useGameStore()
const state = computed(() => game.state)
const listRef = ref<HTMLElement | null>(null)
const confirming = ref(false)

const today = computed(() => {
  const s = state.value
  if (!s) return []
  return s.speeches
    .filter((speech) => speech.kind === 'day' && speech.round === s.round)
    .map((speech) => ({
      ...speech,
      name: playerAt(s, speech.seat)?.name ?? '',
    }))
})

const current = computed(() => {
  const seat = state.value?.day.current
  if (seat == null) return null
  return playerAt(state.value!, seat) ?? null
})

const total = computed(() => state.value?.day.queue.length ?? 0)
const done = computed(() => state.value?.day.index ?? 0)

const me = computed(() => {
  const seat = game.viewerSeat
  if (seat == null) return null
  return state.value?.players.find((p) => p.seat === seat) ?? null
})

const canSelfDestruct = computed(() => false)

function selfDestruct(): void {
  if (!me.value) return
  if (!confirming.value) {
    confirming.value = true
    window.setTimeout(() => {
      confirming.value = false
    }, 3200)
    return
  }
  confirming.value = false
  game.selfDestruct(me.value.seat)
}

watch(
  () => today.value.length,
  async () => {
    await nextTick()
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)

watch(
  () => game.request,
  () => {
    confirming.value = false
  },
)
</script>

<template>
  <GlassPanel eyebrow="白昼" title="轮流发言">
    <template #actions>
      <span class="progress">{{ done }} / {{ total }}</span>
    </template>

    <div class="speaker" :class="{ live: current != null }">
      <span class="pulse" aria-hidden="true"></span>
      <div class="sp-text">
        <p class="sp-label">{{ current ? '正在发言' : '发言阶段' }}</p>
        <p class="sp-name display">
          <template v-if="current">{{ current.seat }} 号 · {{ current.name }}</template>
          <template v-else-if="done >= total && total > 0">全部发言完毕</template>
          <template v-else>等待开始</template>
        </p>
      </div>
    </div>

    <div ref="listRef" class="speeches">
      <TransitionGroup name="speech">
        <article v-for="speech in today" :key="`${speech.seat}-${speech.text}-${speech.round}`" class="speech">
          <header>
            <span class="s-seat">{{ speech.seat }}</span>
            <span class="s-name">{{ speech.name }}</span>
          </header>
          <p class="s-text">{{ speech.text || '（沉默）' }}</p>
        </article>
      </TransitionGroup>
      <p v-if="!today.length" class="empty">白昼刚刚开始，还没有人开口。</p>
    </div>

    <template #footer>
      <div class="foot">
        <button
          v-if="canSelfDestruct"
          class="destruct"
          type="button"
          :class="{ confirming }"
          @click="selfDestruct"
        >
          {{ confirming ? '再点一次确认自爆' : '自爆' }}
        </button>
        <p v-else class="tip">发言结束后，点击继续进入下一步。</p>
      </div>
    </template>
  </GlassPanel>
</template>

<style scoped>
.progress {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.speaker {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(213, 177, 132, 0.12);
  background: rgba(255, 255, 255, 0.025);
  transition: border-color 420ms var(--ease), background 420ms var(--ease);
}

.speaker.live {
  border-color: rgba(226, 190, 130, 0.34);
  background: rgba(226, 190, 130, 0.06);
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ink-3);
  flex: 0 0 auto;
}

.live .pulse {
  background: var(--gold);
  box-shadow: 0 0 0 0 rgba(226, 190, 130, 0.6);
  animation: pulse-ring 2s ease-out infinite;
}

@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(226, 190, 130, 0.5);
  }
  100% {
    box-shadow: 0 0 0 14px rgba(226, 190, 130, 0);
  }
}

.sp-label {
  font-size: 9.5px;
  letter-spacing: 0.22em;
  color: var(--ink-3);
}

.sp-name {
  margin-top: 2px;
  font-size: 15px;
  letter-spacing: 0.08em;
  color: var(--ink);
}

.speeches {
  flex: 1 1 auto;
  min-height: 90px;
  max-height: 34vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.speech {
  padding: 10px 12px;
  border-radius: 10px;
  border-left: 2px solid rgba(213, 177, 132, 0.22);
  background: rgba(255, 255, 255, 0.02);
}

.speech header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.s-seat {
  font-size: 10.5px;
  color: var(--gold-text);
  font-variant-numeric: tabular-nums;
}

.s-name {
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
}

.s-text {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-2);
}

.empty {
  font-size: 12px;
  color: var(--ink-3);
  padding: 12px 2px;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tip {
  font-size: 10.5px;
  color: var(--ink-3);
}

.destruct {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 11.5px;
  letter-spacing: 0.1em;
  color: #dba199;
  border: 1px solid rgba(194, 90, 78, 0.34);
  background: rgba(194, 90, 78, 0.06);
  transition: background 200ms, color 200ms;
}

.destruct:hover {
  background: rgba(194, 90, 78, 0.14);
}

.destruct.confirming {
  color: #1a0606;
  background: linear-gradient(180deg, #e58e80, #b8554a);
  border-color: transparent;
}

.speech-enter-active {
  transition: opacity 420ms var(--ease), transform 420ms var(--ease-out);
}

.speech-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
</style>
