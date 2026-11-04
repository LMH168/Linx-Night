<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import GlassPanel from '@/components/panels/GlassPanel.vue'
import type { NightStep } from '@/game/types'

const game = useGameStore()

const state = computed(() => game.state)
const round = computed(() => state.value?.round ?? 1)

const order: { id: NightStep; label: string; camp: string }[] = [
  { id: 'wolf', label: '狼人', camp: 'wolf' },
  { id: 'seer', label: '预言家', camp: 'good' },
  { id: 'witch', label: '女巫', camp: 'good' },
]

const stage = computed<NightStep>(
  () => (game.ui.nightStage ?? state.value?.night.step ?? 'wolf') as NightStep,
)

const stageIndex = computed(() => {
  const index = order.findIndex((item) => item.id === stage.value)
  return index === -1 ? 3 : index
})

const me = computed(() => {
  const seat = game.viewerSeat
  if (seat == null) return null
  return state.value?.players.find((p) => p.seat === seat) ?? null
})

const iAmActor = computed(() => {
  if (!me.value) return false
  if (stage.value === 'wolf') return me.value.role === 'wolf'
  if (stage.value === 'seer') return me.value.role === 'seer'
  if (stage.value === 'witch') return me.value.role === 'witch'
  return false
})

const line = computed(() => {
  switch (stage.value) {
    case 'wolf':
      return iAmActor.value ? '轮到你与同伴决定今夜的目标。' : '狼人睁眼，正在选出今夜的目标。'
    case 'seer':
      return iAmActor.value ? '轮到你选择要查验的人。' : '预言家睁眼，正在窥视一张脸。'
    case 'witch':
      return iAmActor.value ? '轮到你决定是否动用药瓶。' : '女巫睁眼，面前摆着两瓶药。'
    default:
      return '所有人闭眼，夜色正在合拢。'
  }
})

const hint = computed(() => {
  return iAmActor.value ? '请在你的行动面板中做出选择。' : '请闭眼等待，不要泄露任何信息。'
})

const alive = computed(() => state.value?.players.filter((p) => p.alive).length ?? 0)
</script>

<template>
  <GlassPanel eyebrow="深夜" title="夜色降临" dense>
    <template #actions>
      <span class="round">第 {{ round }} 夜</span>
    </template>

    <ol class="steps">
      <li
        v-for="(item, index) in order"
        :key="item.id"
        class="step"
        :class="{
          done: index < stageIndex,
          current: index === stageIndex,
        }"
      >
        <span class="pip">
          <span class="pip-dot"></span>
        </span>
        <span class="step-label">{{ item.label }}</span>
        <span class="step-state">
          {{ index < stageIndex ? '已结束' : index === stageIndex ? '进行中' : '待行动' }}
        </span>
      </li>
    </ol>

    <div class="stage-line">
      <p class="line">{{ line }}</p>
      <p class="hint">{{ hint }}</p>
    </div>

    <div class="meta">
      <span>{{ alive }} 人存活</span>
      <span class="dot">·</span>
      <span>暗牌</span>
      <span class="dot">·</span>
      <span>屠边</span>
    </div>
  </GlassPanel>
</template>

<style scoped>
.round {
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--gold-text);
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid rgba(213, 177, 132, 0.22);
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 9px 4px;
  border-bottom: 1px solid rgba(213, 177, 132, 0.07);
  opacity: 0.45;
  transition: opacity 420ms var(--ease);
}

.step.current,
.step.done {
  opacity: 1;
}

.pip {
  position: relative;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
}

.pip::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(213, 177, 132, 0.24);
}

.pip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(213, 177, 132, 0.35);
}

.step.current .pip::before {
  border-color: rgba(226, 190, 130, 0.7);
  box-shadow: 0 0 16px rgba(226, 190, 130, 0.3);
}

.step.current .pip-dot {
  background: var(--gold);
  animation: breathe 2.4s ease-in-out infinite;
}

.step.done .pip-dot {
  background: rgba(159, 210, 189, 0.8);
}

.step.done .pip::before {
  border-color: rgba(159, 210, 189, 0.3);
}

.step-label {
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--ink-2);
}

.step.current .step-label {
  color: var(--ink);
}

.step-state {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}

.step.current .step-state {
  color: var(--gold-text);
}

.stage-line {
  margin-top: 4px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(213, 177, 132, 0.08);
}

.line {
  font-family: var(--font-display);
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink);
}

.hint {
  margin-top: 5px;
  font-size: 11px;
  color: var(--ink-3);
  line-height: 1.6;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}

.dot {
  opacity: 0.5;
}
</style>
