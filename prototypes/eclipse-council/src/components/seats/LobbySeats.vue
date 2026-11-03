<script setup lang="ts">
/**
 * 开局前的席位环：九把椅子先摆好，玩家可以自己挑一把坐下。
 *
 * 和牌桌上用的是同一套几何（evenRingPoints / TableTop），
 * 所以入座时看到的位置，就是开局之后自己的位置，不会跳。
 */
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { PERSONA_IDS } from '@/data/names'
import type { Player, Role } from '@/game/types'
import { evenRingPoints } from '@/composables/useRing'
import TableTop from './TableTop.vue'
import PlayerSeat from './PlayerSeat.vue'

const game = useGameStore()
const settings = useSettingsStore()

const flow = computed(() => game.flow)
const ring = evenRingPoints(9)

interface LobbySeat {
  seat: number
  x: number
  y: number
  occupied: boolean
  isHuman: boolean
  isSelf: boolean
  player: Player | null
}

const seats = computed<LobbySeat[]>(() =>
  ring.map((point, index) => {
    const seat = index + 1
    const occupied = flow.value.occupied.includes(seat)
    const isHuman = flow.value.humans.includes(seat)
    const isSelf = flow.value.mySeat === seat
    const name = settings.names[seat]?.trim() || `席位 ${seat}`
    const player: Player | null = occupied
      ? {
          seat,
          name,
          role: 'villager' as Role,
          camp: 'good',
          alive: true,
          isHuman,
          persona: PERSONA_IDS[seat - 1] ?? 'ember',
          revealed: false,
        }
      : null
    return { seat, x: point.x, y: point.y, occupied, isHuman, isSelf, player }
  }),
)

const canMove = computed(() => flow.value.host && !flow.value.preparing)
const filled = computed(() => flow.value.occupied.length)
const emptyCount = computed(() => 9 - filled.value)

function move(seat: number): void {
  if (!canMove.value) return
  game.takeSeat(seat)
}
</script>

<template>
  <section class="lobby-seats" aria-label="席位与选座">
    <div class="ring">
      <div class="stage-glow" aria-hidden="true"></div>
      <TableTop />

      <div
        v-for="slot in seats"
        :key="slot.seat"
        class="slot"
        :style="{ '--x': slot.x, '--y': slot.y, '--delay': `${slot.seat * 45}ms` }"
      >
        <PlayerSeat
          v-if="slot.player"
          :player="slot.player"
          :is-self="slot.isSelf"
          :interactive="canMove && !slot.isSelf && !slot.isHuman"
          @select="move"
        />
        <button
          v-else
          class="empty"
          type="button"
          :disabled="!canMove"
          :aria-label="`坐在 ${slot.seat} 号空位`"
          @click="move(slot.seat)"
        >
          <span class="empty-avatar" aria-hidden="true"><i>＋</i></span>
          <span class="empty-meta">
            <b>{{ String(slot.seat).padStart(2, '0') }}</b>
            <span>空位</span>
          </span>
        </button>
      </div>

      <div class="hub">
        <p class="hub-count display">{{ filled }}<span>/ 9</span></p>
        <p class="hub-hint">{{ canMove ? '点空位，挑一把椅子' : '等待房主安排席位' }}</p>
        <p v-if="canMove && emptyCount" class="hub-sub">{{ emptyCount }} 个空位</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lobby-seats {
  width: 100%;
  display: grid;
  place-items: center;
}

.ring {
  --ring-size: min(44vw, 64vh, 640px);
  --seat-size: clamp(54px, calc(var(--ring-size) * 0.156), 96px);
  --seat-w: calc(var(--seat-size) + 22px);
  --depth: calc(var(--ring-size) * 0.56);
  --tw: calc(var(--ring-size) * 0.92);
  --th: calc(var(--tw) * 0.56);
  --rx: calc(var(--tw) / 2);
  --ry: calc(var(--th) / 2);
  position: relative;
  width: var(--ring-size);
  height: calc(var(--depth) + var(--seat-w) * 1.25);
  isolation: isolate;
}

.stage-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--ring-size) * 1.5);
  height: calc(var(--depth) * 2.2);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    var(--scene-glow, rgba(213, 177, 132, 0.3)) 0%,
    transparent 74%
  );
  opacity: 0.22;
  pointer-events: none;
  z-index: 0;
}

.slot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  transform: translate(calc(var(--x) * var(--rx)), calc(var(--y) * var(--ry)));
  z-index: 4;
  animation: slot-in 620ms var(--ease-out) both;
  animation-delay: var(--delay);
}

.slot :deep(.seat) {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
}

/* 可换座的席位：悬停时金属圈亮一档，别用虚线框把桌面弄乱 */
.slot :deep(.seat.is-interactive:hover .avatar) {
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55),
    0 0 0 2.5px rgba(232, 200, 152, 0.85),
    0 0 26px 2px rgba(226, 190, 130, 0.3),
    0 10px 22px -10px rgba(0, 0, 0, 0.9),
    inset 0 1px 0 rgba(255, 248, 226, 0.55);
}

/* 空位：虚线的空椅圈，和坐满的席位同一套尺寸，所以换座时位置不跳 */
.empty {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: var(--seat-w);
}

.empty-avatar {
  display: grid;
  place-items: center;
  width: var(--seat-size);
  height: var(--seat-size);
  border-radius: 50%;
  border: 1px dashed rgba(213, 177, 132, 0.26);
  background: rgba(10, 8, 7, 0.28);
  box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.5);
  transition: border-color 260ms var(--ease), background 260ms var(--ease),
    box-shadow 260ms var(--ease);
}

.empty-avatar i {
  font-style: normal;
  font-size: calc(var(--seat-size) * 0.26);
  line-height: 1;
  color: rgba(213, 177, 132, 0.42);
  transition: color 260ms var(--ease), transform 260ms var(--ease);
}

.empty:not(:disabled):hover .empty-avatar {
  border-color: rgba(232, 200, 152, 0.62);
  background: rgba(226, 190, 130, 0.08);
  box-shadow:
    inset 0 0 22px rgba(0, 0, 0, 0.4),
    0 0 24px rgba(226, 190, 130, 0.16);
}

.empty:not(:disabled):hover .empty-avatar i {
  color: rgba(246, 226, 186, 0.95);
  transform: scale(1.08);
}

.empty:disabled {
  opacity: 0.55;
}

.empty-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(182, 175, 162, 0.72);
}

.empty-meta b {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(246, 226, 186, 0.8);
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid rgba(213, 177, 132, 0.22);
}

.hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--rx) * 1.5);
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  text-align: center;
  pointer-events: none;
  z-index: 3;
}

.hub-count {
  font-size: clamp(20px, 2.4vw, 30px);
  letter-spacing: 0.08em;
  color: rgba(246, 226, 186, 0.92);
  font-variant-numeric: tabular-nums;
}

.hub-count span {
  font-size: 0.55em;
  color: var(--ink-3);
  margin-left: 4px;
}

.hub-hint {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: rgba(231, 203, 161, 0.6);
}

.hub-sub {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ink-3);
}

@media (max-width: 900px) {
  .ring {
    --ring-size: min(86vw, 54vh, 460px);
    --seat-size: clamp(46px, calc(var(--ring-size) * 0.17), 68px);
    --seat-w: calc(var(--seat-size) + 16px);
  }
  .hub-count {
    font-size: 20px;
  }
}
</style>
