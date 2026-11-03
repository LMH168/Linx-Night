<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { gameRecords, type RecordSource } from '../game/records';

const props = defineProps<{ source: RecordSource; seatName: (id: string) => string; finished?: boolean }>();
const open = ref(Boolean(props.finished));
const tab = ref('speeches');
const selectedDay = ref(props.source.round);
const records = computed(() => gameRecords(props.source, props.seatName));
// Follow the current day until the reader chooses an earlier day.
watch(() => props.source.round, (day, previous) => {
  if (selectedDay.value === previous) selectedDay.value = day;
});
const speeches = computed(() => records.value.speeches.filter(s => s.round === selectedDay.value));
const votes = computed(() => props.source.voteResolutions.filter(v => v.round === selectedDay.value));
const timeline = computed(() => records.value.timeline.filter(e => e.round === selectedDay.value));
</script>

<template>
  <section class="game-records" :class="{ 'is-open': open, 'is-finished': finished }" aria-label="对局记录">
    <button class="records-toggle" :aria-expanded="open" @click="open = !open">
      <span>对局记录 <small>第 {{ source.round + 1 }} 天</small></span><span>{{ open ? '收起 ↓' : '查看 ↑' }}</span>
    </button>
    <div v-if="open" class="records-panel">
      <nav class="record-days" aria-label="选择对局天数">
        <button v-for="day in records.days" :key="day" :aria-pressed="selectedDay === day" @click="selectedDay = day">第 {{ day + 1 }} 天</button>
      </nav>
      <nav class="record-tabs" aria-label="记录分类">
        <button v-for="item in [{ id: 'speeches', label: '公开发言' }, { id: 'votes', label: '投票结果' }, { id: 'timeline', label: '大事记' }]" :key="item.id" :aria-pressed="tab === item.id" @click="tab = item.id">{{ item.label }}</button>
      </nav>
      <div class="record-content" :key="`${selectedDay}-${tab}`">
        <template v-if="tab === 'speeches'">
          <article v-for="speech in speeches" :key="speech.id" class="record-card">
            <header><strong>{{ seatName(speech.seatId) }}</strong><span class="record-badge">{{ speech.label }}</span></header>
            <template v-if="speech.text.length > 160">
              <p>{{ speech.text.slice(0, 160) }}…</p>
              <details><summary>展开全文</summary><p>{{ speech.text }}</p></details>
            </template>
            <p v-else>{{ speech.text || '本条发言暂无文字记录' }}</p>
          </article>
          <p v-if="!speeches.length" class="records-empty">本日暂无公开发言</p>
        </template>
        <template v-else-if="tab === 'votes'">
          <article v-for="vote in votes" :key="vote.resolutionId" class="record-card">
            <header><strong>{{ vote.pk ? 'PK 重投' : '首轮投票' }}</strong><span class="record-badge">已结算 · {{ vote.totalVotes }} 票</span></header>
            <ul class="vote-totals"><li v-for="entry in vote.entries" :key="entry.seatId"><span>{{ seatName(entry.seatId) }}</span><strong>{{ entry.votes }} 票</strong></li></ul>
            <p class="vote-outcome">{{ vote.eliminatedSeatId ? `结果：${seatName(vote.eliminatedSeatId)} 被放逐` : vote.pk ? '结果：平票，无人出局' : `结果：${vote.leaders.map(seatName).join('、')} 进入 PK` }}</p>
          </article>
          <p v-if="!votes.length" class="records-empty">{{ finished || selectedDay < source.round ? '本日无已结算投票' : '本日投票尚未结束' }}</p>
        </template>
        <template v-else>
          <ol class="record-timeline"><li v-for="event in timeline" :key="event.id">{{ event.text }}</li></ol>
          <p v-if="!timeline.length" class="records-empty">本日暂无大事记</p>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.game-records { margin: 0 28px 15px; flex-shrink: 0; border: 1px solid var(--line); border-radius: 12px; background: #0b111c; color: var(--ink-2); font-size: 13px; text-align: left; }
.records-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; border: 0; background: transparent; color: var(--gold-text); padding: 13px 18px; }
.records-toggle small { margin-left: 12px; color: var(--ink-3); }
.is-open:not(.is-finished) { position: fixed; bottom: 0; right: 0; left: 0; max-width: 960px; margin: 0 auto; z-index: 8; box-shadow: 0 -12px 60px #0009; }
.records-panel { display: flex; flex-direction: column; max-height: 50dvh; min-height: 0; }
.record-days, .record-tabs { display: flex; gap: 8px; padding: 8px 18px; flex-shrink: 0; }
.record-days { overflow-x: auto; border-top: 1px solid var(--line); }
.record-days button { white-space: nowrap; }
.record-tabs { border-bottom: 1px solid var(--line); }
button[aria-pressed="true"] { background: #b4944d26; border-color: var(--gold-text); color: var(--gold-text); }
.record-content { overflow-y: auto; overscroll-behavior: contain; padding: 14px 18px; min-height: 120px; overflow-wrap: anywhere; }
.record-card { border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-bottom: 12px; }
.record-card header { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.record-card p { white-space: pre-wrap; line-height: 1.8; margin: 10px 0 0; }
.record-badge { font-size: 11px; color: var(--ink-3); }
.record-card summary { color: var(--gold-text); cursor: pointer; margin-top: 8px; }
.vote-totals { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; }
.vote-totals li { display: flex; justify-content: space-between; gap: 12px; }
.vote-outcome { color: var(--gold-text); border-top: 1px solid var(--line); padding-top: 10px; }
.record-timeline { padding-left: 22px; margin: 0; }
.record-timeline li { padding: 10px 0 10px 8px; line-height: 1.7; }
.record-timeline li::marker { color: var(--gold-text); }
.records-empty { text-align: center; color: var(--ink-3); padding: 24px 0; }
.is-finished { margin: 24px 0; }
@media (max-width: 600px) { .game-records { margin: 0 12px 12px; } .is-open:not(.is-finished) { margin: 0; border-radius: 16px 16px 0 0; } .record-tabs button { flex: 1; } .vote-totals { grid-template-columns: 1fr; } .record-content { padding-bottom: max(16px, env(safe-area-inset-bottom)); } }
</style>
