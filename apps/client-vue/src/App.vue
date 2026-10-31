<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ApiRequestError, GameApiClient } from './api/client';
import { useRoomStream } from './composables/useRoomStream';
import { useHumanVoice } from './composables/useHumanVoice';
import { useHostPlayback } from './composables/useHostPlayback';
import { useRoomStore } from './stores/room';
import type { SeatState } from '../../../packages/protocol/src/types';

const store = useRoomStore();
const entryQuery = new URLSearchParams(location.search);
const apiUrl = ref(sessionStorage.getItem('linx-api') || entryQuery.get('api') || 'http://127.0.0.1:5100');
const roomId = ref(sessionStorage.getItem('linx-room') || entryQuery.get('room') || '');
const playerId = ref(sessionStorage.getItem('linx-player') || '');
const displayName = ref(sessionStorage.getItem('linx-name') || '玩家');
const aiName = ref('');
const targetSeatId = ref('');
const speechText = ref('');
const lastWordsText = ref('');
const witchAction = ref<'skip' | 'save' | 'poison'>('skip');
const client = ref<GameApiClient | null>(null);
const stream = ref<ReturnType<typeof useRoomStream> | null>(null);
const settlement = ref<Record<string, unknown> | null>(null);
const loading = ref(false);
const actionBusy = ref(false);
const message = ref('创建房间或填写房间号加入。');
const actionMessage = ref('');
const showSplash = ref(true);

const phaseNames: Record<string, string> = { LOBBY: '等待开局', ROLE_ASSIGNMENT: '分配身份', NIGHT_WOLF: '狼人行动', NIGHT_SEER: '预言家行动', NIGHT_WITCH: '女巫行动', DAY_ANNOUNCEMENT: '天亮了', HUNTER_RESPONSE: '猎人响应', LAST_WORDS: '遗言', SPEECH: '依次发言', VOTE: '放逐投票', RESOLUTION: '结算中', GAME_OVER: '本局结束' };
const roleNames: Record<string, string> = { werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '平民' };
const roleArt: Record<string, { name: string; en: string; avatar: string; accent: string }> = {
  werewolf: { name: '狼人', en: 'THE WEREWOLF', avatar: '/assets/werewolf/avatars/werewolf.webp', accent: '#d78b4e' },
  'wolf-siren': { name: '狼美人', en: 'THE WOLF SIREN', avatar: '/assets/werewolf/avatars/wolf-siren.webp', accent: '#b44a54' },
  seer: { name: '预言家', en: 'THE SEER', avatar: '/assets/werewolf/avatars/seer.webp', accent: '#7ca8a2' },
  witch: { name: '女巫', en: 'THE WITCH', avatar: '/assets/werewolf/avatars/witch.webp', accent: '#82a35e' },
  hunter: { name: '猎人', en: 'THE HUNTER', avatar: '/assets/werewolf/avatars/hunter.webp', accent: '#b45d3d' },
  warden: { name: '守卫', en: 'THE WARDEN', avatar: '/assets/werewolf/avatars/warden.webp', accent: '#c18a4e' },
  knight: { name: '骑士', en: 'THE KNIGHT', avatar: '/assets/werewolf/avatars/knight.webp', accent: '#95a9b1' },
  villager: { name: '村民', en: 'THE VILLAGER', avatar: '/assets/werewolf/avatars/villager.webp', accent: '#d0b178' },
  fool: { name: '白痴', en: 'THE FOOL', avatar: '/assets/werewolf/avatars/fool.webp', accent: '#bb8b54' },
  cupid: { name: '丘比特', en: 'THE CUPID', avatar: '/assets/werewolf/avatars/cupid.webp', accent: '#c98d82' },
};
const previewRoles = Object.values(roleArt).slice(0, 5);
const avatarCatalog = Object.values(roleArt);
function seatAvatar(seat: SeatState, index: number) {
  const mine = store.privateState?.seatId === seat.seatId ? roleArt[store.privateState?.role || ''] : null;
  return (mine || avatarCatalog[index % avatarCatalog.length]).avatar;
}
function seatAvatarAlt(seat: SeatState, index: number) {
  const mine = store.privateState?.seatId === seat.seatId ? roleArt[store.privateState?.role || ''] : null;
  return mine ? `${mine.name}头像` : `${avatarCatalog[index % avatarCatalog.length].name}头像`;
}
const phaseName = computed(() => phaseNames[store.publicState?.phase || 'LOBBY'] || store.publicState?.phase || '等待连接');
const isHost = computed(() => Boolean(store.publicState && playerId.value && store.publicState.hostPlayerId === playerId.value));
const mySeat = computed(() => store.publicState?.seats.find(seat => seat.seatId === store.privateState?.seatId));
const aliveTargets = computed(() => (store.publicState?.seats || []).filter(seat => seat.alive && seat.seatId !== store.privateState?.seatId));
const canSpeak = computed(() => Boolean(store.publicState?.phase === 'SPEECH' && store.publicState.currentSeatId === store.privateState?.seatId && mySeat.value?.controlSource === 'human' && store.privateState?.alive));
const canVote = computed(() => Boolean(store.publicState?.phase === 'VOTE' && store.privateState?.alive && mySeat.value?.controlSource === 'human'));
const canSkill = computed(() => {
  const role = store.privateState?.role;
  const phase = store.publicState?.phase;
  return Boolean(store.privateState?.alive && mySeat.value?.controlSource === 'human' && ((phase === 'NIGHT_WOLF' && role === 'werewolf') || (phase === 'NIGHT_SEER' && role === 'seer') || (phase === 'NIGHT_WITCH' && role === 'witch')));
});
const canHunter = computed(() => Boolean(store.publicState?.phase === 'HUNTER_RESPONSE' && store.privateState?.hunterAction && mySeat.value?.controlSource === 'human'));
const canLastWords = computed(() => Boolean(store.publicState?.phase === 'LAST_WORDS' && store.privateState?.lastWords && (store.privateState.lastWords as { seatId?: string }).seatId === store.privateState?.seatId && mySeat.value?.controlSource === 'human'));
const canAnnounce = computed(() => Boolean(isHost.value && store.publicState?.phase === 'DAY_ANNOUNCEMENT'));
const actionVisible = computed(() => canSpeak.value || canVote.value || canSkill.value || canHunter.value || canLastWords.value || canAnnounce.value);
const voice = useHumanVoice({
  client,
  roomId,
  contextKey: () => [roomId.value, store.publicState?.gameId, store.publicState?.round, store.publicState?.phase, store.publicState?.currentSeatId, store.privateState?.seatId].join(':'),
  canRecord: () => canSpeak.value,
  onBusyStart: () => hostPlayback.suspend(),
  onBusyEnd: () => hostPlayback.resume(),
  onDraft: text => { speechText.value = text; actionMessage.value = '转写已填入草稿，请检查后提交。'; }
});
const hostPlayback = useHostPlayback({ client, roomId, isHost: () => isHost.value, suspended: () => voice.busy.value });

function newClient(nextPlayerId = playerId.value) { return new GameApiClient({ baseUrl: apiUrl.value, playerId: nextPlayerId }); }

async function openRoom(nextRoomId: string, nextPlayerId = playerId.value, notice = '已连接房间。') {
  roomId.value = nextRoomId.trim(); playerId.value = nextPlayerId;
  client.value = newClient(nextPlayerId);
  sessionStorage.setItem('linx-api', apiUrl.value.replace(/\/$/, ''));
  sessionStorage.setItem('linx-room', roomId.value);
  sessionStorage.setItem('linx-player', playerId.value);
  sessionStorage.setItem('linx-name', displayName.value);
  await store.hydrate(client.value, roomId.value);
  stream.value?.close();
  stream.value = useRoomStream(client.value, roomId.value);
  message.value = notice;
}

async function createRoom() {
  loading.value = true;
  try { const response = await newClient().createRoom(displayName.value.trim() || '玩家'); await openRoom(response.room_id, response.player_id, `房间已创建：${response.room_id}`); }
  catch (cause) { message.value = errorMessage(cause); }
  finally { loading.value = false; }
}

async function joinRoom() {
  if (!roomId.value.trim()) { message.value = '请先填写房间号。'; return; }
  loading.value = true;
  try { const response = await newClient().joinRoom(roomId.value.trim(), displayName.value.trim() || '玩家'); await openRoom(roomId.value, response.player.playerId, '已加入房间。'); }
  catch (cause) { message.value = errorMessage(cause); }
  finally { loading.value = false; }
}

async function refresh() { if (client.value && roomId.value) await store.refreshAfterEvent(client.value, roomId.value).catch(cause => { message.value = errorMessage(cause); }); }

async function addAi() {
  if (!client.value || !store.publicState) return;
  try { const response = await client.value.addAi(roomId.value, aiName.value.trim() || undefined); store.publicState = response.state; aiName.value = ''; message.value = 'AI 玩家已加入。'; }
  catch (cause) { message.value = errorMessage(cause); }
}

async function renameAi(seat: SeatState) {
  const name = globalThis.prompt('修改 AI 名称', seat.displayName || '灵矽 AI 玩家');
  if (name === null || !client.value) return;
  try { const response = await client.value.renameAi(roomId.value, seat.seatId, name); store.publicState = response.state; }
  catch (cause) { message.value = errorMessage(cause); }
}

async function hostMutation(path: string, notice: string) {
  if (!client.value) return;
  try { const response = await client.value.mutate(roomId.value, path); if (response.state) store.publicState = response.state; message.value = notice; await refresh(); }
  catch (cause) { message.value = errorMessage(cause); }
}

async function startGame() { await hostMutation('/start', '已开始准备 AI 玩家连接，等待全部会话就绪。'); }
async function retryControllers() { await hostMutation('/controllers/retry', '已重新准备 AI 会话。'); }
async function cancelControllers() { await hostMutation('/controllers/cancel', '已取消准备，可以重新开始。'); }
async function retryTurn() { await hostMutation('/controllers/retry-turn', '已重试失败的 AI 回合。'); }

async function endGame() {
  if (!client.value || !globalThis.confirm('确定提前结束本局并释放所有 AI 会话吗？')) return;
  try { const response = await client.value.endRoom(roomId.value); settlement.value = (response.settlement || null) as Record<string, unknown> | null; stream.value?.close(); if (store.publicState) store.publicState = { ...store.publicState, phase: 'GAME_OVER', preparing: false }; message.value = '本局已结束，结算报告已生成。'; }
  catch (cause) { message.value = errorMessage(cause); }
}

async function submitAction(path: string, body: Record<string, unknown>, notice: string) {
  if (!client.value || actionBusy.value) return;
  actionBusy.value = true; actionMessage.value = '正在提交…';
  try { await client.value.mutate(roomId.value, path, { ...body, action_id: `${path.replaceAll('/', '_')}_${Date.now()}` }); actionMessage.value = notice; await refresh(); }
  catch (cause) { actionMessage.value = `提交失败：${errorMessage(cause)}`; }
  finally { actionBusy.value = false; }
}

async function submitSpeech() { if (voice.busy.value) { actionMessage.value = '请先结束录音或等待转写完成。'; return; } if (!speechText.value.trim()) { actionMessage.value = '发言不能为空。'; return; } await submitAction('/speeches', { text: speechText.value.trim() }, '发言已提交。'); if (!actionMessage.value.startsWith('提交失败')) { speechText.value = ''; voice.markSubmitted(); } }
async function startVoiceRecording() { try { await voice.start(); } catch (cause) { actionMessage.value = errorMessage(cause); } }
async function submitVote() { if (!targetSeatId.value) { actionMessage.value = '请选择投票目标。'; return; } await submitAction('/votes', { target_seat_id: targetSeatId.value }, '投票已提交。'); }
async function submitSkill() {
  const role = store.privateState?.role;
  const type = role === 'werewolf' ? 'wolf_target' : role === 'seer' ? 'seer_check' : role === 'witch' ? 'witch_action' : '';
  if (!type) return;
  const body: Record<string, unknown> = { type };
  if (type !== 'witch_action' || witchAction.value === 'poison') body.target_seat_id = targetSeatId.value;
  if (type === 'witch_action') body.action = witchAction.value;
  await submitAction('/actions', body, '行动已提交。');
}
async function submitHunter(action: 'shoot' | 'skip') { const windowId = (store.privateState?.hunterAction as { windowId?: string } | null)?.windowId; await submitAction('/hunter-response', { action, ...(windowId ? { window_id: windowId } : {}), ...(action === 'shoot' ? { target_seat_id: targetSeatId.value } : {}) }, action === 'shoot' ? '猎人开枪已提交。' : '已放弃开枪。'); }
async function submitLastWords(action: 'submit' | 'skip') { const windowId = (store.privateState?.lastWords as { windowId?: string } | null)?.windowId; await submitAction('/last-words', { action, window_id: windowId, ...(action === 'submit' ? { text: lastWordsText.value.trim() } : {}) }, action === 'submit' ? '遗言已提交。' : '已跳过遗言。'); if (action === 'submit') lastWordsText.value = ''; }
async function announceDay() { await submitAction('/actions', { type: 'announce_day' }, '已宣布天亮。'); }

function enterGame() { showSplash.value = false; }
function errorMessage(cause: unknown) { return cause instanceof ApiRequestError ? cause.message : cause instanceof Error ? cause.message : '请求失败'; }
function eventText(event: { type: string; data: Record<string, unknown> }) { const data = event.data; if (event.type === 'game.phase_changed') return `阶段：${phaseNames[String(data.phase)] || data.phase}`; if (event.type === 'game.player_eliminated') return `${data.seatId} 已出局`; if (event.type === 'game.vote_resolved') return `投票结算：${data.eliminatedSeatId || '平票'}`; if (event.type === 'game.night_resolved') return data.deathSeatIds ? `昨夜出局：${(data.deathSeatIds as string[]).join('、') || '平安夜'}` : '夜间结算'; if (event.type === 'game.last_words_submitted') return `${data.seatId} 完成遗言`; if (event.type === 'game.settlement_created') return `本局结束：${data.winner === 'good' ? '好人阵营' : data.winner === 'werewolf' ? '狼人阵营' : '房主结束'}`; return event.type; }

watch(() => stream.value?.lastError.value, value => { if (value) message.value = value; });
watch(() => store.publicState?.phase, () => { targetSeatId.value = ''; });
watch(() => store.recentEvents.length, () => hostPlayback.notify());
watch(() => roomId.value, () => { voice.reset(); hostPlayback.stop(); });
onBeforeUnmount(() => { stream.value?.close(); voice.reset(); hostPlayback.cleanup(); });
</script>

<template>
  <Transition name="splash-fade">
    <section v-if="showSplash" class="forest-splash" aria-label="暮林山舍游戏启动画面">
      <div class="forest-splash-bg"></div>
      <div class="forest-splash-mist"></div>
      <div class="forest-splash-content">
        <p class="forest-splash-kicker">WALDHÜTTE · LINX NIGHT</p>
        <h1>暮林<span>山舍</span></h1>
        <p class="forest-splash-copy">松风穿过檐角，木烟缓缓升起。<br>一盏灯，留给晚归的人。</p>
        <button class="forest-enter" type="button" @click="enterGame">进入林间 <span>↗</span></button>
        <p class="forest-splash-hint">THE FOREST ROLES · 10 CHARACTERS</p>
      </div>
      <div class="forest-splash-roles" aria-hidden="true">
        <article v-for="role in previewRoles" :key="role.name" class="forest-role-preview" :style="{ '--role-accent': role.accent }">
          <img :src="role.avatar" :alt="role.name" />
          <div><strong>{{ role.name }}</strong><small>{{ role.en }}</small></div>
        </article>
      </div>
      <div class="forest-splash-mark">◒</div>
    </section>
  </Transition>
  <main class="shell game-shell" :class="{ 'game-shell-visible': !showSplash }">
    <header class="hero"><div><p class="eyebrow">LINX NIGHT · VUE CLIENT</p><h1>AI 狼人杀</h1><p class="muted">Vue 客户端使用现有 Node API、MCP 和 SSE 协议。</p></div><span class="connection" :class="store.connectionStatus">{{ store.connectionStatus }}</span></header>
    <section class="card entry-card">
      <div class="section-title"><h2>{{ store.publicState ? `房间 ${store.publicState.roomId}` : '入座之前' }}</h2><span class="muted">{{ store.publicState ? '连接已建立' : '创建房间或加入朋友的房间' }}</span></div>
      <div class="entry-grid"><label>你的昵称<input v-model="displayName" maxlength="24" /></label><label>房间号<input v-model="roomId" placeholder="room_xxx" /></label><label>API 地址<input v-model="apiUrl" /></label></div>
      <div class="actions"><button :disabled="loading" @click="createRoom">创建房间</button><button class="secondary" :disabled="loading" @click="joinRoom">加入房间</button></div>
      <p class="message" role="status">{{ message }}</p>
    </section>
    <template v-if="store.publicState">
      <section class="card phase-card"><div><span class="eyebrow">当前阶段</span><h2>{{ phaseName }}</h2></div><div class="phase-meta">版本 {{ store.publicState.version }} · 第 {{ store.publicState.round }} 轮<span v-if="store.publicState.currentSeatId"> · {{ store.publicState.currentSeatId }} 行动</span></div></section>
      <section class="card"><div class="section-title"><h2>座位</h2><span>{{ store.publicState.seats.filter(seat => seat.playerType).length }} / {{ store.publicState.seats.length }}</span></div><div class="seats"><article v-for="(seat, seatIndex) in store.publicState.seats" :key="seat.seatId" class="seat" :class="{ dead: !seat.alive, active: store.publicState?.currentSeatId === seat.seatId }"><img class="seat-avatar" :src="seatAvatar(seat, seatIndex)" :alt="seatAvatarAlt(seat, seatIndex)" /><div class="seat-copy"><strong>{{ seat.seatId }}</strong><span>{{ seat.displayName || '等待入座' }}</span><small>{{ !seat.playerType ? '空位' : !seat.alive ? '已出局' : seat.controlSource === 'linx' ? '灵矽 AI' : '真人' }}</small></div><button v-if="isHost && store.publicState.phase === 'LOBBY' && seat.playerType === 'ai'" class="link-button" @click="renameAi(seat)">改名</button></article></div><div v-if="isHost && store.publicState.phase === 'LOBBY'" class="ai-add"><input v-model="aiName" placeholder="AI 玩家名称（可选）" maxlength="24" /><button class="secondary" @click="addAi">添加 AI</button></div></section>
      <section v-if="isHost && store.publicState.phase === 'LOBBY'" class="card lobby-actions"><p class="muted">{{ store.publicState.seats.some(seat => !seat.playerType) ? '请补齐九个座位后开始。' : '九席已满，可以开始游戏。' }}</p><div class="actions"><button :disabled="store.publicState.seats.some(seat => !seat.playerType) || store.publicState.preparing" @click="startGame">开始游戏</button><button v-if="store.publicState.preparing" class="secondary" @click="cancelControllers">取消准备</button><button v-if="store.publicState.controllerPhase === 'failed'" class="secondary" @click="retryControllers">重试连接</button></div></section>
      <section v-if="!['LOBBY', 'GAME_OVER'].includes(store.publicState.phase)" class="card lobby-actions"><div class="actions"><button v-if="isHost && store.publicState.controllerPhase === 'failed'" class="secondary" @click="retryTurn">重试 AI 回合</button><button v-if="isHost" class="secondary" @click="endGame">提前结束本局</button></div><p v-if="store.publicState.controllers.some(controller => controller.status === 'failed')" class="message">AI 行动失败，房主可以重试。</p></section>
      <section v-if="store.privateState" class="card private-card"><div class="section-title"><h2>我的私密状态</h2><span>{{ store.privateState.seatId }}</span></div><p>身份：<strong>{{ store.privateState.role ? roleNames[store.privateState.role] || store.privateState.role : '等待分配' }}</strong></p><p>阵营：{{ store.privateState.camp || '—' }} · {{ store.privateState.alive ? '存活' : '已出局' }}</p><p v-if="store.privateState.role === 'seer'">查验记录：{{ store.privateState.seerResults.length ? store.privateState.seerResults.map(result => `${result.targetSeatId} ${result.result}`).join('、') : '暂无' }}</p></section>
      <section v-if="actionVisible" class="card action-card"><div class="section-title"><h2>行动</h2><span class="live-dot">●</span></div><p class="muted">{{ canSpeak ? '轮到你发言，提交后进入下一席。' : canVote ? '选择一名存活玩家投票。' : canSkill ? '选择技能目标并确认行动。' : canHunter ? '猎人可以开枪或放弃。' : canLastWords ? '留下最后的话，或跳过遗言。' : '房主可以宣布天亮。' }}</p><p class="message" role="status">{{ actionMessage }}</p>
        <label v-if="canSpeak">公开发言<textarea v-model="speechText" rows="4" maxlength="1200" placeholder="输入你的判断"></textarea></label>
        <div v-if="canSpeak" class="voice-panel"><p class="muted">真人语音只生成可编辑草稿，确认提交后才会公开。</p><p class="message" role="status">{{ voice.draft.stage === 'recording' ? `录音中，剩余 ${Math.ceil(voice.remainingMs / 1000)} 秒` : voice.draft.stage === 'transcribing' ? '灵矽正在转写，请稍候……' : voice.draft.stage === 'confirming' ? '转写完成，请检查文字后提交。' : voice.draft.error || '可以录音或直接输入文字。' }}</p><div class="actions"><button class="secondary" :disabled="voice.busy" @click="startVoiceRecording">开始录音</button><button v-if="voice.draft.stage === 'recording'" class="secondary" @click="voice.stop">结束录音</button><button v-if="['recording','transcribing','confirming','failed'].includes(voice.draft.stage)" class="secondary" @click="voice.cancel">取消录音/转写</button></div></div>
        <label v-if="canLastWords">遗言<textarea v-model="lastWordsText" rows="3" maxlength="200" placeholder="留下最后的话"></textarea></label>
        <label v-if="canSkill && store.privateState?.role === 'witch'">女巫行动<select v-model="witchAction"><option value="skip">今晚不用药</option><option value="save">使用解药</option><option value="poison">使用毒药</option></select></label>
        <label v-if="canSkill || canVote || canHunter">选择目标<select v-model="targetSeatId"><option value="">请选择</option><option v-for="seat in aliveTargets" :key="seat.seatId" :value="seat.seatId">{{ seat.seatId }} · {{ seat.displayName }}</option></select></label>
        <div class="actions"><button v-if="canSpeak" :disabled="actionBusy" @click="submitSpeech">提交发言</button><button v-if="canSkill" :disabled="actionBusy || ((store.privateState?.role !== 'witch' || witchAction === 'poison') && !targetSeatId)" @click="submitSkill">确认行动</button><button v-if="canVote" :disabled="actionBusy || !targetSeatId" @click="submitVote">确认投票</button><button v-if="canHunter" :disabled="actionBusy || !targetSeatId" @click="submitHunter('shoot')">确认开枪</button><button v-if="canHunter" class="secondary" :disabled="actionBusy" @click="submitHunter('skip')">放弃开枪</button><button v-if="canLastWords" :disabled="actionBusy || !lastWordsText.trim()" @click="submitLastWords('submit')">提交遗言</button><button v-if="canLastWords" class="secondary" :disabled="actionBusy" @click="submitLastWords('skip')">跳过遗言</button><button v-if="canAnnounce" @click="announceDay">宣布天亮</button></div>
      </section>
      <section class="card"><div class="section-title"><h2>桌边记录</h2><span>{{ store.recentEvents.length }}</span></div><ol class="events"><li v-for="event in store.recentEvents.slice().reverse()" :key="event.eventId"><span>{{ eventText(event) }}</span><code>v{{ event.version }}</code></li><li v-if="!store.recentEvents.length" class="muted">暂无新事件</li></ol></section>
      <section class="card host-card"><div class="section-title"><h2>公共语音</h2><span :class="hostPlayback.enabled ? 'live-dot' : 'muted'">{{ hostPlayback.enabled ? '已启用' : '未启用' }}</span></div><p class="muted">主持和已提交的 AI 发言按服务端事件顺序播放；私密状态和原始模型回复不会播放。</p><p class="message" role="status">{{ hostPlayback.status }}</p><p v-if="hostPlayback.task" class="host-task"><strong>{{ hostPlayback.task.seatId || '主持' }}</strong>：{{ hostPlayback.task.text }}</p><div class="actions"><button @click="hostPlayback.enabled ? hostPlayback.stop() : hostPlayback.start()">{{ hostPlayback.enabled ? '停止公共声音' : '启用公共声音' }}</button><button v-if="hostPlayback.canManage && hostPlayback.error" class="secondary" @click="hostPlayback.retry">重试音频</button><button v-if="hostPlayback.canManage && hostPlayback.task" class="secondary" @click="hostPlayback.skip">跳过当前音频</button></div></section>
      <section v-if="store.publicState.phase === 'GAME_OVER' || settlement" class="card result-card"><p class="eyebrow">THE END / 本局结算</p><h2>本局结束</h2><p class="muted">结算报告包含公开身份、出局顺序、投票结果和资源释放状态。</p><pre v-if="settlement">{{ JSON.stringify(settlement, null, 2) }}</pre></section>
    </template>
  </main>
</template>
