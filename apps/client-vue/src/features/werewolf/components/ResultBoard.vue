<script setup lang="ts">
import { BOARD, ROLES } from '../data/roles'
import RoleSigil from './RoleSigil.vue'

const timeline = [
  { label: '第 1 夜', text: '守卫守护 6 号 · 狼人袭击 2 号 · 女巫使用解药', tone: 'night' },
  { label: '第 1 天', text: '4 号被指认出局 · 遗言：7 号是狼', tone: 'day' },
  { label: '第 2 夜', text: '守卫守护 1 号 · 狼人袭击 6 号 · 女巫使用毒药', tone: 'night' },
  { label: '第 2 天', text: '8 号出局 · 平安夜 · 预言家报验：5 号是狼', tone: 'day' },
  { label: '第 3 夜', text: '狼人袭击 4 号未果 · 守卫力竭', tone: 'night' },
]
</script>

<template>
  <div class="board">
    <div class="veil" />
    <section class="panel">
      <span class="tick tl" /><span class="tick tr" /><span class="tick bl" /><span class="tick br" />
      <header>
        <p class="kicker">GAME OVER · 第 3 天</p>
        <h2>好人阵营胜利</h2>
        <p class="sub">三只狼人已全部出局 · 用时 11:24</p>
      </header>

      <div class="grid">
        <div v-for="p in BOARD" :key="p.seat" class="tile" :class="[p.role === 'wolf' ? 'wolf' : 'good', { dead: !p.alive, me: p.seat === 1 }]">
          <span class="no">{{ String(p.seat).padStart(2, '0') }}</span>
          <RoleSigil :role="p.role" :size="26" />
          <span class="rn">{{ ROLES[p.role].cn }}</span>
          <span class="nick">{{ p.name }}</span>
          <span v-if="!p.alive" class="out">出局</span>
        </div>
      </div>

      <ol class="timeline">
        <li v-for="t in timeline" :key="t.label" :class="t.tone">
          <span class="dot" />
          <span class="lb">{{ t.label }}</span>
          <span class="tx">{{ t.text }}</span>
        </li>
      </ol>

      <footer>
        <button class="ghost" type="button">查看复盘</button>
        <button class="primary" type="button">再来一局</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.board {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 40;
}
.veil {
  position: absolute;
  inset: 0;
  background: rgba(3, 6, 5, 0.82);
  backdrop-filter: blur(6px);
}
.panel {
  position: relative;
  width: min(1120px, 88vw);
  padding: 38px 44px 30px;
  background:
    radial-gradient(90% 60% at 50% 0%, rgba(212, 178, 122, 0.1), transparent 60%),
    rgba(12, 18, 15, 0.88);
  border: 1px solid rgba(224, 210, 180, 0.2);
  box-shadow: 0 60px 120px -40px #000;
}
.tick {
  position: absolute;
  width: 9px;
  height: 9px;
  border: 1px solid rgba(224, 210, 180, 0.5);
}
.tl { top: 12px; left: 12px; border-right: 0; border-bottom: 0; }
.tr { top: 12px; right: 12px; border-left: 0; border-bottom: 0; }
.bl { bottom: 12px; left: 12px; border-right: 0; border-top: 0; }
.br { bottom: 12px; right: 12px; border-left: 0; border-top: 0; }

header {
  text-align: center;
  margin-bottom: 26px;
}
.kicker {
  margin: 0 0 12px;
  font-size: 10px;
  letter-spacing: 0.3em;
  color: rgba(212, 178, 122, 0.7);
}
h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 40px;
  font-weight: 400;
  letter-spacing: 0.26em;
  text-indent: 0.26em;
  color: #f0e9d9;
}
.sub {
  margin: 10px 0 0;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: rgba(236, 230, 214, 0.45);
}

.grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 10px;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 6px 12px;
  border: 1px solid rgba(224, 210, 180, 0.14);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(236, 230, 214, 0.8);
}
.tile.good :deep(.sigil) { color: #9fc3b1; }
.tile.wolf :deep(.sigil) { color: #d3857a; }
.tile.me { box-shadow: inset 0 0 0 1px rgba(212, 178, 122, 0.55); }
.tile.dead { opacity: 0.42; }
.tile.dead::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 48%, rgba(236, 230, 214, 0.35) 49%, transparent 51%);
}
.no {
  font-size: 9px;
  letter-spacing: 0.16em;
  color: rgba(236, 230, 214, 0.35);
}
.rn {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.12em;
}
.nick {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(236, 230, 214, 0.38);
}
.out {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 8px;
  letter-spacing: 0.1em;
  color: rgba(236, 230, 214, 0.4);
}

.timeline {
  list-style: none;
  margin: 26px 0 0;
  padding: 18px 20px;
  border: 1px solid rgba(224, 210, 180, 0.1);
  background: rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.timeline li {
  display: grid;
  grid-template-columns: 12px 58px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  letter-spacing: 0.06em;
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8fb0a0;
}
.night .dot { background: #d4b27a; }
.lb { color: rgba(236, 230, 214, 0.5); font-size: 10px; letter-spacing: 0.14em; }
.tx { color: rgba(236, 230, 214, 0.72); }

footer {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 26px;
}
button {
  font: inherit;
  cursor: pointer;
  padding: 12px 30px;
  font-size: 12px;
  letter-spacing: 0.22em;
  border-radius: 2px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.ghost {
  background: transparent;
  border: 1px solid rgba(224, 210, 180, 0.24);
  color: rgba(236, 230, 214, 0.7);
}
.primary {
  background: linear-gradient(180deg, #e2c491, #c9a468);
  border: 1px solid rgba(255, 236, 196, 0.5);
  color: #14100a;
}
</style>
