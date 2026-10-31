<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGameStore } from '../stores/game';

const props = defineProps<{ mode: 'desktop' | 'mobile' }>();
const store = useGameStore();
const draft = ref('');

const isMobile = computed(() => props.mode === 'mobile');
const panelClass = computed(() => isMobile.value ? 'sheet' : 'action panel');
const isWaiting = computed(() => store.night && !store.isMyAction);
const isSeerDone = computed(() => store.phase === 'NIGHT_SEER' && store.isMyAction && store.notice.includes('查验结果'));
const deadNames = computed(() => store.publicSeats.filter(seat => !seat.alive && seat.id === 'P2').map(seat => `${seat.id} · ${seat.name}`).join('、'));

const title = computed(() => {
  if (store.phase === 'DAY_ANNOUNCEMENT') return '天亮了';
  if (store.phase === 'SPEECH') return '轮到你发言';
  if (isWaiting.value) return '夜幕中，有人在行动';
  if (store.phase === 'NIGHT_GUARD') return '今夜，守护谁？';
  if (store.phase === 'NIGHT_WOLF') return '今夜，袭击谁？';
  if (store.phase === 'NIGHT_SEER') return '今夜，查验谁？';
  if (store.phase === 'NIGHT_WITCH') return '今夜，用哪瓶药？';
  return '等待阶段推进';
});
const eyebrow = computed(() => {
  if (store.phase === 'DAY_ANNOUNCEMENT') return 'DAWN · 天亮';
  if (store.phase === 'SPEECH') return `SPEECH · ${store.selfSeat.id}`;
  if (store.phase === 'NIGHT_GUARD') return 'NIGHT ACTION · 守卫';
  if (store.phase === 'NIGHT_WOLF') return 'NIGHT ACTION · 狼人';
  if (store.phase === 'NIGHT_SEER') return 'NIGHT ACTION · 预言家';
  if (store.phase === 'NIGHT_WITCH') return 'NIGHT ACTION · 女巫';
  return 'NIGHT · 等待';
});
const quote = computed(() => {
  if (store.phase === 'NIGHT_GUARD') return '门在，灯在，我就还在。';
  if (store.phase === 'NIGHT_WOLF') return '月色越深，牙齿越亮。';
  if (store.phase === 'NIGHT_SEER') return '我看见了明天，只是没人愿意听。';
  if (store.phase === 'NIGHT_WITCH') return '药与毒，只差一个念头。';
  return store.selfMeta.quote;
});
const copy = computed(() => {
  if (store.phase === 'NIGHT_GUARD') return '被守护者免疫狼人袭击。不可连续两晚守护同一人，可以自守。';
  if (store.phase === 'NIGHT_WOLF') return '狼队共同选择一名非狼人玩家。确认后进入下一个夜间阶段。';
  if (store.phase === 'NIGHT_SEER') return '查验一名玩家的阵营。结果只出现在你的身份卡里，不会进入公共状态。';
  if (store.phase === 'NIGHT_WITCH') return '解药可救回今夜被袭击者，毒药可带走一人；同一夜只能用一瓶。';
  if (store.phase === 'SPEECH') return '你的发言会进入公共记录。发言结束后进入放逐投票。';
  return '';
});
const confirmLabel = computed(() => {
  if (store.phase === 'NIGHT_GUARD') return '确认守护';
  if (store.phase === 'NIGHT_WOLF') return '确认袭击';
  if (store.phase === 'NIGHT_SEER') return isSeerDone.value ? '继续' : '确认查验';
  if (store.phase === 'NIGHT_WITCH') return '确认用药';
  return '确认';
});
const ghostLabel = computed(() => store.phase === 'NIGHT_GUARD' ? '空守' : store.phase === 'NIGHT_WITCH' ? '不用药' : '再想想');
const targetList = computed(() => {
  const wolfIds = new Set(store.wolfTeammates.map(member => member.id));
  return store.publicSeats.map(seat => {
    let disabled = !seat.alive;
    let tag = !seat.alive ? '出局' : '';
    if (store.phase === 'NIGHT_GUARD' && seat.id === store.guardLastTarget) { disabled = true; tag = '上夜'; }
    if (store.phase === 'NIGHT_GUARD' && seat.isSelf) tag = '你';
    if (store.phase === 'NIGHT_WOLF' && seat.isSelf) { disabled = true; tag = '你'; }
    if (store.phase === 'NIGHT_WOLF' && wolfIds.has(seat.id) && !seat.isSelf) { disabled = true; tag = '狼'; }
    if (store.phase === 'NIGHT_SEER' && seat.isSelf) { disabled = true; tag = '你'; }
    if (store.phase === 'NIGHT_WITCH' && seat.isSelf) { disabled = true; tag = '你'; }
    if (seat.isSelected && !disabled) tag = tag || '已选';
    return { ...seat, disabled, tag };
  });
});
const selectedTarget = computed(() => store.publicSeats.find(seat => seat.id === store.selectedSeatId));
const wolfCount = computed(() => store.wolfTeammates.filter(member => member.alive).length);
const potionLabel = computed(() => store.phase === 'NIGHT_WITCH' ? '毒药目标' : store.phase === 'NIGHT_SEER' ? '查验目标' : '当前选择');

watch(() => store.phase, () => { draft.value = ''; });

function choose(id: string, disabled: boolean) {
  if (disabled) return;
  store.selectSeat(id);
}
function confirm() {
  if (isSeerDone.value) { store.nextPhase(); return; }
  store.confirmAction();
}
function submitSpeech() {
  store.submitSpeech(draft.value);
}
</script>

<template>
  <aside :class="panelClass">
    <div v-if="isMobile" class="handle"></div>
    <div :class="isMobile ? 'sheet-head' : 'action-head'">
      <div>
        <span class="eyebrow">{{ eyebrow }}</span>
        <h2 class="action-title">{{ title }}</h2>
      </div>
      <span class="timer-ring"><span>00:18</span></span>
    </div>
    <p v-if="store.phase !== 'DAY_ANNOUNCEMENT'" class="action-quote">“{{ quote }}”</p>
    <p v-if="copy" class="action-copy">{{ copy }}</p>

    <template v-if="store.phase === 'DAY_ANNOUNCEMENT'">
      <div class="dawn-panel">
        <span class="dawn-glyph" aria-hidden="true">☾</span>
        <p>昨夜，<b>{{ deadNames || '无人出局' }}</b></p>
        <p class="dawn-sub">晨雾漫过桌面。请按顺序发言，再进入放逐投票。</p>
      </div>
      <div :class="isMobile ? 'mobile-actions' : 'action-buttons'">
        <button class="btn ghost" @click="store.setPhase('VOTE')">直接投票</button>
        <button class="btn gold" @click="store.setPhase('SPEECH')">进入发言</button>
      </div>
    </template>

    <template v-else-if="store.phase === 'SPEECH'">
      <div class="speech-compose">
        <textarea v-model="draft" maxlength="180" aria-label="你的发言" placeholder="输入你的发言，或先听完再决定……"></textarea>
        <span class="compose-count">{{ draft.length }} / 180</span>
      </div>
      <div :class="isMobile ? 'mobile-actions' : 'action-buttons'">
        <button class="btn ghost" @click="store.setPhase('VOTE')">跳过发言</button>
        <button class="btn gold" :disabled="!draft.trim()" @click="submitSpeech">提交发言</button>
      </div>
      <p v-if="store.notice" class="action-notice">{{ store.notice }}</p>
    </template>

    <template v-else-if="isWaiting">
      <div class="waiting-panel">
        <span class="waiting-orb" aria-hidden="true"><i></i></span>
        <p>你的角色尚未轮到这个阶段。</p>
        <span class="waiting-sub">公共视角不会显示是谁在行动。等待房主或阶段推进。</span>
      </div>
      <p v-if="store.notice" class="action-notice">{{ store.notice }}</p>
    </template>

    <template v-else>
      <div v-if="store.phase === 'NIGHT_WOLF'" class="wolf-team">
        <div v-for="member in store.wolfTeammates" :key="member.id" class="wolf" :class="{ dead: !member.alive }">
          <span class="w-avatar">{{ member.name }}</span>
          <div><b>{{ member.id }} · {{ member.name }}</b><span>{{ member.isSelf ? '你' : member.alive ? '狼队' : '已出局' }}</span></div>
        </div>
      </div>
      <div class="target-grid">
        <button
          v-for="target in targetList"
          :key="target.id"
          type="button"
          class="target"
          :class="{ selected: target.isSelected && !target.disabled, disabled: target.disabled }"
          :disabled="target.disabled"
          @click="choose(target.id, target.disabled)"
        >
          <span class="sid">{{ target.id }}</span>
          <span class="nm">{{ target.name }}</span>
          <span v-if="target.tag" class="tag">{{ target.tag }}</span>
        </button>
      </div>
      <div class="action-summary">
        <span class="label">{{ potionLabel }}</span>
        <span class="sum-name">{{ selectedTarget ? `${selectedTarget.id} · ${selectedTarget.name}` : '尚未选择' }}</span>
        <span class="sum-note">{{ store.phase === 'NIGHT_WOLF' ? `${wolfCount} / ${wolfCount} 狼人已选择` : store.phase === 'NIGHT_GUARD' ? '可自守' : '仅你可见' }}</span>
      </div>
      <p v-if="store.notice" class="action-notice">{{ store.notice }}</p>
      <div :class="isMobile ? 'mobile-actions' : 'action-buttons'">
        <button class="btn ghost" @click="store.nextPhase">{{ ghostLabel }}</button>
        <button class="btn gold" :disabled="!store.selectedSeatId" @click="confirm">{{ confirmLabel }}</button>
      </div>
      <div v-if="!isMobile" class="mini-id">
        <span class="mini-sigil" aria-hidden="true">◈</span>
        <div><b>{{ store.selfMeta.name }}</b><span>{{ store.selfMeta.camp === 'wolf' ? '狼人阵营' : '好人阵营' }} · 仅你可见</span></div>
        <span class="mini-lock" aria-hidden="true">⌑</span>
      </div>
    </template>
  </aside>
</template>
