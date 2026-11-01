<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { playerAt } from '@/game/selectors'
import { voteProgress } from '@/game/engine'
import GlassPanel from '@/components/panels/GlassPanel.vue'

const game = useGameStore()
const state = computed(() => game.state)

const isPk = computed(() => state.value?.scene === 'pk' || state.value?.vote.round === 2)
const round = computed(() => state.value?.round ?? 1)
const voteRound = computed(() => state.value?.vote.round ?? 1)

const progress = computed(() => {
  if (!state.value) return { voted: [], waiting: [] }
  return voteProgress(state.value)
})

const totalVoters = computed(() => progress.value.voted.length + progress.value.waiting.length)

const rows = computed(() => {
  const s = state.value
  if (!s) return []
  const entries = Object.entries(s.vote.tally)
    .map(([seat, count]) => ({ seat: Number(seat), count: Number(count) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.seat - b.seat)
  const max = Math.max(1, ...entries.map((entry) => entry.count))
  return entries.map((entry) => ({
    ...entry,
    name: playerAt(s, entry.seat)?.name ?? '',
    pct: Math.round((entry.count / max) * 100),
  }))
})

const pk = computed(() => state.value?.vote.pk ?? [])

const me = computed(() => {
  const seat = game.viewerSeat
  if (seat == null) return null
  return state.value?.players.find((p) => p.seat === seat) ?? null
})

const myBallot = computed(() => {
  const s = state.value
  if (!s || !me.value) return null
  return s.vote.ballots[me.value.seat] ?? null
})

const verdict = computed(() => {
  const s = state.value
  if (!s || s.vote.phase === 'collect') return null
  if (s.vote.none) return { kind: 'none' as const, text: '无人出局' }
  if (s.vote.out != null) {
    return {
      kind: 'out' as const,
      text: `${s.vote.out} 号出局`,
      name: playerAt(s, s.vote.out)?.name ?? '',
    }
  }
  return null
})
</script>

<template>
  <GlassPanel :eyebrow="isPk ? '平票对决' : '黄昏'" :title="isPk ? 'PK 发言与再投票' : '放逐投票'">
    <template #actions>
      <span class="round">
        第 {{ round }} 日 · {{ voteRound === 2 ? '二次' : '首次' }}
      </span>
    </template>

    <div v-if="pk.length && isPk" class="pk">
      <p class="pk-label">平票席位</p>
      <div class="pk-seats">
        <span v-for="seat in pk" :key="seat" class="pk-seat">
          {{ seat }}
        </span>
      </div>
      <p class="pk-hint">平票者各作一轮 PK 发言，随后仅台下存活玩家投给 PK 候选人。</p>
    </div>

    <div class="meter">
      <div class="meter-head">
        <span class="m-label">投票进度</span>
        <span class="m-count">{{ progress.voted.length }} / {{ totalVoters }}</span>
      </div>
      <div class="rail">
        <div
          class="fill"
          :style="{ width: `${totalVoters ? (progress.voted.length / totalVoters) * 100 : 0}%` }"
        ></div>
      </div>
      <p class="m-hint">
        <template v-if="myBallot === null">你还没有投出这一票。</template>
        <template v-else-if="myBallot == null">你选择了弃票。</template>
        <template v-else>你把票投给了 {{ myBallot }} 号。</template>
      </p>
    </div>

    <div v-if="rows.length" class="tally">
      <p class="t-label">当前票型</p>
      <ul>
        <li v-for="row in rows" :key="row.seat" class="t-row">
          <span class="t-seat">{{ row.seat }}</span>
          <div class="t-bar">
            <div class="t-fill" :style="{ width: `${row.pct}%` }"></div>
            <span class="t-name">{{ row.name }}</span>
          </div>
          <span class="t-count">{{ row.count }}</span>
        </li>
      </ul>
    </div>

    <div v-else class="quiet">
      <span class="quiet-mark">✕</span>
      <p>票数将在唱票时逐张公开。</p>
    </div>

    <div v-if="verdict" class="verdict" :class="verdict.kind">
      <p class="v-text display">{{ verdict.text }}</p>
      <p v-if="verdict.name" class="v-name">{{ verdict.name }}</p>
    </div>
  </GlassPanel>
</template>

<style scoped>
.round {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--gold-text);
}

.pk {
  padding: 12px;
  border-radius: 11px;
  border: 1px solid rgba(226, 190, 130, 0.24);
  background: rgba(226, 190, 130, 0.05);
}

.pk-label {
  font-size: 9.5px;
  letter-spacing: 0.22em;
  color: var(--ink-3);
}

.pk-seats {
  display: flex;
  gap: 6px;
  margin: 7px 0;
}

.pk-seat {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 12.5px;
  color: #1a1206;
  background: linear-gradient(180deg, #ecd0a4, #c9a169);
  font-variant-numeric: tabular-nums;
}

.pk-hint {
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-3);
}

.meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 7px;
}

.m-label,
.t-label {
  font-size: 9.5px;
  letter-spacing: 0.22em;
  color: var(--ink-3);
}

.m-count {
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.rail {
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(213, 177, 132, 0.4), #efd3a6);
  transition: width 520ms var(--ease);
}

.m-hint {
  margin-top: 7px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.tally ul {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 8px;
}

.t-row {
  display: grid;
  grid-template-columns: 20px 1fr 22px;
  align-items: center;
  gap: 9px;
}

.t-seat {
  font-size: 11.5px;
  color: var(--gold-text);
  font-variant-numeric: tabular-nums;
}

.t-bar {
  position: relative;
  height: 24px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.035);
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.t-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, rgba(226, 190, 130, 0.28), rgba(226, 190, 130, 0.1));
  transition: width 620ms var(--ease);
}

.t-name {
  position: relative;
  font-size: 11px;
  color: var(--ink-2);
}

.t-count {
  font-size: 12px;
  color: var(--ink);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.quiet {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-radius: 11px;
  border: 1px dashed rgba(213, 177, 132, 0.16);
  font-size: 11.5px;
  color: var(--ink-3);
}

.quiet-mark {
  opacity: 0.5;
}

.verdict {
  margin-top: auto;
  padding: 12px;
  border-radius: 11px;
  text-align: center;
  border: 1px solid rgba(194, 90, 78, 0.3);
  background: rgba(194, 90, 78, 0.08);
  animation: pop-in 420ms var(--ease-out) both;
}

.verdict.none {
  border-color: rgba(213, 177, 132, 0.2);
  background: rgba(213, 177, 132, 0.05);
}

.v-text {
  font-size: 15px;
  letter-spacing: 0.12em;
  color: #e2b3ab;
}

.verdict.none .v-text {
  color: var(--ink-2);
}

.v-name {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.1em;
}
</style>
