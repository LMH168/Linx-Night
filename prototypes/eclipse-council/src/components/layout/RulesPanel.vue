<script setup lang="ts">
import { useGameStore } from '@/stores/game'
import { BOARD_LINE, RULES_SECTIONS, RULINGS, WORLD_LINE } from '@/data/rules'

const game = useGameStore()

function close(): void {
  game.ui.showRules = false
}
</script>

<template>
  <Transition name="fade">
    <div v-if="game.ui.showRules" class="veil" @click.self="close">
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="规则">
        <header class="head">
          <div>
            <p class="eyebrow">规则</p>
            <h2 class="display title">九人预巫猎 · 无警长 · 屠边</h2>
          </div>
          <button class="close" type="button" aria-label="关闭规则" @click="close">✕</button>
        </header>

        <p class="board">{{ BOARD_LINE }}</p>
        <p class="world">{{ WORLD_LINE }}</p>

        <div class="scroll">
          <section v-for="section in RULES_SECTIONS" :key="section.title" class="section">
            <h3 class="s-title display">{{ section.title }}</h3>
            <ul>
              <li v-for="line in section.lines" :key="line">{{ line }}</li>
            </ul>
          </section>

          <section class="section section--rulings">
            <h3 class="s-title display">本版裁定</h3>
            <ul>
              <li v-for="ruling in RULINGS" :key="ruling.title">
                <strong>{{ ruling.title }}</strong>：{{ ruling.detail }}
              </li>
            </ul>
          </section>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  justify-content: flex-end;
  background: rgba(3, 5, 9, 0.72);
}

.drawer {
  width: min(460px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 24px 8px;
  background: linear-gradient(180deg, rgba(11, 15, 22, 0.97), rgba(6, 8, 12, 0.99));
  border-left: 1px solid var(--line);
  box-shadow: -30px 0 80px rgba(0, 0, 0, 0.6);
  animation: drawer-in 320ms var(--ease-out) both;
}

@keyframes drawer-in {
  from {
    transform: translateX(30px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-size: 18px;
  letter-spacing: 0.08em;
  margin-top: 4px;
}

.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 12px;
  transition: color 200ms, border-color 200ms;
}

.close:hover {
  color: var(--gold-text);
  border-color: var(--line-strong);
}

.board {
  margin-top: 14px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--gold-text);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(213, 177, 132, 0.18);
  background: rgba(213, 177, 132, 0.05);
}

.world {
  margin-top: 10px;
  font-family: var(--font-display);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-3);
}

.scroll {
  margin-top: 18px;
  overflow-y: auto;
  padding-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section h3 {
  font-size: 13px;
  letter-spacing: 0.16em;
  color: var(--ink);
  margin-bottom: 8px;
  padding-left: 10px;
  border-left: 2px solid rgba(213, 177, 132, 0.4);
}

.section ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section li {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-2);
}

.section--rulings li {
  color: var(--ink-3);
  font-size: 12px;
}

.section--rulings strong {
  color: var(--ink-2);
  font-weight: 500;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 240ms var(--ease);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
