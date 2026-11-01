<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import type { LogKind } from '@/game/types'

const game = useGameStore()
const listRef = ref<HTMLElement | null>(null)

const logs = computed(() => game.logs)
const latest = computed(() => logs.value[logs.value.length - 1] ?? null)

const iconOf: Record<LogKind, string> = {
  system: '·',
  host: '☾',
  night: '☾',
  death: '✕',
  speech: '“',
  vote: '▲',
  skill: '✦',
  win: '★',
  selfdestruct: '✷',
}

function toggle(): void {
  game.ui.logOpen = !game.ui.logOpen
}

watch(
  () => logs.value.length,
  async () => {
    if (!game.ui.logOpen) return
    await nextTick()
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)

watch(
  () => game.ui.logOpen,
  async (open) => {
    if (!open) return
    await nextTick()
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>

<template>
  <div class="logdock" :class="{ open: game.ui.logOpen }">
    <Transition name="sheet">
      <div v-if="game.ui.logOpen" class="sheet">
        <div class="sheet-head">
          <p class="eyebrow">对局事件</p>
          <span class="count">{{ logs.length }} 条</span>
        </div>
        <ul ref="listRef" class="list">
          <li v-for="entry in logs" :key="entry.id" class="row" :data-kind="entry.kind">
            <span class="glyph">{{ iconOf[entry.kind] }}</span>
            <span class="round">R{{ entry.round }}</span>
            <p class="text">{{ entry.text }}</p>
          </li>
          <li v-if="!logs.length" class="empty">尚无事件。</li>
        </ul>
      </div>
    </Transition>

    <button class="bar" type="button" :aria-expanded="game.ui.logOpen" @click="toggle">
      <span class="badge">日志</span>
      <Transition name="tick" mode="out-in">
        <p v-if="latest" :key="latest.id" class="ticker" :data-kind="latest.kind">
          <span class="glyph">{{ iconOf[latest.kind] }}</span>
          {{ latest.text }}
        </p>
        <p v-else key="empty" class="ticker muted">暮色正在合拢，等待第一位发言者。</p>
      </Transition>
      <span class="chev" :class="{ up: game.ui.logOpen }" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6" /></svg>
      </span>
    </button>
  </div>
</template>

<style scoped>
.logdock {
  position: relative;
  z-index: 18;
  flex: 0 0 auto;
}

.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: var(--log-h);
  padding: 0 22px;
  text-align: left;
  border-top: 1px solid rgba(213, 177, 132, 0.1);
  background: linear-gradient(180deg, rgba(4, 6, 10, 0.55), rgba(4, 6, 10, 0.92));
}

.badge {
  flex: 0 0 auto;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--ink-3);
  padding: 3px 8px;
  border: 1px solid rgba(213, 177, 132, 0.14);
  border-radius: 4px;
}

.ticker {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ticker[data-kind='death'] {
  color: #e2a79f;
}
.ticker[data-kind='vote'] {
  color: #e9c193;
}
.ticker[data-kind='skill'] {
  color: #a9c6e8;
}
.ticker[data-kind='win'] {
  color: var(--gold-text);
}
.ticker.muted {
  color: var(--ink-3);
}

.glyph {
  opacity: 0.6;
  font-size: 11px;
}

.chev {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--ink-3);
  transition: transform 300ms var(--ease);
}

.chev.up {
  transform: rotate(180deg);
}

.chev svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  max-height: min(42vh, 360px);
  display: flex;
  flex-direction: column;
  padding: 14px 22px 6px;
  background: linear-gradient(180deg, rgba(8, 11, 16, 0.92), rgba(5, 7, 11, 0.97));
  border-top: 1px solid rgba(213, 177, 132, 0.16);
  box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.5);
}

.sheet-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 8px;
}

.count {
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.12em;
}

.list {
  overflow-y: auto;
  padding-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: grid;
  grid-template-columns: 14px 34px 1fr;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  color: var(--ink-2);
  animation: fade-up 260ms var(--ease-out) both;
}

.row[data-kind='death'] .text {
  color: #e2a79f;
}
.row[data-kind='vote'] .text {
  color: #e9c193;
}
.row[data-kind='host'] .text {
  color: var(--ink);
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}
.row[data-kind='skill'] .text {
  color: #a9c6e8;
}
.row[data-kind='win'] .text {
  color: var(--gold-text);
}

.round {
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.text {
  line-height: 1.5;
}

.empty {
  font-size: 12px;
  color: var(--ink-3);
  padding: 10px 0;
}

.tick-enter-active,
.tick-leave-active {
  transition: opacity 220ms var(--ease), transform 220ms var(--ease);
}

.tick-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.tick-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 260ms var(--ease), transform 260ms var(--ease);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  transform: translateY(14px);
}

@media (max-width: 900px) {
  .bar {
    padding: 0 14px;
    height: 52px;
  }
  .ticker {
    font-size: 11.5px;
  }
  .sheet {
    padding: 10px 14px 4px;
    max-height: 46vh;
  }
}
</style>
