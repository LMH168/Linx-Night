<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { ROLES } from '@/game/roles'
import RoleSilhouette from '@/components/seats/RoleSilhouette.vue'

const game = useGameStore()

const seat = computed(() => game.request?.seat ?? 0)
const player = computed(() => game.state?.players.find((p) => p.seat === seat.value) ?? null)
const role = computed(() => (player.value ? ROLES[player.value.role] : null))
const shown = computed(() => game.request?.kind === 'deal-ack' && role.value != null)

function ack(): void {
  game.respond(true)
}
</script>

<template>
  <Transition name="deal">
    <div v-if="shown && role" class="veil">
      <div class="wrap">
        <p class="eyebrow">第 {{ seat }} 号 · 暗牌</p>
        <article class="card" role="dialog" aria-modal="true" aria-label="你的身份牌" :style="{ '--accent': role.accent }">
          <div class="face">
            <div class="portrait">
              <RoleSilhouette :role="role.role" :tint="[role.accent, role.accent2]" />
            </div>
            <p class="camp">{{ role.camp === 'wolf' ? '狼人阵营' : '好人阵营' }}</p>
            <h1 class="name display">{{ role.name }}</h1>
            <p class="tag">{{ role.tag }}</p>
            <p class="motto display">「{{ role.motto }}」</p>
            <p class="ability">{{ role.ability }}</p>
            <span class="seal">{{ player?.seat }}</span>
          </div>
        </article>
        <button class="primary" type="button" @click="ack">记住了 · 收起身份牌</button>
        <p class="tip">确认后收起身份，可在“我的身份”中私密查看。</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: grid;
  place-items: center;
  padding: 20px;
  background: radial-gradient(80% 70% at 50% 40%, rgba(4, 7, 12, 0.6), rgba(2, 4, 8, 0.9));
}

.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.card {
  position: relative;
  width: min(300px, 78vw);
  padding: 22px 22px 26px;
  border-radius: 18px;
  border: 1px solid rgba(213, 177, 132, 0.34);
  background: linear-gradient(170deg, rgba(24, 22, 20, 0.98), rgba(8, 9, 12, 0.99));
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transform-style: preserve-3d;
  animation: flip-in 720ms var(--ease-out) both;
}

.card::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 12px;
  border: 1px solid rgba(213, 177, 132, 0.12);
  pointer-events: none;
}

@keyframes flip-in {
  0% {
    transform: perspective(900px) rotateY(-78deg) scale(0.94);
    opacity: 0;
  }
  100% {
    transform: perspective(900px) rotateY(0deg) scale(1);
    opacity: 1;
  }
}

.portrait {
  width: 128px;
  height: 128px;
  margin: 0 auto 14px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(213, 177, 132, 0.28), 0 0 44px color-mix(in srgb, var(--accent) 40%, transparent);
}

.camp {
  font-size: 9.5px;
  letter-spacing: 0.32em;
  color: color-mix(in srgb, var(--accent) 78%, white);
}

.name {
  margin-top: 4px;
  font-size: 34px;
  letter-spacing: 0.2em;
  color: #f2e9d9;
}

.tag {
  font-size: 10px;
  letter-spacing: 0.4em;
  color: var(--ink-3);
  margin-top: 2px;
}

.motto {
  margin-top: 14px;
  font-size: 12.5px;
  letter-spacing: 0.1em;
  color: var(--ink-2);
}

.ability {
  margin-top: 12px;
  font-size: 11.5px;
  line-height: 1.85;
  color: var(--ink-3);
  padding-top: 12px;
  border-top: 1px solid rgba(213, 177, 132, 0.12);
}

.seal {
  position: absolute;
  right: 14px;
  bottom: 14px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: rgba(213, 177, 132, 0.6);
  border: 1px solid rgba(213, 177, 132, 0.28);
  border-radius: 50%;
  font-variant-numeric: tabular-nums;
}

.primary {
  padding: 11px 28px;
  border-radius: 999px;
  font-size: 12.5px;
  letter-spacing: 0.14em;
  color: #1a1206;
  background: linear-gradient(180deg, #f0d6ac, #c9a169);
  box-shadow: 0 14px 36px rgba(201, 161, 105, 0.28);
}

.tip {
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
}

.deal-enter-active,
.deal-leave-active {
  transition: opacity 320ms var(--ease);
}

.deal-enter-from,
.deal-leave-to {
  opacity: 0;
}
</style>
