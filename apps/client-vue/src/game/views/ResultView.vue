<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import { ROLE_CATALOG } from '../types';
import BrandMark from '../components/BrandMark.vue';

const store = useGameStore();
const router = useRouter();
const rows = [
  { round: '首夜', text: 'P4 · 棠 出局', note: '村民', tone: 'dusk' },
  { round: '第一日', text: 'P9 · 溪 被放逐', note: '狼人', tone: 'gold' },
  { round: '第二夜', text: 'P2 · 砚 出局', note: '女巫毒', tone: 'pale' },
  { round: '第二日', text: 'P6 · 鸦 被放逐', note: '好人胜利', tone: 'win' },
];
const copied = ref(false);
const cards = computed(() => store.revealedSeats.map(seat => {
  const meta = ROLE_CATALOG[seat.role];
  return { ...seat, meta, cardClass: meta.camp === 'wolf' ? 'wolf' : seat.role === 'villager' ? 'village' : 'god' };
}));
function again() { store.reset(); router.push(`/room/${store.roomId}`); }
function lobby() { store.reset(); router.push('/lobby'); }
async function copyRecord() {
  const text = `暮林山舍 · ${store.roomId}\n好人阵营胜利 · 3 狼人出局 · 5 人存活\nP4 首夜出局 / P9 第一日放逐 / P2 第二夜毒发 / P6 第二日放逐`;
  try { await navigator.clipboard?.writeText(text); } catch { /* clipboard is optional */ }
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1800);
}
</script>

<template>
  <div class="game-ui desktop settlement result-screen">
    <div class="grain"></div><div class="vignette"></div><div class="frame-line"></div>
    <header class="topbar">
      <BrandMark />
      <div class="top-meta"><span class="meta-item room"><span class="micro">ROOM</span><b>{{ store.roomId }}</b></span><span class="meta-divider"></span><span class="meta-item phase"><span class="status-dot"></span><span>本局结束 · 第二天</span></span><span class="meta-divider"></span><span class="meta-item connect">已连接</span></div>
    </header>
    <section class="result-head">
      <p class="eyebrow">DAWN BREAKS · 第二天</p>
      <h1>好人阵营<span>胜利</span></h1>
      <p class="result-sub">三只狼全部出局。山舍的灯，亮到了天亮。</p>
      <div class="result-stats"><span><b>3</b>狼人出局</span><i></i><span><b>1</b>好人牺牲</span><i></i><span><b>2</b>天 · 2 夜</span><i></i><span><b>5</b>人存活</span></div>
    </section>
    <aside class="timeline panel">
      <div class="timeline-head"><span class="eyebrow">RECORD OF THE NIGHT</span><span class="tl-count">{{ rows.length }} 条</span></div>
      <div v-for="row in rows" :key="row.round" class="tl-row" :class="row.tone"><span class="tl-round">{{ row.round }}</span><span class="tl-text">{{ row.text }}</span><span class="tl-note">{{ row.note }}</span></div>
    </aside>
    <aside class="result-actions">
      <button class="btn gold" type="button" @click="again">再来一局</button>
      <button class="btn ghost" type="button" @click="lobby">返回大厅</button>
      <button class="text-btn" type="button" @click="copyRecord">{{ copied ? '已复制战绩' : '复制本局战绩' }}</button>
      <p class="room-note">ROOM {{ store.roomId }} · 9 PLAYERS</p>
    </aside>
    <div class="role-reveal-label"><span class="rule"></span><span class="eyebrow">ROLE REVEAL · 身份公开</span><span class="rule"></span></div>
    <section class="role-cards">
      <article v-for="card in cards" :key="card.id" class="role-card" :class="[card.cardClass, { out: !card.alive }]">
        <div class="rc-art"><img :src="card.meta.avatar" :alt="card.meta.name" /><div class="rc-shade"></div><span class="rc-seat">{{ card.id }}</span><span v-if="!card.alive" class="rc-out">出局</span></div>
        <div class="rc-body"><span class="rc-name">{{ card.meta.name }}</span><span class="rc-player">{{ card.name }}</span></div>
      </article>
    </section>
    <div class="corner-note">WALDHÜTTE · THE LONG TABLE</div>
  </div>
</template>
