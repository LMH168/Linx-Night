<script setup lang="ts">
import type { SeatMeta } from '../data/seats'

const props = defineProps<{
  seats: SeatMeta[]
  selected: number | null
  hovered: number | null
  mode?: 'kill' | 'vote'
  tally?: Record<number, number>
}>()

const isVote = () => props.mode === 'vote'
const emit = defineEmits<{ (e: 'select', id: number): void; (e: 'hover', id: number | null): void; (e: 'confirm'): void }>()

function pick(id: number) {
  if (id === 1) return
  emit('select', id)
}
</script>

<template>
  <div class="lobby-ui">
  <aside class="rail">
    <header class="rail-head">
      <span class="cn">席位</span>
      <span class="en">SEATS · 09</span>
    </header>
    <ul>
      <li v-for="s in seats" :key="s.id">
        <button
          class="row"
          :class="{ me: s.me, sel: selected === s.id, hov: hovered === s.id }"
          type="button"
          @click="pick(s.id)"
          @mouseenter="emit('hover', s.id)"
          @mouseleave="emit('hover', null)"
        >
          <span class="idx">{{ String(s.id).padStart(2, '0') }}</span>
          <span class="name">{{ s.name }}</span>
          <span class="role">{{ s.role }}</span>
        </button>
      </li>
    </ul>
    <footer class="rail-foot">
      <span class="live" /> 在场 9 · 出局 0
    </footer>
  </aside>

  <p class="narration">月亮升起来了。<span class="dimmer">请闭上眼。</span></p>

  <section class="dock">
    <div class="dock-head">
      <div class="titles">
        <span class="kicker">{{ isVote() ? '指认 · 全体投票' : '狼人 · 请睁眼' }}</span>
        <span class="desc">{{ isVote() ? '指向一个人，或者指向空处。平票则无人出局。' : '今晚要带走一个人。队友的票，念在同一条命上。' }}</span>
      </div>
      <span class="counter">{{ isVote() ? '已投 7 / 9' : selected ? '已选 1 · 待确认' : '未选择' }}</span>
    </div>

    <div class="dock-body">
      <div class="chips">
        <button
          v-for="s in props.seats"
          :key="s.id"
          class="chip"
          :class="{ sel: selected === s.id, off: s.id === 1 }"
          type="button"
          :disabled="s.id === 1"
          @click="pick(s.id)"
        >
          <span class="num">{{ s.id }}</span>
          <span class="nm">{{ s.me ? '你' : s.name }}</span>
          <span v-if="isVote() && tally?.[s.id]" class="tally">{{ tally[s.id] }}</span>
        </button>
      </div>

      <div class="acts">
        <button class="ghost" type="button" @click="emit('select', 0)">弃权</button>
        <button class="primary" type="button" :disabled="!selected" @click="emit('confirm')">{{ isVote() ? '确认放逐' : '确认刀人' }}</button>
      </div>
    </div>
  </section>
  </div>
</template>

<style scoped>
.lobby-ui { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
.lobby-ui > * { pointer-events: auto; }
.tally {
  margin-left: 4px;
  font-size: 9px;
  color: #d4b27a;
  border: 1px solid rgba(212, 178, 122, 0.5);
  border-radius: 999px;
  padding: 0 4px;
}
.lobby-ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}
.lobby-ui > * {
  pointer-events: auto;
}
.rail {
  position: absolute;
  left: 40px;
  top: 112px;
  width: 232px;
  z-index: 10;
  border: 1px solid var(--line-soft);
  background: linear-gradient(180deg, rgba(20, 27, 23, 0.55), rgba(11, 16, 13, 0.7));
  backdrop-filter: blur(14px) saturate(1.1);
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(236, 225, 200, 0.05);
}
.rail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 15px 16px 12px;
  border-bottom: 1px solid var(--line-soft);
}
.rail-head .cn {
  font-family: var(--serif);
  font-size: 14px;
  letter-spacing: 0.26em;
  color: var(--ink);
}
.rail-head .en {
  font-size: 8px;
  letter-spacing: 0.3em;
  color: var(--gold-deep);
}
.rail ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.row {
  width: 100%;
  display: grid;
  grid-template-columns: 26px 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  text-align: left;
  border-left: 1px solid transparent;
  transition: background 0.3s var(--ease-out), border-color 0.3s var(--ease-out);
}
.row .idx {
  font-family: var(--serif);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--gold-deep);
  opacity: 0.75;
}
.row .name {
  font-size: 12.5px;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
}
.row .role {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
}
.row.me .name {
  color: var(--gold);
}
.row.me .role {
  color: var(--gold-deep);
}
.row.hov {
  background: rgba(212, 178, 122, 0.06);
}
.row.sel {
  background: linear-gradient(90deg, rgba(212, 178, 122, 0.14), transparent 80%);
  border-left-color: var(--gold);
}
.row.sel .name {
  color: var(--ink);
}
.rail-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px 12px;
  border-top: 1px solid var(--line-soft);
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--ink-faint);
}
.live {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #7fa07a;
  box-shadow: 0 0 8px rgba(127, 160, 122, 0.9);
}

.narration {
  position: absolute;
  left: 50%;
  bottom: 236px;
  transform: translateX(-50%);
  margin: 0;
  font-family: var(--serif);
  font-size: 15px;
  letter-spacing: 0.16em;
  color: rgba(240, 233, 217, 0.88);
  text-shadow: 0 6px 30px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  z-index: 10;
}
.narration .dimmer {
  color: var(--ink-soft);
}
.narration::before,
.narration::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 54px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--line));
}
.narration::before {
  right: calc(100% + 18px);
}
.narration::after {
  left: calc(100% + 18px);
  transform: rotate(180deg);
}

.dock {
  position: absolute;
  left: 50%;
  bottom: 30px;
  transform: translateX(-50%);
  width: min(920px, calc(100vw - 96px));
  padding: 18px 22px 20px;
  border: 1px solid var(--line-soft);
  background: linear-gradient(180deg, rgba(20, 27, 23, 0.62), rgba(10, 15, 12, 0.82));
  backdrop-filter: blur(16px) saturate(1.15);
  box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(236, 225, 200, 0.06);
  z-index: 12;
}
.dock-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-soft);
}
.titles {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.kicker {
  font-family: var(--serif);
  font-size: 15px;
  letter-spacing: 0.2em;
  color: var(--gold);
}
.desc {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
}
.counter {
  font-size: 9.5px;
  letter-spacing: 0.2em;
  color: var(--gold-deep);
  padding-top: 4px;
}

.dock-body {
  display: flex;
  align-items: center;
  gap: 22px;
  padding-top: 15px;
}
.chips {
  display: flex;
  gap: 7px;
  flex: 1;
  flex-wrap: wrap;
}
.chip {
  width: 62px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 1px solid var(--line-soft);
  background: rgba(255, 255, 255, 0.015);
  transition: all 0.3s var(--ease-out);
}
.chip .num {
  font-family: var(--serif);
  font-size: 13px;
  color: var(--ink);
}
.chip .nm {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
}
.chip:hover {
  border-color: var(--line);
  background: rgba(212, 178, 122, 0.07);
  transform: translateY(-1px);
}
.chip.sel {
  border-color: var(--gold);
  background: linear-gradient(180deg, rgba(212, 178, 122, 0.18), rgba(212, 178, 122, 0.05));
  box-shadow: 0 0 24px -6px rgba(212, 178, 122, 0.45), inset 0 1px 0 rgba(255, 245, 220, 0.15);
}
.chip.sel .nm {
  color: var(--gold);
}
.chip.off {
  opacity: 0.32;
  cursor: not-allowed;
}

.acts {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ghost {
  height: 44px;
  padding: 0 20px;
  border: 1px solid var(--line);
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--ink-soft);
  transition: all 0.3s var(--ease-out);
}
.ghost:hover {
  color: var(--ink);
  background: rgba(212, 178, 122, 0.06);
}
.primary {
  height: 44px;
  padding: 0 28px;
  background: linear-gradient(180deg, #e7c991, #c9a568);
  color: #17110a;
  font-size: 11px;
  letter-spacing: 0.22em;
  border: 1px solid rgba(255, 240, 210, 0.45);
  box-shadow: 0 14px 34px -18px rgba(212, 178, 122, 0.7);
  transition: all 0.3s var(--ease-out);
}
.primary:disabled {
  opacity: 0.35;
  pointer-events: none;
}
.primary:not(:disabled):hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

@media (max-width: 900px) {
  .rail {
    display: none;
  }
  .narration {
    bottom: 210px;
    font-size: 13px;
  }
  .dock {
    width: calc(100vw - 32px);
    bottom: 16px;
    padding: 14px 16px 16px;
  }
  .desc {
    display: none;
  }
  .chip {
    width: calc((100% - 28px) / 5);
    height: 50px;
  }
}
</style>
