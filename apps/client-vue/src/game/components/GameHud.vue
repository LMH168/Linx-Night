<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useGameStore } from '../stores/game';
import { PHASE_LABEL, ROLE_CATALOG } from '../types';
import BrandMark from './BrandMark.vue';
import ActionPanel from './ActionPanel.vue';
import DemoBar from './DemoBar.vue';

const store = useGameStore();
const isMobile = ref(false);
const showRules = ref(false);
const tintPalette = ['#8e9b79', '#9b6a5d', '#a89a6b', '#8d7d68', '#738b6a', '#8a5d5d', '#769b96', '#b08a55', '#786b5c'];

const updateViewport = () => { isMobile.value = window.innerWidth < 760; };
onMounted(() => { updateViewport(); window.addEventListener('resize', updateViewport); });
onBeforeUnmount(() => window.removeEventListener('resize', updateViewport));

const currentSpeakerName = computed(() => store.currentSpeaker ? `${store.currentSpeaker.id} · ${store.currentSpeaker.name}` : '等待投票');
const selectedSeat = computed(() => store.publicSeats.find(seat => seat.id === store.selectedSeatId));
const leaderSeat = computed(() => {
  const row = store.leader; if (!row) return null;
  return store.publicSeats.find(seat => seat.id === row.seatId) || null;
});
const maxVotes = computed(() => Math.max(1, ...store.voteTally.map(row => row.votes)));
const phaseShort = computed(() => {
  if (store.phase === 'VOTE') return `第 ${store.day} 天 · 投票`;
  if (store.phase === 'SPEECH') return `第 ${store.day} 天 · 发言`;
  if (store.phase === 'DAY_ANNOUNCEMENT') return `第 ${store.day} 天 · 天亮`;
  if (store.night) return `第 ${store.day} 夜`;
  return PHASE_LABEL[store.phase];
});
const sceneLabel = computed(() => store.night ? '山舍前厅 · 夜幕' : '山舍前厅 · 长桌');
const roundName = computed(() => store.night ? `第${store.day}夜` : `第${store.day}天`);
const roundEn = computed(() => store.night ? `NIGHT ${String(store.day).padStart(2, '0')}` : `DAY ${String(store.day).padStart(2, '0')}`);
const steps = computed(() => {
  if (store.night) return [
    { cn: '入夜', en: 'DUSK', note: '已入夜', state: 'done' },
    { cn: PHASE_LABEL[store.phase], en: 'RITE', note: '进行中', state: 'active' },
    { cn: '天亮', en: 'DAWN', note: '待开始', state: '' },
  ];
  return [
    { cn: '天亮', en: 'DAWN', note: '06:12', state: 'done' },
    { cn: '发言', en: 'SPEECH', note: store.phase === 'SPEECH' ? '进行中' : '已结束', state: store.phase === 'SPEECH' ? 'active' : 'done' },
    { cn: '投票', en: 'VOTE', note: store.phase === 'VOTE' ? '进行中' : '待开始', state: store.phase === 'VOTE' ? 'active' : '' },
  ];
});
const nightNote = computed(() => {
  if (!store.night) return '';
  if (store.isMyAction) return `${store.selfMeta.name}已睁眼`;
  return '山舍已入夜';
});
const miniTimeline = computed(() => {
  const rows = ['首夜 · P4 棠 出局', '第一日 · P9 溪 被放逐'];
  if (store.phase === 'SPEECH' || store.phase === 'VOTE' || store.phase === 'DAY_ANNOUNCEMENT') rows.push('昨夜 · P2 砚 出局');
  else rows.push('今夜 · 请选择行动');
  return rows;
});
const seatState = (seat: typeof store.publicSeats[number]) => {
  if (!seat.alive) return '出局';
  if (seat.isSpeaking) return '发言中';
  if (seat.isSelf) return '你';
  if (seat.isSelected) return '已选';
  if (store.phase === 'VOTE' && seat.voted) return '已投';
  if (store.night) return '沉睡';
  return '在听';
};
const canVote = computed(() => store.phase === 'VOTE' && !store.voteSubmitted && Boolean(store.selectedSeatId));
const showAction = computed(() => store.night || store.phase === 'DAY_ANNOUNCEMENT' || (store.phase === 'SPEECH' && store.isMyAction));
const showSpeech = computed(() => store.phase === 'SPEECH' && !store.isMyAction);
const showVote = computed(() => store.phase === 'VOTE');
const checkRows = computed(() => store.seerChecks.slice(0, 2));
const wolfRows = computed(() => store.wolfTeammates.slice(0, 3));

function castVote() { store.confirmAction(); }
function publishVote() { store.setPhase('RESULT'); }
function copyRoom() { navigator.clipboard?.writeText(store.roomId).catch(() => undefined); }
</script>

<template>
  <div class="game-ui" :class="[isMobile ? 'mobile' : 'desktop', store.night ? 'night' : 'day', { vote: showVote }]">
    <div class="grain"></div><div class="vignette"></div><div v-if="!isMobile" class="frame-line"></div>

    <header class="topbar">
      <BrandMark />
      <div v-if="!isMobile" class="top-meta">
        <span class="meta-item room"><span class="micro">ROOM</span><b>{{ store.roomId }}</b><button class="copy" aria-label="复制房间号" @click="copyRoom"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="11" rx="1.5" /><path d="M6 16H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 4h8a1.5 1.5 0 0 1 1.5 1.5V6" /></svg></button></span>
        <span class="meta-divider"></span>
        <span class="meta-item phase"><span class="status-dot"></span><span>{{ store.phaseTitle }}</span></span>
        <span class="meta-divider"></span>
        <span class="meta-item connect">已连接</span>
        <button class="icon-btn sound" aria-label="环境声"><span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i></span></button>
        <button class="icon-btn" aria-label="设置"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.1" /><path d="M12 3.3v2.2M12 18.5v2.2M20.7 12h-2.2M5.5 12H3.3M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5 5.9 5.9" /></svg></button>
        <button class="icon-btn" aria-label="帮助" @click="showRules = !showRules"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" /><path d="M9.7 9.4a2.4 2.4 0 0 1 4.7.7c0 1.7-2.4 1.8-2.4 3.4" /><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none" /></svg></button>
      </div>
      <div v-else class="mobile-top-right">
        <span class="phase-pill">{{ phaseShort }}</span>
        <span class="mobile-role-pill">{{ store.selfSeat.id }} · {{ store.selfMeta.name }}</span>
        <button class="icon-btn sound" aria-label="环境声"><span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i></span></button>
      </div>
    </header>

    <aside v-if="!isMobile" class="phase-rail" :class="{ 'night-rail': store.night }">
      <p class="eyebrow">SCENE 02 <span>/</span> 山舍前厅</p>
      <div class="round-line">
        <span class="round-num">{{ String(store.day).padStart(2, '0') }}</span>
        <div class="round-name"><b>{{ roundName }}</b><span>{{ roundEn }}</span></div>
      </div>
      <div class="moon-line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.2 14.2A7.7 7.7 0 0 1 9.8 4.8a8 8 0 1 0 9.4 9.4Z" /></svg><span>{{ store.night ? '月相 · 上弦' : '月相 · 下弦' }}</span><span class="moon-rule"></span><span>{{ store.night ? '00:18' : '18:42' }}</span></div>
      <div v-if="store.night" class="night-note"><span class="pulse"></span><span>{{ nightNote }}</span><span class="night-sub">其余人沉睡</span></div>
      <div class="steps">
        <div v-for="step in steps" :key="step.cn" class="step" :class="step.state">
          <span class="step-dot"></span><span class="step-cn">{{ step.cn }}</span><span class="step-en">{{ step.en }}</span><span class="step-note">{{ step.note }}</span>
        </div>
      </div>
      <div class="alive-block">
        <div class="alive-top"><span class="eyebrow">ALIVE</span><span class="alive-num">{{ store.aliveCount }}<span> / 9</span></span></div>
        <div class="pips"><i v-for="seat in store.publicSeats" :key="seat.id" class="pip" :class="{ on: seat.alive }"></i></div>
        <div class="mini-timeline"><div v-for="row in miniTimeline" :key="row"><span class="t-dot" :class="row.startsWith('第一') ? 'gold' : row.startsWith('今夜') ? 'pale' : 'dusk'"></span>{{ row }}</div></div>
      </div>
    </aside>

    <aside v-if="!isMobile" class="identity panel">
      <div class="identity-top"><span class="eyebrow">PRIVATE DOSSIER · 仅你可见</span><span class="lock" aria-hidden="true">⌑</span></div>
      <div class="role-art">
        <img :src="store.selfMeta.full" :alt="store.selfMeta.name" />
        <div class="art-shade"></div>
        <div class="art-title"><span class="eyebrow">{{ store.selfMeta.en }}</span><h2>{{ store.selfMeta.name }}</h2><span class="camp" :class="store.selfMeta.camp">{{ store.selfMeta.camp === 'wolf' ? '狼人阵营' : '好人阵营' }}</span></div>
      </div>
      <div class="identity-body">
        <p class="quote">“{{ store.selfMeta.quote }}”</p>
        <div class="info-row"><span class="label">能力 / ABILITY</span><span class="info-text">{{ store.selfMeta.ability }}</span></div>
        <div v-if="store.selfRole === 'seer'" class="check-box">
          <div class="check-head"><span class="label">查验记录</span><span class="check-count">{{ store.seerChecks.length }} 次</span></div>
          <div v-for="check in checkRows" :key="check.targetSeatId" class="check-row"><i class="sigil" :class="check.result === 'wolf' ? 'wolf' : 'good'"></i><span>{{ check.targetSeatId }} · {{ store.publicSeats.find(seat => seat.id === check.targetSeatId)?.name }}</span><b :class="check.result === 'wolf' ? 'bad' : 'ok'">{{ check.result === 'wolf' ? '狼人' : '好人' }}</b><span class="check-round">第{{ check.night }}夜</span></div>
        </div>
        <div v-else-if="store.selfRole === 'werewolf'" class="check-box">
          <div class="check-head"><span class="label">狼队</span><span class="check-count">{{ wolfRows.length }} 人</span></div>
          <div v-for="member in wolfRows" :key="member.id" class="check-row"><i class="sigil wolf"></i><span>{{ member.id }} · {{ member.name }}</span><b class="bad">{{ member.isSelf ? '你' : member.alive ? '狼' : '出局' }}</b></div>
        </div>
        <div v-else class="check-box">
          <div class="check-head"><span class="label">本局记录</span><span class="check-count">仅你可见</span></div>
          <div class="check-row"><i class="sigil good"></i><span>{{ store.selfRole === 'guard' ? `上夜守护 ${store.guardLastTarget}` : store.selfRole === 'witch' ? '解药 · 未使用' : '没有夜间技能' }}</span><b class="ok">{{ store.selfRole === 'guard' ? '守卫' : store.selfRole === 'witch' ? '毒药 · 未使用' : '村民' }}</b></div>
        </div>
        <div class="identity-foot"><span>身份牌 · 不可转让</span><span class="tiny">SEAT {{ store.selfSeat.id }}</span></div>
      </div>
    </aside>

    <section v-if="showSpeech && !isMobile" class="speech">
      <div class="speech-head"><span class="speaker"><span class="sp-dot"></span>{{ currentSpeakerName }}</span><span class="speech-meta">DAY {{ String(store.day).padStart(2, '0') }} · 顺序发言</span><span class="speech-timer"><span class="timer-num">00:42</span><span class="timer-label">剩余</span></span></div>
      <p class="speech-text">“{{ store.speech }}”</p>
      <div class="speech-foot"><span class="live"><span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span>正在聆听</span></span><span class="hint">点击座位准备投票 · 轮到你时在右侧发言</span></div>
    </section>

    <section v-if="showVote && !isMobile" class="vote-dock">
      <div class="vote-head"><span class="eyebrow">EXILE VOTE <span>/</span> 放逐投票</span><span class="vote-status"><i></i>{{ store.voteSubmitted ? `${store.totalVotes} / ${store.aliveCount} 已投 · 即将公布` : `等待你的票 · ${store.totalVotes} / ${store.aliveCount}` }}</span><span class="timer-ring"><span>00:09</span></span></div>
      <div class="vote-main">
        <div class="vote-lead"><span class="label">当前最高票</span><div class="lead-name"><b>{{ leaderSeat?.id }}</b><span>{{ leaderSeat?.name }}</span></div><span class="lead-note">{{ store.leader?.votes }} 票</span></div>
        <div class="tally">
          <div v-for="row in store.voteTally" :key="row.seatId" class="tally-row" :class="{ lead: row.seatId === store.leader?.seatId }"><span class="t-name">{{ row.seatId }} · {{ store.publicSeats.find(seat => seat.id === row.seatId)?.name }}</span><span class="t-bar"><i :style="{ width: `${Math.max(5, row.votes / maxVotes * 100)}%` }"></i></span><span class="t-count">{{ row.votes }}</span></div>
        </div>
        <div class="vote-action">
          <button v-if="!store.voteSubmitted" class="btn ghost" @click="store.setPhase('RESULT')">弃票</button>
          <button v-if="!store.voteSubmitted" class="btn gold" :disabled="!canVote" @click="castVote">投给 {{ selectedSeat ? `${selectedSeat.id} · ${selectedSeat.name}` : '…' }}</button>
          <button v-if="store.voteSubmitted" class="btn ghost">查看票型</button>
          <button v-if="store.voteSubmitted" class="btn gold" @click="publishVote">公布票型</button>
        </div>
      </div>
      <div class="vote-foot"><span>平票则无人出局；本轮不产生放逐。</span><span class="vote-hint">房主可提前公布</span></div>
    </section>

    <footer v-if="!isMobile" class="seat-rail">
      <button v-for="(seat, index) in store.publicSeats" :key="seat.id" type="button" class="seat" :class="{ dead: !seat.alive, self: seat.isSelf, speaking: seat.isSpeaking, selected: seat.isSelected }" :style="{ '--tint': tintPalette[index] }" @click="store.selectSeat(seat.id)">
        <span class="avatar"><span class="initial">{{ seat.initial }}</span><span class="ring"></span></span>
        <span class="seat-meta"><span class="sid">{{ seat.id }}</span><span class="name">{{ seat.name }}</span><span class="seat-state">{{ seatState(seat) }}</span></span>
        <span v-if="showVote && seat.voteCount > 0 && seat.alive" class="vote-badge">{{ seat.voteCount }}</span>
        <span v-if="!seat.alive" class="slash"></span>
      </button>
      <div class="rail-actions"><button class="rail-btn" @click="showRules = !showRules"><span>公开记录</span><span class="count">12</span></button><button class="rail-btn"><span>视角</span><span class="chev">⌄</span></button></div>
    </footer>

    <div v-if="isMobile" class="mobile-scene-label"><span class="status-dot"></span>{{ sceneLabel }}</div>
    <div v-if="isMobile" class="seat-strip">
      <button v-for="seat in store.publicSeats" :key="seat.id" type="button" class="mini-seat" :class="{ dead: !seat.alive, self: seat.isSelf, selected: seat.isSelected }" @click="store.selectSeat(seat.id)"><span class="sid">{{ seat.id }}</span><span class="initial">{{ seat.initial }}</span><span class="state">{{ !seat.alive ? '出局' : seat.isSelf ? '你' : seat.isSelected ? '选' : '' }}</span></button>
    </div>
    <div v-if="isMobile && showSpeech" class="mobile-speech">“{{ store.speech }}”</div>

    <section v-if="isMobile && showVote" class="sheet mobile-vote-sheet">
      <div class="handle"></div>
      <div class="sheet-head"><div><span class="eyebrow">EXILE VOTE · 放逐投票</span><h2 class="action-title">{{ selectedSeat ? `投给 ${selectedSeat.id} · ${selectedSeat.name}` : '选择放逐对象' }}</h2></div><span class="timer-ring"><span>00:09</span></span></div>
      <div class="mobile-tally"><div v-for="row in store.voteTally" :key="row.seatId" class="tally-row" :class="{ lead: row.seatId === store.leader?.seatId }"><span class="t-name">{{ row.seatId }} · {{ store.publicSeats.find(seat => seat.id === row.seatId)?.name }}</span><span class="t-bar"><i :style="{ width: `${Math.max(5, row.votes / maxVotes * 100)}%` }"></i></span><span class="t-count">{{ row.votes }}</span></div></div>
      <div class="mobile-actions"><button class="btn ghost" @click="store.setPhase('RESULT')">弃票</button><button class="btn gold" :disabled="!canVote" @click="castVote">确认投票</button></div>
      <p class="sheet-foot">平票则无人出局 · 本轮不产生放逐</p>
    </section>

    <ActionPanel v-if="showAction && !isMobile" mode="desktop" />
    <ActionPanel v-if="showAction && isMobile" mode="mobile" />
    <DemoBar />

    <div v-if="showRules" class="rules-pop" role="dialog" aria-label="本局规则">
      <div class="rules-head"><span class="eyebrow">NINE PLAYERS · 预女守</span><button class="text-btn" @click="showRules = false">关闭</button></div>
      <p>3 狼人 · 3 村民 · 预言家 · 女巫 · 守卫。无猎人、无警长。</p>
      <p>夜晚顺序：守卫 → 狼人 → 预言家 → 女巫。同守同救目标出局；女巫首夜可自救。</p>
      <p>白天顺序发言，随后放逐投票；最高票出局，平票无人出局。狼人达到人数 parity 或好人放逐全部狼人时结束。</p>
    </div>
    <div class="corner-note">{{ store.night ? 'WALDHÜTTE · PRIVATE RITE 02' : 'WALDHÜTTE · FIELD RECORDING 02' }}</div>
  </div>
</template>
