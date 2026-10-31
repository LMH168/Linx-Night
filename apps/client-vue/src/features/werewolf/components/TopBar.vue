<script setup lang="ts">
defineProps<{ phase: string; meta: string; clock: string; night: boolean }>()
const emit = defineEmits<{ (e: 'sound'): void }>()
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="20.4" fill="none" stroke="currentColor" stroke-opacity=".38" stroke-width=".8" />
          <path d="M10.5 24.4 22 11.7l11.5 12.7" fill="none" stroke="currentColor" stroke-width="1" />
          <path d="M15.1 22.8v9.1h13.8v-9.1" fill="none" stroke="currentColor" stroke-width=".85" stroke-opacity=".72" />
          <path d="M18.8 31.9v-5.3h6.4v5.3" fill="none" stroke="currentColor" stroke-width=".7" stroke-opacity=".45" />
          <path d="M22 6.8v3.1M22 34.1v3.1" stroke="currentColor" stroke-width=".7" stroke-opacity=".38" />
        </svg>
      </span>
      <span class="type">
        <span class="cn">暮林夜宴</span>
        <span class="en">WALDNACHT · NINE SEATS</span>
      </span>
    </div>

    <div class="phase">
      <span class="dot" :class="{ night }" />
      <span class="phase-cn">{{ phase }}</span>
      <span class="sep" />
      <span class="phase-en">{{ meta }}</span>
      <span class="sep" />
      <span class="clock">{{ clock }}</span>
    </div>

    <div class="actions">
      <button class="ghost" type="button" aria-label="环境声" @click="emit('sound')">
        <span class="bars" aria-hidden="true"><i /><i /><i /></span>
        <span>环境声</span>
      </button>
      <button class="icon" type="button" aria-label="设置">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.1" />
          <path d="M12 3.4v2.2M12 18.4v2.2M4.6 12H2.4M21.6 12h-2.2M6.7 6.7 5.2 5.2M18.8 18.8l-1.5-1.5M17.3 6.7l1.5-1.5M5.2 18.8l1.5-1.5" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: absolute;
  inset: 0 0 auto 0;
  height: 84px;
  padding: 0 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 20;
  pointer-events: none;
}
.topbar > * {
  pointer-events: auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 13px;
  color: var(--gold);
}
.mark svg {
  width: 34px;
  height: 34px;
  display: block;
}
.type {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cn {
  font-family: var(--serif);
  font-size: 17px;
  letter-spacing: 0.24em;
  color: var(--ink);
}
.en {
  font-size: 8.5px;
  letter-spacing: 0.3em;
  color: var(--ink-faint);
}

.phase {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--ink-soft);
  text-transform: uppercase;
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ember, #d0763c);
  box-shadow: 0 0 10px rgba(208, 118, 60, 0.9);
}
.dot.night {
  background: #9fb4c6;
  box-shadow: 0 0 10px rgba(159, 180, 198, 0.8);
}
.phase-cn {
  font-family: var(--serif);
  font-size: 13px;
  letter-spacing: 0.2em;
  color: var(--ink);
}
.sep {
  width: 1px;
  height: 11px;
  background: var(--line);
}
.phase-en {
  color: var(--gold-deep);
}
.clock {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.16em;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ghost {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--line-soft);
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--ink-soft);
  backdrop-filter: blur(8px);
  transition: all 0.32s var(--ease-out);
}
.ghost:hover {
  color: var(--ink);
  border-color: var(--line);
  background: rgba(212, 178, 122, 0.06);
}
.bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 10px;
}
.bars i {
  width: 1.5px;
  background: currentColor;
  animation: bar 1.6s ease-in-out infinite;
}
.bars i:nth-child(1) {
  height: 4px;
}
.bars i:nth-child(2) {
  height: 9px;
  animation-delay: 0.2s;
}
.bars i:nth-child(3) {
  height: 6px;
  animation-delay: 0.4s;
}
@keyframes bar {
  0%,
  100% {
    transform: scaleY(0.6);
  }
  50% {
    transform: scaleY(1);
  }
}
.icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--line-soft);
  display: grid;
  place-items: center;
  color: var(--ink-soft);
  transition: all 0.32s var(--ease-out);
}
.icon svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 0.9;
}
.icon:hover {
  color: var(--ink);
  border-color: var(--line);
}
</style>
