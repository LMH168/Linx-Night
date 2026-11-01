<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { nightActors } from '@/game/engine'
import { roleVisibleTo } from '@/game/selectors'
import { seatPick, pickSeat } from '@/composables/useSeatPick'
import PlayerSeat from './PlayerSeat.vue'

const game = useGameStore()

const state = computed(() => game.state)
const players = computed(() => state.value?.players ?? [])
const viewer = computed(() => game.viewerSeat)

const actors = computed(() => (state.value ? nightActors(state.value) : []))

/**
 * 桌面椭圆的短轴 / 长轴比，和 CSS 里 --th: var(--tw)*0.56 保持一致。
 * 席位按「等弧长」而不是「等角度」铺开：等角度会在长轴两端挤成一堆，
 * 等弧长才是肉眼看上去的平均分散。
 */
const RING_RATIO = 0.56

function evenRingPoints(n: number): { x: number; y: number }[] {
  const M = 960
  const px: number[] = []
  const py: number[] = []
  for (let i = 0; i <= M; i++) {
    const t = (i / M) * Math.PI * 2
    px.push(Math.sin(t))
    py.push(-Math.cos(t) * RING_RATIO)
  }
  const cum: number[] = [0]
  for (let i = 1; i <= M; i++) {
    cum.push(cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]))
  }
  const total = cum[M]
  const out: { x: number; y: number }[] = []
  let k = 0
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total
    while (k < M - 1 && cum[k + 1] < target) k++
    const seg = Math.max(1e-9, cum[k + 1] - cum[k])
    const t = ((k + (target - cum[k]) / seg) / M) * Math.PI * 2
    out.push({ x: Number(Math.sin(t).toFixed(4)), y: Number((-Math.cos(t)).toFixed(4)) })
  }
  return out
}

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
    <div class="table" aria-hidden="true">
      <span class="rim"></span>
      <span class="top"></span>
      <span class="sheen"></span>
    </div>
    <div class="ring-line" aria-hidden="true"></div>
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
  --seat-size: clamp(58px, 6.4vmin, 96px);
  --seat-w: calc(var(--seat-size) + 26px);
  --ring-size: min(56vw, 62vh, 660px);
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

/* 桌子背后的舞台辉光：把桌面从夜色里托出来 */
.stage-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--ring-size) * 1.42);
  height: calc(var(--depth) * 2.1);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    var(--scene-glow, rgba(213, 177, 132, 0.3)) 0%,
    transparent 72%
  );
  opacity: 0.22;
  pointer-events: none;
  z-index: 0;
}

/* ---- 立体舞台：桌面 + 厚度 + 投影 ---- */
.table {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--tw);
  height: var(--th);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 22px 26px rgba(0, 0, 0, 0.72)) drop-shadow(0 6px 10px rgba(0, 0, 0, 0.58));
  z-index: 1;
}

.rim {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transform: translateY(15px);
  background: radial-gradient(
    ellipse closest-side at 50% 50%,
    #120b07 0%,
    #170e08 88%,
    #74512f 92.5%,
    #a2743f 96%,
    #2a1a10 100%
  );
}

.top {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    repeating-radial-gradient(circle at 50% 47%, rgba(240, 200, 150, 0.055) 0 1px, transparent 1px 8px),
    radial-gradient(38% 34% at 50% 44%, rgba(255, 198, 122, 0.22), transparent 68%),
    radial-gradient(50% 44% at 40% 40%, rgba(255, 214, 168, 0.13), transparent 68%),
    radial-gradient(58% 52% at 76% 82%, rgba(0, 0, 0, 0.46), transparent 66%),
    linear-gradient(160deg, #573c26 0%, #45301e 38%, #312114 72%, #1f1409 100%);
  box-shadow:
    inset 0 2px 8px rgba(255, 232, 200, 0.16),
    inset 0 -18px 30px rgba(0, 0, 0, 0.34),
    inset 0 -2px 0 rgba(255, 208, 160, 0.22),
    0 0 0 1px rgba(219, 180, 132, 0.2);
}

.sheen {
  position: absolute;
  left: 12%;
  right: 12%;
  top: 8%;
  height: 40%;
  border-radius: 50%;
  background: radial-gradient(44% 58% at 42% 30%, rgba(255, 240, 216, 0.09), transparent 72%);
  pointer-events: none;
}

/* 桌面上的刻度环（原内圈虚线） */
.ring-line {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--tw) * 0.74);
  height: calc(var(--th) * 0.74);
  border-radius: 50%;
  border: 1px dashed rgba(213, 177, 132, 0.16);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
}

.ring-line::after {
  content: '';
  position: absolute;
  inset: 16% 12%;
  border-radius: 50%;
  border: 1px solid rgba(213, 177, 132, 0.07);
}

.ring.is-picking .ring-line {
  border-color: rgba(226, 190, 130, 0.26);
  transition: border-color 420ms var(--ease);
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
    --seat-size: clamp(52px, 8.6vmin, 82px);
    --tw: calc(var(--ring-size) * 0.93);
    --th: calc(var(--tw) * 0.56);
    --rx: calc(var(--tw) / 2);
    --ry: calc(var(--th) / 2);
  }
}

@media (max-width: 900px) {
  .ring {
    --ring-size: min(88vw, 42vh, 420px);
    --seat-size: clamp(46px, 13vw, 64px);
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
