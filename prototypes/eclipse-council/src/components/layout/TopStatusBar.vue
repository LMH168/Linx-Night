<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const alive = computed(() => {
  const s = game.state
  if (!s) return { total: 9, good: 6, wolf: 3 }
  const list = s.players.filter((p) => p.alive)
  return {
    total: list.length,
    good: list.filter((p) => p.camp === 'good').length,
    wolf: list.filter((p) => p.camp === 'wolf').length,
  }
})

const phase = computed(() => {
  const s = game.state
  if (!s) return { label: '候场', key: 'idle' as const }
  switch (s.scene) {
    case 'night':
      return { label: `第 ${s.round} 夜`, key: 'night' as const }
    case 'dawn':
      return { label: '破晓', key: 'dawn' as const }
    case 'day':
      return { label: `第 ${s.round} 日`, key: 'day' as const }
    case 'vote':
      return { label: '黄昏投票', key: 'vote' as const }
    case 'pk':
      return { label: '平票 PK', key: 'vote' as const }
    case 'deal':
      return { label: '发牌', key: 'deal' as const }
    default:
      return { label: '对局中', key: 'idle' as const }
  }
})
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="mark" aria-hidden="true">☾</span>
      <div class="brand-text">
        <p class="brand-title display">暗林月夜</p>
        <p class="brand-sub">九人局 · 预巫猎</p>
      </div>
    </div>

    <nav class="ribbon" aria-label="阶段">
      <span class="step" :class="{ on: phase.key === 'night' }">
        <i class="dot dot--night"></i>深夜
      </span>
      <span class="sep" aria-hidden="true"></span>
      <span class="step" :class="{ on: phase.key === 'day' || phase.key === 'dawn' }">
        <i class="dot dot--day"></i>白昼
      </span>
      <span class="sep" aria-hidden="true"></span>
      <span class="step" :class="{ on: phase.key === 'vote' }">
        <i class="dot dot--vote"></i>黄昏
      </span>
    </nav>

    <div class="right">
      <span class="phase-badge display">{{ phase.label }}</span>
      <span class="stat" title="存活人数">
        <em>{{ alive.total }}</em><span>/ 9 存活</span>
      </span>
      <button
        class="icon-btn"
        type="button"
        title="切换节奏"
        aria-label="切换节奏"
        @click="game.ui.showSettings = true"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path
            d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
          />
        </svg>
      </button>
      <button
        class="icon-btn"
        type="button"
        title="规则"
        aria-label="打开规则"
        @click="game.ui.showRules = true"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
          <path d="M17 7h2v13H8" />
          <path d="M8.5 9h5M8.5 12.5h3.5" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: relative;
  z-index: 20;
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 22px;
  border-bottom: 1px solid rgba(213, 177, 132, 0.12);
  background: linear-gradient(180deg, rgba(6, 9, 14, 0.94), rgba(5, 7, 11, 0.62));
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 15px;
  color: var(--gold-text);
  background: radial-gradient(circle at 35% 30%, rgba(240, 216, 168, 0.22), rgba(0, 0, 0, 0.4));
  border: 1px solid rgba(213, 177, 132, 0.28);
  box-shadow: 0 0 22px rgba(213, 177, 132, 0.14);
}

.brand-title {
  font-size: 15px;
  letter-spacing: 0.24em;
  color: var(--ink);
  line-height: 1.2;
}

.brand-sub {
  font-size: 10px;
  letter-spacing: 0.26em;
  color: var(--ink-3);
}

.ribbon {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(213, 177, 132, 0.12);
  background: rgba(6, 9, 14, 0.5);
}

.step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  letter-spacing: 0.18em;
  color: var(--ink-3);
  transition: color 420ms var(--ease);
}

.step.on {
  color: var(--gold-text);
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
}

.step.on .dot {
  opacity: 1;
  box-shadow: 0 0 10px currentColor;
}

.dot--night {
  color: #8fb6e8;
}
.dot--day {
  color: #b7d8c4;
}
.dot--vote {
  color: #e6a870;
}

.sep {
  width: 14px;
  height: 1px;
  background: rgba(213, 177, 132, 0.18);
}

.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.phase-badge {
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--scene-tint);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(213, 177, 132, 0.16);
  background: rgba(6, 9, 14, 0.45);
  white-space: nowrap;
}

.stat {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  white-space: nowrap;
}

.stat em {
  font-style: normal;
  font-size: 14px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(213, 177, 132, 0.16);
  color: var(--ink-2);
  background: rgba(6, 9, 14, 0.5);
  transition: color 260ms var(--ease), border-color 260ms var(--ease), background 260ms var(--ease);
}

.icon-btn:hover {
  color: var(--gold-text);
  border-color: rgba(213, 177, 132, 0.4);
  background: rgba(20, 16, 10, 0.6);
}

.icon-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}

@media (max-width: 900px) {
  .topbar {
    padding: 0 14px;
    gap: 10px;
    height: 56px;
  }
  .ribbon {
    display: none;
  }
  .brand-sub {
    display: none;
  }
  .stat span {
    display: none;
  }
}
</style>
