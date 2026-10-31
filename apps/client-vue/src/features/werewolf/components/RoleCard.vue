<script setup lang="ts">
import { ROLES, type RoleId } from '../data/roles'
import RoleSigil from './RoleSigil.vue'

const props = defineProps<{ role: RoleId; seat: number; flipped?: boolean; revealed?: boolean }>()
const meta = () => ROLES[props.role]
</script>

<template>
  <div class="card-wrap">
    <div class="card" :class="{ flipped, revealed }">
      <div class="inner">
        <!-- 正面 -->
        <div class="face front">
          <span class="tick tl" /><span class="tick tr" /><span class="tick bl" /><span class="tick br" />
          <header>
            <span class="seat">{{ String(seat).padStart(2, '0') }}</span>
            <span class="camp" :class="meta().camp">
              <i />{{ meta().camp === 'good' ? '好人阵营' : '狼人阵营' }}
            </span>
          </header>

          <div class="sigil-box">
            <div class="halo" />
            <RoleSigil :role="role" :size="64" />
          </div>

          <h2 class="name">{{ meta().cn }}</h2>
          <p class="en">{{ meta().en }}</p>

          <div class="rule" />

          <p class="poem">「{{ meta().poem }}」</p>
          <p class="ability">{{ meta().ability }}</p>

          <footer>
            <span class="hold">按住 1.1 秒 · 松手收起</span>
          </footer>
        </div>

        <!-- 背面 -->
        <div class="face back">
          <span class="tick tl" /><span class="tick tr" /><span class="tick bl" /><span class="tick br" />
          <div class="moon">
            <span class="phase p1" /><span class="phase p2" /><span class="phase p3" />
          </div>
          <p class="back-cn">只属于你的夜</p>
          <p class="back-en">YOUR ROLE · SEALED</p>
          <p class="back-hint">按住查看</p>
        </div>
      </div>
    </div>
    <p class="below">长按卡片查看身份 · 松手自动收起</p>
  </div>
</template>

<style scoped>
.card-wrap {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  pointer-events: none;
}
.card {
  width: 320px;
  height: 452px;
  perspective: 1400px;
  pointer-events: auto;
}
.inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}
.flipped .inner {
  transform: rotateY(180deg);
}
.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 4px;
  padding: 22px 24px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(212, 178, 122, 0.14), transparent 62%),
    linear-gradient(168deg, #141b16 0%, #0a100d 58%, #0d1411 100%);
  border: 1px solid rgba(224, 210, 180, 0.22);
  box-shadow:
    0 40px 90px -30px rgba(0, 0, 0, 0.9),
    inset 0 1px 0 rgba(236, 226, 200, 0.08);
}
.face::after {
  content: '';
  position: absolute;
  inset: 7px;
  border: 1px solid rgba(224, 210, 180, 0.1);
  border-radius: 2px;
  pointer-events: none;
}
.back {
  transform: rotateY(180deg);
  justify-content: center;
  gap: 8px;
}
.tick {
  position: absolute;
  width: 9px;
  height: 9px;
  border: 1px solid rgba(224, 210, 180, 0.5);
  z-index: 2;
}
.tl { top: 13px; left: 13px; border-right: 0; border-bottom: 0; }
.tr { top: 13px; right: 13px; border-left: 0; border-bottom: 0; }
.bl { bottom: 13px; left: 13px; border-right: 0; border-top: 0; }
.br { bottom: 13px; right: 13px; border-left: 0; border-top: 0; }

header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.seat {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.22em;
  color: rgba(236, 230, 214, 0.5);
}
.camp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 0.16em;
  padding: 4px 9px;
  border: 1px solid rgba(224, 210, 180, 0.2);
  border-radius: 999px;
  color: rgba(236, 230, 214, 0.68);
}
.camp i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8fb0a0;
  box-shadow: 0 0 8px #8fb0a0;
}
.camp.wolf i {
  background: #c96a5a;
  box-shadow: 0 0 8px #c96a5a;
}

.sigil-box {
  position: relative;
  margin-top: 26px;
  width: 112px;
  height: 112px;
  display: grid;
  place-items: center;
  color: var(--gold, #d4b27a);
}
.halo {
  position: absolute;
  inset: -18px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212, 178, 122, 0.22), transparent 66%);
}
.sigil-box :deep(svg) {
  position: relative;
  filter: drop-shadow(0 0 14px rgba(212, 178, 122, 0.35));
}

.name {
  margin: 20px 0 0;
  font-family: var(--font-display);
  font-size: 42px;
  font-weight: 400;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: #f0e9d9;
}
.en {
  margin: 8px 0 0;
  font-size: 9px;
  letter-spacing: 0.34em;
  text-indent: 0.34em;
  color: rgba(212, 178, 122, 0.7);
}
.rule {
  width: 46px;
  height: 1px;
  margin: 18px 0 14px;
  background: linear-gradient(90deg, transparent, rgba(224, 210, 180, 0.45), transparent);
}
.poem {
  margin: 0;
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.9;
  letter-spacing: 0.06em;
  color: rgba(236, 230, 214, 0.62);
  text-align: center;
}
.ability {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.85;
  letter-spacing: 0.04em;
  color: rgba(236, 230, 214, 0.42);
  text-align: center;
  max-width: 230px;
}
footer {
  margin-top: auto;
  padding-top: 12px;
}
.hold {
  font-size: 9px;
  letter-spacing: 0.24em;
  color: rgba(212, 178, 122, 0.5);
}

.moon {
  display: flex;
  gap: 16px;
  margin-bottom: 26px;
  color: rgba(212, 178, 122, 0.55);
}
.phase {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid currentColor;
  position: relative;
  overflow: hidden;
}
.phase::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
}
.p1::after { transform: translateX(-52%); }
.p2::after { transform: translateX(0); opacity: 0.5; }
.p3::after { transform: translateX(52%); }
.back-cn {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: rgba(240, 233, 217, 0.9);
}
.back-en {
  margin: 6px 0 0;
  font-size: 9px;
  letter-spacing: 0.3em;
  color: rgba(212, 178, 122, 0.55);
}
.back-hint {
  margin: 40px 0 0;
  font-size: 10px;
  letter-spacing: 0.24em;
  color: rgba(236, 230, 214, 0.4);
}
.below {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgba(236, 230, 214, 0.45);
}
</style>
