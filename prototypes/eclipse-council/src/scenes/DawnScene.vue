<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { aliveSeatsOf, playerAt } from '@/game/selectors'
import { speechOrder } from '@/game/rules/speechOrder'
import GlassPanel from '@/components/panels/GlassPanel.vue'

const game = useGameStore()
const state = computed(() => game.state)

const dawn = computed(() => state.value?.dawn)
const round = computed(() => state.value?.round ?? 1)

const deaths = computed(() =>
  (dawn.value?.deaths ?? []).map((seat) => ({
    seat,
    name: state.value ? (playerAt(state.value, seat)?.name ?? '') : '',
  })),
)

const order = computed(() => {
  if (!state.value) return []
  return speechOrder(dawn.value?.deaths ?? [], aliveSeatsOf(state.value))
})

const firstWords = computed(() => (round.value === 1 ? '首夜死者拥有遗言。' : '今夜死者没有遗言，直接进入发言。'))
</script>

<template>
  <GlassPanel eyebrow="破晓" title="天亮了">
    <template #actions>
      <span class="round">第 {{ round }} 日</span>
    </template>

    <div v-if="dawn?.peaceNight" class="peace">
      <span class="peace-mark">☾</span>
      <div>
        <p class="peace-title display">昨夜是平安夜</p>
        <p class="peace-sub">没有人倒下。也许有人挡下了这一刀。</p>
      </div>
    </div>

    <div v-else class="fallen">
      <p class="fallen-label">昨夜倒下</p>
      <ul>
        <li v-for="item in deaths" :key="item.seat" class="fallen-row">
          <span class="no">{{ item.seat }}</span>
          <span class="nm">{{ item.name }}</span>
          <span class="cause">出局</span>
        </li>
      </ul>
    </div>

    <div class="order">
      <p class="order-label">发言顺序 · 号码递增</p>
      <div class="chips">
        <span v-for="(seat, index) in order" :key="seat" class="chip" :style="{ '--i': index }">
          {{ seat }}
        </span>
      </div>
      <p class="order-hint">
        从
        <em>{{ order[0] ?? '-' }} 号</em>
        开始，{{ order.length }} 人依次发言。
      </p>
    </div>

    <p class="note">{{ firstWords }}</p>
  </GlassPanel>
</template>

<style scoped>
.round {
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--gold-text);
}

.peace {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(159, 210, 189, 0.18);
  background: rgba(159, 210, 189, 0.05);
}

.peace-mark {
  font-size: 26px;
  color: rgba(159, 210, 189, 0.7);
}

.peace-title {
  font-size: 15px;
  letter-spacing: 0.12em;
  color: #cfe7dc;
}

.peace-sub {
  margin-top: 3px;
  font-size: 11px;
  color: var(--ink-3);
}

.fallen-label,
.order-label {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--ink-3);
  margin-bottom: 8px;
}

.fallen ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fallen-row {
  display: grid;
  grid-template-columns: 26px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 9px;
  background: rgba(194, 90, 78, 0.07);
  border: 1px solid rgba(194, 90, 78, 0.18);
  animation: fade-up 420ms var(--ease-out) both;
}

.no {
  font-family: var(--font-display);
  font-size: 15px;
  color: #dba199;
  font-variant-numeric: tabular-nums;
}

.nm {
  font-size: 12.5px;
  color: var(--ink-2);
}

.cause {
  font-size: 9.5px;
  letter-spacing: 0.18em;
  color: var(--ink-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.chip {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 11.5px;
  color: var(--ink-2);
  border: 1px solid rgba(213, 177, 132, 0.16);
  background: rgba(255, 255, 255, 0.02);
  animation: fade-up 420ms var(--ease-out) both;
  animation-delay: calc(var(--i) * 40ms);
}

.chip:first-child {
  color: #1a1206;
  background: linear-gradient(180deg, #ecd0a4, #c9a169);
  border-color: transparent;
}

.order-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--ink-3);
}

.order-hint em {
  font-style: normal;
  color: var(--gold-text);
}

.note {
  font-size: 10.5px;
  color: var(--ink-3);
  padding-top: 10px;
  border-top: 1px solid rgba(213, 177, 132, 0.08);
}
</style>
