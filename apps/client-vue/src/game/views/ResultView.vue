<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import { ROLE_CATALOG, type GameRole } from '../types';
import BrandMark from '../components/BrandMark.vue';

const store = useGameStore();
const router = useRouter();
const copied = ref(false);
const report = computed(() => store.settlement || store.publicState?.settlement as Record<string, any> | null);
const winnerLabel = computed(() => report.value?.winner === 'werewolf' ? '狼人阵营' : report.value?.winner === 'good' ? '好人阵营' : '本局已结束');
const cards = computed(() => store.revealedSeats.map(seat => {
  const meta = ROLE_CATALOG[seat.role as GameRole] || ROLE_CATALOG.villager;
  return { ...seat, meta, cardClass: meta.camp === 'wolf' ? 'wolf' : meta.camp === 'good' ? 'god' : 'village' };
}));
const rows = computed(() => {
  const eliminations = Array.isArray(report.value?.eliminations) ? report.value.eliminations : [];
  return eliminations.map((item: any, index: number) => ({ round: '记录 ' + (index + 1), text: item.seatId + ' 出局', note: item.cause || '结算', tone: 'dusk' }));
});
onMounted(() => { if (!store.settlement) void store.loadSettlement().catch(() => undefined); });
function lobby() { router.push('/lobby'); }
async function copyRecord() {
  const text = '暮林山舍 · ' + store.roomId + '\\n' + winnerLabel.value + '\\n' + rows.value.map(row => row.text).join(' / ');
  try { await navigator.clipboard?.writeText(text); } catch { /* clipboard is optional */ }
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1800);
}
</script>

<template>
  <div class="game-ui desktop settlement result-screen">
    <div class="grain"></div><div class="vignette"></div><div class="frame-line"></div>
    <header class="topbar"><BrandMark /><div class="top-meta"><span class="meta-item room"><span class="micro">ROOM</span><b>{{ store.roomId }}</b></span><span class="meta-divider"></span><span class="meta-item phase"><span class="status-dot"></span><span>本局结束</span></span><span class="meta-divider"></span><span class="meta-item connect">服务端结算</span></div></header>
    <section class="result-head"><p class="eyebrow">GAME OVER · 结算</p><h1>{{ winnerLabel }}<span>结束</span></h1><p class="result-sub">身份和行动记录来自服务端结算报告。</p><div class="result-stats"><span><b>{{ cards.filter(card => card.cardClass === 'wolf').length }}</b> 狼人</span><i></i><span><b>{{ cards.filter(card => !card.alive).length }}</b> 人出局</span><i></i><span><b>{{ cards.filter(card => card.alive).length }}</b> 人存活</span></div></section>
    <aside class="timeline panel"><div class="timeline-head"><span class="eyebrow">PUBLIC RECORD · 公共记录</span><span class="tl-count">{{ rows.length }} 条</span></div><div v-for="row in rows" :key="row.round + row.text" class="tl-row" :class="row.tone"><span class="tl-round">{{ row.round }}</span><span class="tl-text">{{ row.text }}</span><span class="tl-note">{{ row.note }}</span></div><p v-if="!rows.length" class="muted">暂无出局记录。</p></aside>
    <aside class="result-actions"><button class="btn gold" type="button" @click="lobby">返回大厅</button><button class="text-btn" type="button" @click="copyRecord">{{ copied ? '已复制战绩' : '复制本局战绩' }}</button><p class="room-note">ROOM {{ store.roomId }}</p></aside>
    <div class="role-reveal-label"><span class="rule"></span><span class="eyebrow">ROLE REVEAL · 身份公开</span><span class="rule"></span></div>
    <section class="role-cards"><article v-for="card in cards" :key="card.id" class="role-card" :class="[card.cardClass, { out: !card.alive }]"><div class="rc-art"><img :src="card.meta.avatar" :alt="card.meta.name" /><div class="rc-shade"></div><span class="rc-seat">{{ card.id }}</span><span v-if="!card.alive" class="rc-out">出局</span></div><div class="rc-body"><span class="rc-name">{{ card.meta.name }}</span><span class="rc-player">{{ card.name }}</span></div></article></section>
    <div class="corner-note">WALDHÜTTE · SERVER SETTLEMENT</div>
  </div>
</template>
