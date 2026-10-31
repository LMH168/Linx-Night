<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { GameApiClient } from './api/client';
import { useRoomStream } from './composables/useRoomStream';
import { useRoomStore } from './stores/room';

const store = useRoomStore();
const entryQuery = new URLSearchParams(location.search);
const apiUrl = ref(sessionStorage.getItem('linx-api') || entryQuery.get('api') || 'http://127.0.0.1:5100');
const roomId = ref(sessionStorage.getItem('linx-room') || entryQuery.get('room') || '');
const playerId = ref(sessionStorage.getItem('linx-player') || '');
const client = ref<GameApiClient | null>(null);
const stream = ref<ReturnType<typeof useRoomStream> | null>(null);
const loading = ref(false);
const message = ref('请输入房间号和玩家 ID，然后连接。');

const phaseNames: Record<string, string> = {
  LOBBY: '等待开局', ROLE_ASSIGNMENT: '分配身份', NIGHT_WOLF: '狼人行动', NIGHT_SEER: '预言家行动',
  NIGHT_WITCH: '女巫行动', DAY_ANNOUNCEMENT: '天亮了', HUNTER_RESPONSE: '猎人响应', LAST_WORDS: '遗言',
  SPEECH: '依次发言', VOTE: '放逐投票', RESOLUTION: '结算中', GAME_OVER: '本局结束'
};
const roleNames: Record<string, string> = { werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '平民' };
const phaseName = computed(() => phaseNames[store.publicState?.phase || 'LOBBY'] || store.publicState?.phase || '等待连接');

async function connect() {
  if (!roomId.value.trim()) { message.value = '请先输入房间号。'; return; }
  loading.value = true;
  store.reset();
  client.value = new GameApiClient({ baseUrl: apiUrl.value, playerId: playerId.value });
  sessionStorage.setItem('linx-api', apiUrl.value.replace(/\/$/, ''));
  sessionStorage.setItem('linx-room', roomId.value.trim());
  if (playerId.value) sessionStorage.setItem('linx-player', playerId.value);
  try {
    await store.hydrate(client.value, roomId.value.trim());
    stream.value?.close();
    stream.value = useRoomStream(client.value, roomId.value.trim());
    message.value = '已连接，状态会通过 SSE 自动更新。';
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : '连接失败';
  } finally { loading.value = false; }
}

function disconnect() {
  stream.value?.close();
  stream.value = null;
  client.value = null;
  store.reset();
  message.value = '已断开连接。';
}

watch(() => stream.value?.lastError.value, value => { if (value) message.value = value; });
onBeforeUnmount(() => stream.value?.close());
</script>

<template>
  <main class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">LINX NIGHT · VUE CLIENT PREVIEW</p>
        <h1>AI 狼人杀</h1>
        <p class="muted">Vue 迁移入口，继续使用现有 Node API 和 SSE 协议。</p>
      </div>
      <span class="connection" :class="store.connectionStatus">{{ store.connectionStatus }}</span>
    </header>

    <section class="card entry-card">
      <label>API 地址<input v-model="apiUrl" autocomplete="url" /></label>
      <label>房间号<input v-model="roomId" placeholder="room_xxx" /></label>
      <label>玩家 ID<input v-model="playerId" placeholder="创建或加入后获得的 player_id" /></label>
      <div class="actions"><button :disabled="loading" @click="connect">{{ loading ? '连接中…' : '连接房间' }}</button><button class="secondary" @click="disconnect">断开</button></div>
      <p class="message" role="status">{{ message }}</p>
    </section>

    <template v-if="store.publicState">
      <section class="card phase-card">
        <div><span class="eyebrow">当前阶段</span><h2>{{ phaseName }}</h2></div>
        <div class="phase-meta">版本 {{ store.publicState.version }} · 第 {{ store.publicState.round }} 轮<span v-if="store.publicState.currentSeatId"> · {{ store.publicState.currentSeatId }} 行动</span></div>
      </section>

      <section class="card">
        <div class="section-title"><h2>座位</h2><span>{{ store.publicState.seats.length }} 席</span></div>
        <div class="seats"><article v-for="seat in store.publicState.seats" :key="seat.seatId" class="seat" :class="{ dead: !seat.alive, active: store.publicState?.currentSeatId === seat.seatId }"><strong>{{ seat.seatId }}</strong><span>{{ seat.displayName || '等待入座' }}</span><small>{{ seat.alive ? (seat.controlSource === 'linx' ? '灵矽 AI' : '真人') : '已出局' }}</small></article></div>
      </section>

      <section v-if="store.privateState" class="card private-card">
        <div class="section-title"><h2>我的私密状态</h2><span>{{ store.privateState.seatId }}</span></div>
        <p>身份：<strong>{{ store.privateState.role ? roleNames[store.privateState.role] || store.privateState.role : '等待分配' }}</strong></p>
        <p>阵营：{{ store.privateState.camp || '—' }} · {{ store.privateState.alive ? '存活' : '已出局' }}</p>
      </section>

      <section class="card">
        <div class="section-title"><h2>最近事件</h2><span>{{ store.recentEvents.length }}</span></div>
        <ol class="events"><li v-for="event in store.recentEvents.slice().reverse()" :key="event.eventId"><code>{{ event.type }}</code><span>v{{ event.version }}</span></li><li v-if="!store.recentEvents.length" class="muted">暂无新事件</li></ol>
      </section>
    </template>
  </main>
</template>
