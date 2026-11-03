<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { PublicConversationRecord } from '../../../../packages/protocol/src/types';
import type { GameApiClient } from '../api/client';
const props = defineProps<{ records?: PublicConversationRecord[]; available?: boolean | null; selfSeatId?: string; client: GameApiClient | null; roomId: string }>();
const emit = defineEmits<{ updated: [] }>();
const drafts = reactive<Record<string, string>>({});
const busy = ref(false), error = ref('');
const visible = computed(() => (props.records || []).filter(r => r.audioId));
async function supplement(record: PublicConversationRecord) {
  if (!props.client || busy.value) return;
  busy.value = true; error.value = '';
  try { await props.client.supplementVoice(props.roomId, record.kind, record.id, drafts[record.id] || ''); emit('updated'); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '文字补充失败'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section v-if="available === false || visible.length" aria-label="公开语音文字状态">
    <p v-if="available === false" role="status">AI 暂时无法获得语音文字，请补充文字。原声仍可实时收听。</p>
    <div v-for="record in visible" :key="record.id">
      <p>{{ record.seatId }} {{ record.kind === 'lastwords' ? '遗言' : '发言' }}：{{ record.transcriptionStatus === 'failed' ? '内容未识别，原声已保留' : record.textSource === 'player_supplement' ? '玩家补充' : record.transcriptionStatus === 'completed' ? '语音文字已确认' : '原声已提交，正在整理文字' }}</p>
      <p v-if="record.transcriptionStatus === 'completed'">{{ record.text }}</p>
      <form v-if="record.transcriptionStatus === 'failed' && record.seatId === selfSeatId" @submit.prevent="supplement(record)">
        <textarea v-model="drafts[record.id]" :maxlength="record.kind === 'lastwords' ? 200 : 1200" aria-label="补充本条录音文字" placeholder="请输入刚才发言的内容，供 AI 阅读"></textarea>
        <button :disabled="busy || !drafts[record.id]?.trim()">提交补充文字</button>
      </form>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
