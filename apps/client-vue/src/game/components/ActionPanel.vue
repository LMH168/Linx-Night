<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useGameStore } from '../stores/game';
import { useHumanVoice } from '../../composables/useHumanVoice';
import { useHostPlayback } from '../../composables/useHostPlayback';

const props = defineProps<{ mode: 'desktop' | 'mobile' }>();
const store = useGameStore();
const draft = ref('');
const lastWords = ref('');
const client = computed(() => store.client);
const roomId = computed(() => store.roomId);
const hostPlayback = useHostPlayback({ client, roomId, isHost: () => store.playerId === store.publicState?.hostPlayerId });
const voice = useHumanVoice({
  client,
  roomId,
  contextKey: () => [store.roomId, store.publicState?.gameId, store.publicState?.round, store.phase, store.publicState?.currentSeatId, store.selfSeatId].join(':'),
  canRecord: () => store.phase === 'SPEECH' && store.isMyAction,
  onBusyStart: () => hostPlayback.suspend(),
  onBusyEnd: () => hostPlayback.resume(),
  onDraft: text => { draft.value = text; },
});
onBeforeUnmount(() => { voice.reset(); hostPlayback.cleanup(); });
const isMobile = computed(() => props.mode === 'mobile');
const panelClass = computed(() => isMobile.value ? 'sheet' : 'action panel');
const isWaiting = computed(() => (store.night || store.phase === 'HUNTER_RESPONSE' || store.phase === 'LAST_WORDS') && !store.isMyAction);
const title = computed(() => {
  if (store.phase === 'DAY_ANNOUNCEMENT') return '天亮了';
  if (store.phase === 'SPEECH') return store.isMyAction ? '轮到你发言' : '等待发言';
  if (store.phase === 'VOTE') return '放逐投票';
  if (store.phase === 'LAST_WORDS') return '发表遗言';
  if (store.phase === 'HUNTER_RESPONSE') return '猎人响应';
  if (store.phase === 'NIGHT_WOLF') return '今夜，袭击谁？';
  if (store.phase === 'NIGHT_SEER') return '今夜，查验谁？';
  if (store.phase === 'NIGHT_WITCH') return '今夜，用哪瓶药？';
  return '等待阶段推进';
});
const eyebrow = computed(() => store.phase === 'SPEECH' ? 'SPEECH · ' + (store.selfSeat.id || '') : 'PHASE · ' + store.phase);
const copy = computed(() => {
  if (store.phase === 'NIGHT_WOLF') return '狼队共同选择一名非狼人玩家。确认后等待其他狼人。';
  if (store.phase === 'NIGHT_SEER') return '查验一名玩家的阵营，结果只显示在你的身份卡中。';
  if (store.phase === 'NIGHT_WITCH') return '选择解药、毒药或不使用药剂。';
  if (store.phase === 'HUNTER_RESPONSE') return '你可以开枪带走一名仍存活的玩家，也可以放弃。';
  if (store.phase === 'LAST_WORDS') return '这是你的公开遗言窗口，提交后进入下一阶段。';
  if (store.phase === 'VOTE') return '选择一名仍存活的玩家进行放逐投票。';
  return '';
});
const targetList = computed(() => {
  const wolfIds = new Set(store.wolfTeammates.map(member => member.id));
  return store.publicSeats.map(seat => {
    let disabled = !seat.alive;
    let tag = !seat.alive ? '出局' : '';
    if (store.phase === 'NIGHT_WOLF' && (seat.isSelf || wolfIds.has(seat.id))) { disabled = true; tag = '狼队'; }
    if (['NIGHT_SEER', 'NIGHT_WITCH'].includes(store.phase) && seat.isSelf) { disabled = true; tag = '你'; }
    if (store.phase === 'HUNTER_RESPONSE' && !seat.alive) { disabled = true; tag = '出局'; }
    if (seat.isSelected && !disabled) tag = tag || '已选';
    return { ...seat, disabled, tag };
  });
});
const selectedTarget = computed(() => store.publicSeats.find(seat => seat.id === store.selectedSeatId));
const confirmLabel = computed(() => store.phase === 'NIGHT_WOLF' ? '确认袭击' : store.phase === 'NIGHT_SEER' ? '确认查验' : store.phase === 'VOTE' ? '确认投票' : store.phase === 'HUNTER_RESPONSE' ? '确认开枪' : '确认行动');

watch(() => store.phase, () => { draft.value = ''; lastWords.value = ''; });

function choose(id: string, disabled: boolean) { if (!disabled) store.selectSeat(id); }
async function confirm() { await store.confirmAction(); }
async function submitSpeech() { await store.submitSpeech(draft.value); if (!store.actionBusy) draft.value = ''; }
async function submitLastWords() { if (!lastWords.value.trim()) return; await store.submitLastWords(lastWords.value); lastWords.value = ''; }
async function skip() { await store.skipAction(); }
</script>

<template>
  <aside :class="panelClass">
    <div v-if="isMobile" class="handle"></div>
    <div :class="isMobile ? 'sheet-head' : 'action-head'">
      <div><span class="eyebrow">{{ eyebrow }}</span><h2 class="action-title">{{ title }}</h2></div>
      <span class="timer-ring"><span>{{ store.privateState?.currentTurn?.expiresAt ? '进行中' : '—' }}</span></span>
    </div>
    <p v-if="copy" class="action-copy">{{ copy }}</p>

    <template v-if="store.phase === 'DAY_ANNOUNCEMENT'">
      <div class="dawn-panel"><span class="dawn-glyph" aria-hidden="true">☾</span><p>昨夜结果由主持公开播报。</p><p class="dawn-sub">等待房主宣布天亮后进入发言。</p></div>
      <div :class="isMobile ? 'mobile-actions' : 'action-buttons'"><button v-if="store.playerId === store.publicState?.hostPlayerId" class="btn gold" @click="store.announceDay">宣布天亮</button></div>
    </template>

    <template v-else-if="store.phase === 'SPEECH' && store.isMyAction">
      <div class="speech-compose"><textarea v-model="draft" maxlength="1200" aria-label="你的发言" placeholder="输入你的发言，或使用真人录音……"></textarea><span class="compose-count">{{ draft.length }} / 1200</span></div>
      <p v-if="voice.draft.stage !== 'idle'" class="action-notice">{{ voice.draft.stage === 'recording' ? `录音中，剩余 ${Math.ceil(voice.remainingMs / 1000)} 秒` : voice.draft.stage === 'transcribing' ? '灵矽正在转写……' : voice.draft.stage === 'confirming' ? '转写完成，请确认文字后提交。' : voice.draft.error }}</p>
      <div :class="isMobile ? 'mobile-actions' : 'action-buttons'"><button class="btn ghost" :disabled="voice.busy" @click="voice.start">开始录音</button><button v-if="voice.draft.stage === 'recording'" class="btn ghost" @click="voice.stop">结束录音</button><button v-if="voice.draft.stage !== 'idle'" class="btn ghost" @click="voice.cancel">取消录音</button><button class="btn gold" :disabled="!draft.trim() || store.actionBusy || voice.busy" @click="submitSpeech">提交发言</button></div>
    </template>

    <template v-else-if="store.phase === 'LAST_WORDS' && store.isMyAction">
      <div class="speech-compose"><textarea v-model="lastWords" maxlength="200" aria-label="你的遗言" placeholder="输入遗言……"></textarea><span class="compose-count">{{ lastWords.length }} / 200</span></div>
      <div :class="isMobile ? 'mobile-actions' : 'action-buttons'"><button class="btn ghost" :disabled="store.actionBusy" @click="skip">跳过遗言</button><button class="btn gold" :disabled="!lastWords.trim() || store.actionBusy" @click="submitLastWords">提交遗言</button></div>
    </template>

    <template v-else-if="isWaiting">
      <div class="waiting-panel"><span class="waiting-orb" aria-hidden="true"><i></i></span><p>等待服务端推进当前阶段。</p><span class="waiting-sub">其他玩家行动完成后，页面会通过实时事件更新。</span></div>
    </template>

    <template v-else-if="store.phase === 'NIGHT_WITCH' && store.isMyAction">
      <div class="action-buttons"><button class="btn ghost" :class="{ selected: store.witchAction === 'skip' }" @click="store.witchAction = 'skip'">不使用</button><button class="btn ghost" :class="{ selected: store.witchAction === 'save' }" :disabled="!store.privateState?.skills?.antidoteAvailable" @click="store.witchAction = 'save'">使用解药</button><button class="btn ghost" :class="{ selected: store.witchAction === 'poison' }" :disabled="!store.privateState?.skills?.poisonAvailable" @click="store.witchAction = 'poison'">使用毒药</button></div>
      <div v-if="store.witchAction === 'poison'" class="target-grid"><button v-for="target in targetList" :key="target.id" type="button" class="target" :class="{ selected: target.isSelected && !target.disabled, disabled: target.disabled }" :disabled="target.disabled" @click="choose(target.id, target.disabled)"><span class="sid">{{ target.id }}</span><span class="nm">{{ target.name }}</span><span v-if="target.tag" class="tag">{{ target.tag }}</span></button></div>
      <div class="action-buttons"><button class="btn gold" :disabled="store.witchAction === 'poison' && !store.selectedSeatId || store.actionBusy" @click="store.witchAction === 'skip' ? skip() : confirm()">确认用药</button></div>
    </template>

    <template v-else-if="store.phase === 'HUNTER_RESPONSE' && store.isMyAction">
      <div class="target-grid"><button v-for="target in targetList" :key="target.id" type="button" class="target" :class="{ selected: target.isSelected && !target.disabled, disabled: target.disabled }" :disabled="target.disabled" @click="choose(target.id, target.disabled)"><span class="sid">{{ target.id }}</span><span class="nm">{{ target.name }}</span></button></div>
      <div class="action-buttons"><button class="btn ghost" @click="skip">放弃开枪</button><button class="btn gold" :disabled="!store.selectedSeatId || store.actionBusy" @click="confirm">确认开枪</button></div>
    </template>

    <template v-else-if="store.phase === 'VOTE' && store.isMyAction">
      <div class="target-grid"><button v-for="target in targetList" :key="target.id" type="button" class="target" :class="{ selected: target.isSelected && !target.disabled, disabled: target.disabled }" :disabled="target.disabled" @click="choose(target.id, target.disabled)"><span class="sid">{{ target.id }}</span><span class="nm">{{ target.name }}</span><span v-if="target.tag" class="tag">{{ target.tag }}</span></button></div>
      <div class="action-buttons"><button class="btn gold" :disabled="!store.selectedSeatId || store.actionBusy" @click="confirm">{{ confirmLabel }}</button></div>
    </template>

    <template v-else-if="store.night && store.isMyAction">
      <div class="target-grid"><button v-for="target in targetList" :key="target.id" type="button" class="target" :class="{ selected: target.isSelected && !target.disabled, disabled: target.disabled }" :disabled="target.disabled" @click="choose(target.id, target.disabled)"><span class="sid">{{ target.id }}</span><span class="nm">{{ target.name }}</span><span v-if="target.tag" class="tag">{{ target.tag }}</span></button></div>
      <div class="action-buttons"><button class="btn gold" :disabled="!store.selectedSeatId || store.actionBusy" @click="confirm">{{ confirmLabel }}</button></div>
    </template>

    <p v-if="store.notice" class="action-notice">{{ store.notice }}</p>
    <div v-if="!isMobile && store.privateState?.role" class="mini-id"><span class="mini-sigil" aria-hidden="true">◈</span><div><b>{{ store.selfMeta.name }}</b><span>{{ store.selfMeta.camp === 'wolf' ? '狼人阵营' : '好人阵营' }} · 仅你可见</span></div><span class="mini-lock" aria-hidden="true">⌑</span></div>
    <div class="host-card"><span class="eyebrow">PUBLIC VOICE</span><p>{{ hostPlayback.status }}</p><button class="btn ghost" @click="hostPlayback.enabled ? hostPlayback.stop() : hostPlayback.start()">{{ hostPlayback.enabled ? '停止公共声音' : '启用公共声音' }}</button><button v-if="hostPlayback.canManage && hostPlayback.error" class="btn ghost" @click="hostPlayback.retry">重试播报</button><button v-if="hostPlayback.canManage && hostPlayback.task" class="btn ghost" @click="hostPlayback.skip">跳过当前播报</button></div>
  </aside>
</template>
