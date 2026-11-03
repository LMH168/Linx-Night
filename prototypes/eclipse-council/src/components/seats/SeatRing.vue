<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { nightActors } from '@/game/engine'
import { roleVisibleTo } from '@/game/selectors'
import { seatPick, pickSeat } from '@/composables/useSeatPick'
import { evenRingPoints } from '@/composables/useRing'
import TableTop from './TableTop.vue'
import PlayerSeat from './PlayerSeat.vue'

const game = useGameStore()

const state = computed(() => game.state)
const players = computed(() => state.value?.players ?? [])
const viewer = computed(() => game.viewerSeat)

const actors = computed(() => (state.value ? nightActors(state.value) : []))

const seats = computed(() => {
  const ring = evenRingPoints(Math.max(1, players.value.length))
  return players.value.map((player, index) => {
    const s = state.value
    const pos = ring[index] ?? { x: 0, y: -1 }
    const actor = actors.value.includes(player.seat) && (s?.scene !== 'night' || player.seat === viewer.value)
    const speaker = !!s && s.scene === 'day' && s.day.current === player.seat
    return {
      player,
      index,
      x: pos.x,
      y: pos.y,
      roleVisible: s ? (s.scene === 'result' || game.flow.identityOpen) && roleVisibleTo(s, player.seat, viewer.value) : false,
      isSelf: viewer.value === player.seat,
      isTeammate: (() => {
        if (!s || viewer.value == null || !game.flow.identityOpen) return false
        const me = s.players.find((p) => p.seat === viewer.value)
        return (
          me?.role === 'wolf' && player.role === 'wolf' && player.seat !== viewer.value
        )
      })(),
      isActor: actor,
      isSpeaker: speaker,
      isThinking: s?.scene !== 'night' && game.ui.thinking.includes(player.seat),
      interactive: seatPick.active && seatPick.candidates.includes(player.seat),
      isCandidate: seatPick.active && seatPick.candidates.includes(player.seat),
      isSelected: seatPick.selected === player.seat,
      dim: false,
      votes: s?.vote.tally[player.seat] ?? 0,
    }
  })
})

function onSelect(seat: number): void {
  pickSeat(seat)
}

function onHover(seat: number | null): void {
  game.ui.hovered = seat
}
</script>

<template>
  <div
    class="ring"
    role="group"
    aria-label="九人席位"
    :class="{ 'is-picking': seatPick.active }"
  >
    <div class="stage-glow" aria-hidden="true"></div>
    <TableTop />
    <div
      v-for="seat in seats"
      :key="seat.player.seat"
      class="slot"
      :style="{ '--x': seat.x, '--y': seat.y, '--s': 1 + 0.09 * Number(seat.y), '--delay': `${seat.index * 60}ms` }"
    >
      <PlayerSeat
        :player="seat.player"
        :role-visible="seat.roleVisible"
        :is-self="seat.isSelf"
        :is-teammate="seat.isTeammate"
        :is-actor="seat.isActor"
        :is-speaker="seat.isSpeaker"
        :is-thinking="seat.isThinking"
        :interactive="seat.interactive"
        :is-candidate="seat.isCandidate"
        :is-selected="seat.isSelected"
        :dim="seat.dim"
        :votes="seat.votes"
        @select="onSelect"
        @hover="onHover"
      />
    </div>

    <div class="hub">
      <slot name="hub" />
    </div>
  </div>
</template>

<style scoped>
.ring {
  --ring-size: min(56vw, 64vh, 700px);
  /* 席位尺寸跟着桌子走：桌面变大时头像一起变大，不会出现"大桌上摆小圆片" */
  --seat-size: clamp(56px, calc(var(--ring-size) * 0.156), 104px);
  --seat-w: calc(var(--seat-size) + 22px);
  --depth: calc(var(--ring-size) * 0.56);
  /* 桌面：放大到席位环的 0.92，席位圆心正好落在桌沿上 */
  --tw: calc(var(--ring-size) * 0.92);
  --th: calc(var(--tw) * 0.56);
  --rx: calc(var(--tw) / 2);
  --ry: calc(var(--th) / 2);
  position: relative;
  width: var(--ring-size);
  height: calc(var(--depth) + var(--seat-w) * 1.2);
  flex: 0 0 auto;
  isolation: isolate;
}

.slot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  transform: translate(calc(var(--x) * var(--rx)), calc(var(--y) * var(--ry))) scale(var(--s, 1));
  transform-origin: 50% 50%;
  z-index: 4;
  animation: slot-in 700ms var(--ease-out) both;
  animation-delay: var(--delay);
}

/* 以席位点为圆心：translate 在 transform 之前生效，不影响 hover / 选中位移 */
.slot :deep(.seat) {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
}
/* 桌子背后的一层舞台辉光：随光时变色，把桌面从夜色里托出来 */
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
  opacity: 0.18;
  pointer-events: none;
  z-index: 0;
  transition: opacity 600ms var(--ease);
}

.ring.is-picking .stage-glow {
  opacity: 0.3;
}

.hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--rx) * 1.34);
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  text-align: center;
  pointer-events: none;
  z-index: 3;
}

@media (max-width: 1100px) {
  .ring {
    --ring-size: min(78vw, 56vh, 560px);
    --seat-size: clamp(50px, calc(var(--ring-size) * 0.156), 88px);
    --seat-w: calc(var(--seat-size) + 18px);
    --tw: calc(var(--ring-size) * 0.93);
    --th: calc(var(--tw) * 0.56);
    --rx: calc(var(--tw) / 2);
    --ry: calc(var(--th) / 2);
  }
}

@media (max-width: 900px) {
  .ring {
    --ring-size: min(88vw, 52vh, 440px);
    --seat-size: clamp(44px, calc(var(--ring-size) * 0.17), 68px);
    --seat-w: calc(var(--seat-size) + 14px);
    --tw: calc(var(--ring-size) * 0.86);
    --th: calc(var(--tw) * 0.56);
    --rx: calc(var(--tw) / 2);
    --ry: calc(var(--th) / 2);
    margin: 26px 0;
  }
  .hub {
    width: calc(var(--rx) * 1.6);
  }
}
</style>
