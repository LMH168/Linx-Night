<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import BrandMark from '../components/BrandMark.vue';

const store = useGameStore();
const router = useRouter();
const seats = computed(() => store.publicSeats);
onMounted(() => store.setPhase('LOBBY'));

function start() {
  store.applyScene('speech');
  router.push(`/room/${store.roomId}`);
}
function preview(scene: 'guard' | 'wolf' | 'vote' | 'result') {
  store.applyScene(scene);
  router.push(`/room/${store.roomId}`);
}
</script>

<template>
  <div class="screen lobby-screen">
    <header class="lobby-top"><BrandMark /><span class="connection">已连接 · 山舍前厅</span></header>
    <section class="lobby-head">
      <p class="eyebrow">PRIVATE ROOM · WALDHÜTTE</p>
      <div class="lobby-title"><h1>九席已满</h1><span class="room-chip">ROOM {{ store.roomId }}</span></div>
      <p class="muted">九个旅人围坐在长桌边。火还亮着，牌还没有翻开。</p>
    </section>
    <section class="lobby-grid">
      <div class="lobby-roster">
        <div class="panel-head"><span class="eyebrow">THE TRAVELLERS</span><span>9 / 9</span></div>
        <div class="roster-grid">
          <article v-for="(seat, index) in seats" :key="seat.id" class="roster-seat" :style="{ '--tint': ['#8e9b79','#9b6a5d','#a89a6b','#8d7d68','#738b6a','#8a5d5d','#769b96','#b08a55','#786b5c'][index] }">
            <span class="rs-index">{{ seat.id }}</span><span class="rs-initial">{{ seat.initial }}</span><span class="rs-name">{{ seat.name }}</span><span class="rs-state">{{ seat.isSelf ? '你' : '已入座' }}</span>
          </article>
        </div>
      </div>
      <aside class="lobby-info panel">
        <span class="eyebrow">BEFORE THE FIRST NIGHT</span>
        <h2>入座之前</h2>
        <p class="lobby-copy">本局使用九人预女守板子：3 狼人、3 村民、预言家、女巫、守卫。无猎人、无警长。</p>
        <div class="lobby-rules"><div><span>夜晚</span><b>守卫 → 狼人 → 预言家 → 女巫</b></div><div><span>白天</span><b>顺序发言 → 放逐投票</b></div><div><span>胜利</span><b>放逐全部狼人 / 狼人达到人数 parity</b></div></div>
        <button class="btn gold lobby-start" type="button" @click="start">开始游戏 <span>→</span></button>
        <div class="lobby-preview"><span class="eyebrow">SKIP TO A SCENE · 演示</span><div><button type="button" @click="preview('guard')">守卫夜</button><button type="button" @click="preview('wolf')">狼人夜</button><button type="button" @click="preview('vote')">投票</button><button type="button" @click="preview('result')">结算</button></div></div>
        <p class="lobby-note">此页为本地 Mock 演示，不会写入真实房间。</p>
      </aside>
    </section>
    <footer class="lobby-foot"><span>WALDHÜTTE · THE LONG TABLE</span><span>九人局 / 预女守</span></footer>
  </div>
</template>
