<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useGameStore } from '@/stores/game'
import { seatPick, startPick, stopPick } from '@/composables/useSeatPick'
import CountdownBar from './CountdownBar.vue'

const game = useGameStore()
const request = computed(() => game.request)
const draft = ref('')
const recording = ref<'idle' | 'recording' | 'transcribing' | 'draft'>('idle')
let recordTimer: ReturnType<typeof setTimeout> | undefined
function record() {
  if (recording.value === 'recording') {
    recording.value = 'transcribing'
    recordTimer = setTimeout(() => { draft.value = '我认为需要结合前面几位的发言判断，暂时不急于下结论。'; recording.value = 'draft' }, 650)
  } else recording.value = 'recording'
}
onBeforeUnmount(() => clearTimeout(recordTimer))
const witchPending = computed(() => seatPick.active && seatPick.mode === 'poison')

const seat = computed(() => request.value?.seat ?? 0)
const playerName = computed(
  () => game.state?.players.find((p) => p.seat === seat.value)?.name ?? '',
)

const isSpeech = computed(() => request.value?.kind === 'speech')
const isLastWords = computed(() => request.value?.kind === 'last-words')
const isVerdict = computed(() => request.value?.kind === 'seer-result')
const isWitch = computed(() => request.value?.kind === 'witch-action')

const seconds = computed(() => Number(request.value?.payload.seconds ?? 30))
const pk = computed(() => request.value?.payload.pk === true)

const witch = computed(() => (isWitch.value ? request.value!.payload : null))
const victim = computed(() => (witch.value?.victim == null ? null : Number(witch.value.victim)))
const canSave = computed(() => witch.value?.canSave === true)
const canPoison = computed(() => witch.value?.canPoison === true)
const saveBlocked = computed(() => (witch.value?.saveBlockedReason as string | null) ?? null)
const poisonBlocked = computed(() => (witch.value?.poisonBlockedReason as string | null) ?? null)
const witchCandidates = computed(() => (witch.value?.candidates as number[] | undefined) ?? [])

const verdict = computed(() => {
  const payload = request.value?.payload
  return payload?.verdict === 'wolf' ? 'wolf' : 'good'
})
const verdictSeat = computed(() => Number(request.value?.payload.target ?? 0))

const quickPhrases = computed(() =>
  pk.value
    ? ['我站这儿只有一个理由。', '我该说的说完了，票在你们手里。']
    : [
        '我是好人，这轮先把我放下。',
        '我怀疑的人是——',
        '我把票留到最后，先听后面。',
        '别分票，今天必须有人走。',
      ],
)

watch(
  request,
  (value) => {
    stopPick()
    clearTimeout(recordTimer)
    recording.value = 'idle'
    draft.value = ''
    if (!value) return
    const payload = value.payload
    switch (value.kind) {
      case 'wolf-target':
        startPick({
          candidates: payload.candidates as number[],
          mode: 'wolf',
          label: `狼人行动 · 选择今夜要击杀的目标`,
          onConfirm: (target) => game.respond(target),
        })
        break
      case 'seer-check':
        startPick({
          candidates: payload.candidates as number[],
          mode: 'seer',
          label: '预言家行动 · 选择要查验的对象',
          onConfirm: (target) => game.respond(target),
        })
        break
      case 'vote':
        startPick({
          candidates: payload.candidates as number[],
          mode: 'vote',
          label: '放逐投票 · 选择你要投出的人',
          allowNone: false,
          onConfirm: (target) => game.respond(target),
        })
        break
      case 'hunter-shot':
        startPick({
          candidates: payload.candidates as number[],
          mode: 'hunter',
          label: '猎人开枪 · 选择带走一名存活玩家',
          allowNone: true,
          onConfirm: (target) => game.respond(target),
        })
        break
      default:
        break
    }
  },
  { immediate: true },
)

function submitSpeech(): void {
  if (recording.value === 'recording' || recording.value === 'transcribing') return
  game.respond(draft.value)
}

function timeoutSpeech(): void {
  game.respond('')
}

function appendPhrase(phrase: string): void {
  draft.value = (draft.value ? `${draft.value}${phrase}` : phrase).slice(0, 200)
}

function useAntidote(): void {
  game.respond({ save: true, poison: null })
}

function usePoison(): void {
  startPick({
    candidates: witchCandidates.value,
    mode: 'poison',
    label: '毒药 · 选择要毒杀的玩家',
    onCancel: () => {
      /* 取消后回到女巫面板 */
    },
    onConfirm: (target) => {
      if (target == null) return
      game.respond({ save: false, poison: target })
    },
  })
}

function noPotion(): void {
  game.respond({ save: false, poison: null })
}
</script>

<template>
  <div>
    <div v-if="request?.kind==='hunter-shot'" class="hunter-clock"><CountdownBar :seconds="30" @timeout="game.respond(null)" /><p>仅你可见 · 30 秒内开枪，超时视为放弃</p></div>
    <!-- 白天 / PK 发言 -->
    <Transition name="modal">
      <div v-if="isSpeech" class="veil" @click.self>
        <section class="card" role="dialog" aria-modal="true" aria-label="发言">
          <header class="head">
            <div>
              <p class="eyebrow">{{ pk ? '平票 PK' : `第 ${game.state?.round ?? 1} 日` }} · 轮到你</p>
              <h2 class="display title">
                {{ seat }} 号{{ playerName ? `「${playerName}」` : '' }} 发言
              </h2>
            </div>
            <span class="tag">发言</span>
          </header>

          <CountdownBar :key="game.flow.deadline" :seconds="seconds" @timeout="timeoutSpeech" />

          <textarea
            v-model="draft"
            class="editor"
            rows="4"
            maxlength="200"
            placeholder="把你想说的写下来。空着提交也可以——沉默同样是一种态度。"
          ></textarea>

          <div class="voice-demo"><button type="button" :disabled="recording === 'transcribing'" @click="record">{{recording==='recording'?'结束模拟录音':recording==='transcribing'?'模拟转写中…':'模拟录音'}}</button><span>{{recording==='draft'?'转写仅生成草稿，请编辑后确认提交':recording==='recording'?'模拟录音中，点击结束':'也可直接输入文字'}}</span></div>
          <div class="chips">
            <button
              v-for="phrase in quickPhrases"
              :key="phrase"
              class="chip"
              type="button"
              @click="appendPhrase(phrase)"
            >
              {{ phrase }}
            </button>
          </div>

          <footer class="foot">
            <span class="counter">{{ draft.length }} / 200</span>
            <button class="primary" type="button" :disabled="recording==='recording' || recording==='transcribing'" @click="submitSpeech">确认并结束发言</button>
          </footer>
        </section>
      </div>
    </Transition>

    <!-- 遗言 -->
    <Transition name="modal">
      <div v-if="isLastWords" class="veil" @click.self>
        <section class="card" role="dialog" aria-modal="true" aria-label="遗言">
          <header class="head">
            <div>
              <p class="eyebrow">遗言 · 最后一次开口</p>
              <h2 class="display title">{{ seat }} 号{{ playerName ? `「${playerName}」` : '' }}</h2>
            </div>
            <span class="tag tag--dead">出局</span>
          </header>

          <CountdownBar :key="game.flow.deadline" :seconds="seconds" tone="cold" @timeout="timeoutSpeech" />

          <textarea
            v-model="draft"
            class="editor"
            rows="3"
            maxlength="200"
            placeholder="留下你的判断，或者只留一句狠话。"
          ></textarea>

          <footer class="foot">
            <span class="counter">{{ draft.length }} / 200</span>
            <button class="ghost" type="button" @click="game.respond('')">放弃遗言</button><button class="primary" type="button" @click="submitSpeech">提交遗言</button>
          </footer>
        </section>
      </div>
    </Transition>

    <!-- 查验结果 -->
    <Transition name="modal">
      <div v-if="isVerdict" class="veil" @click.self>
        <section class="card card--narrow" role="dialog" aria-modal="true" aria-label="查验结果">
          <p class="eyebrow">只有你看得见</p>
          <div class="verdict" :class="verdict">
            <span class="v-seat display">{{ verdictSeat }}</span>
            <span class="v-text display">
              {{ verdict === 'wolf' ? '狼人' : '好人' }}
            </span>
          </div>
          <p class="v-hint">
            {{ verdict === 'wolf'
              ? '他属于狼人阵营。明天的发言里，你只有一次机会把这件事说清楚。'
              : '他属于好人阵营。暂时可以把他从怀疑名单里划掉。' }}
          </p>
          <button class="primary" type="button" @click="game.respond(true)">记住了</button>
        </section>
      </div>
    </Transition>

    <!-- 女巫 -->
    <Transition name="modal">
      <div v-if="isWitch && !witchPending" class="veil" @click.self>
        <section class="card card--narrow" role="dialog" aria-modal="true" aria-label="女巫行动">
          <header class="head head--stack">
            <p class="eyebrow">女巫行动</p>
            <h2 class="display title">两瓶药，两次改命</h2>
          </header>

          <div class="victim">
            <span class="v-label">今夜死者</span>
            <span v-if="victim != null" class="v-value">{{ victim }} 号</span>
            <span v-else class="v-value muted">无法得知</span>
          </div>

          <p v-if="!victim && saveBlocked" class="note">{{ saveBlocked }}</p>

          <div class="potions">
            <button
              class="potion potion--save"
              type="button"
              :disabled="!canSave"
              :title="saveBlocked ?? '救下今夜死者'"
              @click="useAntidote"
            >
              <span class="p-dot p-dot--blue"></span>
              <span class="p-name">解药</span>
              <span class="p-state">{{ canSave ? '可用' : '不可用' }}</span>
            </button>
            <button
              class="potion potion--poison"
              type="button"
              :disabled="!canPoison"
              :title="poisonBlocked ?? '毒杀一名玩家'"
              @click="usePoison"
            >
              <span class="p-dot p-dot--purple"></span>
              <span class="p-name">毒药</span>
              <span class="p-state">{{ canPoison ? '可用' : '不可用' }}</span>
            </button>
          </div>

          <p v-if="saveBlocked || poisonBlocked" class="note">
            {{ saveBlocked ?? poisonBlocked }}
          </p>
          <p class="note note--quiet">同一夜不能同时开启解药与毒药；两瓶药各限一次。</p>

          <button class="ghost wide" type="button" @click="noPotion">今夜不用药</button>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(2, 4, 7, 0.78);
}

.card {
  width: min(540px, 100%);
  padding: 22px;
  border-radius: var(--radius-l);
  border: 1px solid rgba(213, 177, 132, 0.24);
  background: linear-gradient(180deg, rgba(15, 19, 27, 0.97), rgba(6, 8, 12, 0.99));
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.72);
  animation: pop-in 300ms var(--ease-out) both;
}

.card--narrow {
  width: min(420px, 100%);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.head--stack {
  display: block;
  text-align: center;
  margin-bottom: 4px;
}

.title {
  font-size: 18px;
  letter-spacing: 0.06em;
  margin-top: 3px;
}

.tag {
  flex: 0 0 auto;
  font-size: 10px;
  letter-spacing: 0.2em;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--ink-3);
}

.tag--dead {
  color: #dba199;
  border-color: rgba(194, 90, 78, 0.4);
}

.editor {
  width: 100%;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.03);
  color: var(--ink);
  font-size: 13.5px;
  line-height: 1.8;
  resize: vertical;
  outline: none;
  transition: border-color 220ms var(--ease);
}

.editor:focus {
  border-color: rgba(213, 177, 132, 0.5);
  background: rgba(255, 255, 255, 0.045);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chip {
  font-size: 11.5px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--ink-3);
  transition: color 200ms, border-color 200ms;
}

.chip:hover {
  color: var(--gold-text);
  border-color: rgba(213, 177, 132, 0.42);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}

.counter {
  font-size: 11px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.primary {
  padding: 9px 22px;
  border-radius: 10px;
  font-size: 12.5px;
  letter-spacing: 0.1em;
  color: #1a1206;
  background: linear-gradient(180deg, #f0d6ac, #c9a169);
  transition: transform 200ms var(--ease);
}

.primary:hover {
  transform: translateY(-1px);
}

.verdict {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin: 6px 0;
}

.v-seat {
  font-size: 40px;
  line-height: 1;
  color: var(--ink-2);
}

.v-text {
  font-size: 30px;
  letter-spacing: 0.2em;
}

.verdict.wolf .v-text {
  color: #d97f74;
  text-shadow: 0 0 26px rgba(217, 127, 116, 0.35);
}

.verdict.good .v-text {
  color: #9fd2bd;
  text-shadow: 0 0 26px rgba(159, 210, 189, 0.3);
}

.v-hint {
  font-size: 12px;
  line-height: 1.85;
  color: var(--ink-3);
  max-width: 34ch;
}

.victim {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(213, 177, 132, 0.14);
  background: rgba(213, 177, 132, 0.04);
  width: 100%;
}

.v-label {
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--ink-3);
}

.v-value {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--gold-text);
  letter-spacing: 0.08em;
}

.v-value.muted {
  color: var(--ink-3);
  font-size: 14px;
}

.potions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: 100%;
  margin-top: 4px;
}

.potion {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 220ms, background 220ms, transform 220ms;
}

.potion:not(:disabled):hover {
  transform: translateY(-2px);
}

.potion:disabled {
  opacity: 0.4;
}

.potion--save:not(:disabled):hover {
  border-color: rgba(120, 168, 226, 0.5);
  background: rgba(120, 168, 226, 0.08);
}

.potion--poison:not(:disabled):hover {
  border-color: rgba(170, 120, 226, 0.5);
  background: rgba(170, 120, 226, 0.08);
}

.p-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  box-shadow: inset 0 0 8px rgba(255, 255, 255, 0.4);
}

.p-dot--blue {
  background: radial-gradient(circle at 35% 30%, #bcd9ff, #3f6ea8);
}

.p-dot--purple {
  background: radial-gradient(circle at 35% 30%, #d8b8ff, #5a3a86);
}

.p-name {
  font-size: 13px;
  letter-spacing: 0.12em;
  color: var(--ink);
}

.p-state {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ink-3);
}

.note {
  font-size: 11px;
  color: #dba199;
  text-align: center;
}

.note--quiet {
  color: var(--ink-3);
}

.ghost {
  padding: 9px 18px;
  border-radius: 10px;
  border: 1px solid var(--line);
  font-size: 12px;
  color: var(--ink-2);
  transition: border-color 200ms, color 200ms;
}

.ghost:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.wide {
  width: 100%;
  margin-top: 4px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 240ms var(--ease);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>

<style scoped>.voice-demo{display:flex;align-items:center;gap:12px;margin:10px 0;font-size:10px;color:var(--ink-3)}.voice-demo button{border:1px solid var(--gold-soft);padding:6px 10px;border-radius:6px;color:var(--gold-text)}.hunter-clock{position:fixed;bottom:150px;left:50%;transform:translateX(-50%);width:min(470px,90vw);padding:14px;background:#0b111cf5;border:1px solid var(--gold-soft);border-radius:10px;z-index:41}.hunter-clock p{font-size:11px;color:var(--gold-text)}</style>
