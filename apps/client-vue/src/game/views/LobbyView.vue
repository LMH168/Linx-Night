<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import BrandMark from '../components/BrandMark.vue';

const store = useGameStore();
const router = useRouter();
const name = ref(store.displayName);
const roomInput = ref(store.roomId);
const aiName = ref('');
const busy = ref(false);
const error = ref('');

const state = computed(() => store.publicState);
const seats = computed(() => store.publicSeats);
const isHost = computed(() => Boolean(state.value && store.playerId && state.value.hostPlayerId === store.playerId));
const preparing = computed(() => Boolean(state.value?.preparing || ['connecting', 'binding'].includes(state.value?.controllerPhase || '')));
const connectedCount = computed(() => state.value?.controllers?.filter(controller => controller.status === 'ready').length || 0);

onMounted(() => {
  roomInput.value = store.roomId;
  name.value = store.displayName;
});
watch(() => state.value?.phase, phase => {
  if (phase && phase !== 'LOBBY' && phase !== 'ROLE_ASSIGNMENT') router.replace('/room/' + store.roomId);
});
watch(() => state.value?.controllerPhase, phase => {
  if (phase === 'ready' && state.value?.phase !== 'LOBBY') router.replace('/room/' + store.roomId);
});

async function create() {
  busy.value = true; error.value = '';
  try { await store.createRoom(name.value); roomInput.value = store.roomId; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '创建房间失败'; }
  finally { busy.value = false; }
}
async function join() {
  if (!roomInput.value.trim()) { error.value = '请输入房间号'; return; }
  busy.value = true; error.value = '';
  try { await store.joinRoom(roomInput.value, name.value); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '加入房间失败'; }
  finally { busy.value = false; }
}
async function addAi() {
  busy.value = true; error.value = '';
  try { await store.addAi(aiName.value.trim() || undefined); aiName.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '添加 AI 失败'; }
  finally { busy.value = false; }
}
async function rename(seatId: string, oldName: string) {
  const next = globalThis.prompt('修改 AI 名称', oldName);
  if (next === null || !next.trim()) return;
  try { await store.renameAi(seatId, next.trim()); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '修改名称失败'; }
}
async function start() {
  busy.value = true; error.value = '';
  try { await store.startGame(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '开始游戏失败'; }
  finally { busy.value = false; }
}
async function retry() {
  busy.value = true; error.value = '';
  try { await store.retryControllers(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '重试失败'; }
  finally { busy.value = false; }
}
async function cancel() {
  busy.value = true; error.value = '';
  try { await store.cancelControllers(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '取消失败'; }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="screen lobby-screen">
    <header class="lobby-top"><BrandMark /><span class="connection">{{ store.roomId ? '已连接 · 山舍前厅' : '等待入座' }}</span></header>
    <section class="lobby-head">
      <p class="eyebrow">PRIVATE ROOM · WALDHÜTTE</p>
      <div class="lobby-title"><h1>{{ state ? '真实房间' : '进入山舍' }}</h1><span v-if="state" class="room-chip">ROOM {{ state.roomId }}</span></div>
      <p class="muted">房间、座位、阶段和行动均由服务端实时控制。</p>
    </section>

    <section v-if="!state" class="lobby-grid">
      <div class="lobby-roster panel lobby-entry">
        <span class="eyebrow">PLAYER IDENTITY</span>
        <h2>先登记玩家</h2>
        <label>昵称<input v-model="name" maxlength="24" autocomplete="nickname" /></label>
        <label>房间号<input v-model="roomInput" placeholder="room_xxx" autocomplete="off" /></label>
        <div class="actions"><button class="btn gold" :disabled="busy" @click="create">创建房间</button><button class="btn ghost" :disabled="busy" @click="join">加入房间</button></div>
        <p v-if="error" class="action-notice">{{ error }}</p>
      </div>
      <aside class="lobby-info panel"><span class="eyebrow">SERVER CONTROLLED GAME</span><h2>真实对局入口</h2><p class="lobby-copy">3 狼人、3 村民、预言家、女巫和猎人。所有阶段由服务端推进，刷新后可恢复当前房间。</p></aside>
    </section>

    <section v-else class="lobby-grid">
      <div class="lobby-roster">
        <div class="panel-head"><span class="eyebrow">THE TRAVELLERS</span><span>{{ seats.filter(seat => state.seats.find(item => item.seatId === seat.id)?.playerType).length }} / {{ seats.length }}</span></div>
        <div class="roster-grid">
          <article v-for="(seat, index) in seats" :key="seat.id" class="roster-seat" :style="{ '--tint': ['#8e9b79','#9b6a5d','#a89a6b','#8d7d68','#738b6a','#8a5d5d','#769b96','#b08a55','#786b5c'][index] }">
            <span class="rs-index">{{ seat.id }}</span><span class="rs-initial">{{ seat.initial }}</span><span class="rs-name">{{ seat.name }}</span>
            <span class="rs-state">{{ seat.isSelf ? '你' : state.seats.find(item => item.seatId === seat.id)?.controlSource === 'linx' ? '灵矽 AI' : state.seats.find(item => item.seatId === seat.id)?.playerType ? '真人' : '空位' }}</span>
            <button v-if="isHost && state.phase === 'LOBBY' && state.seats.find(item => item.seatId === seat.id)?.playerType === 'ai'" class="link-button" @click="rename(seat.id, seat.name)">改名</button>
          </article>
        </div>
        <div v-if="isHost && state.phase === 'LOBBY'" class="ai-add"><input v-model="aiName" placeholder="AI 玩家名称（可选）" maxlength="24" /><button class="secondary" :disabled="busy" @click="addAi">添加 AI</button></div>
      </div>
      <aside class="lobby-info panel">
        <span class="eyebrow">ROOM {{ state.roomId }}</span>
        <h2>{{ state.phase === 'LOBBY' ? '等待开局' : preparing ? '正在连接 AI' : '准备完成' }}</h2>
        <p class="lobby-copy" v-if="state.phase === 'LOBBY'">房主补齐座位后开始游戏。</p>
        <p class="lobby-copy" v-else>控制器状态：{{ state.controllerPhase }}（{{ connectedCount }}/{{ state.controllers.length }}）</p>
        <div class="actions" v-if="isHost && state.phase === 'LOBBY'"><button class="btn gold" :disabled="busy || seats.some(seat => !state.seats.find(item => item.seatId === seat.id)?.playerType)" @click="start">开始游戏</button><button v-if="preparing" class="btn ghost" :disabled="busy" @click="cancel">取消准备</button><button v-if="state.controllerPhase === 'failed'" class="btn ghost" :disabled="busy" @click="retry">重试连接</button></div>
        <p v-if="error || store.notice" class="action-notice">{{ error || store.notice }}</p>
      </aside>
    </section>
    <footer class="lobby-foot"><span>LINX NIGHT · REAL ROOM</span><span>Node API · SSE · MCP</span></footer>
  </div>
</template>
