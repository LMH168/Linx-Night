<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { PublicConversationRecord } from '../../../../packages/protocol/src/types';
import type { GameApiClient } from '../api/client';
const props = defineProps<{ records?: PublicConversationRecord[]; selfSeatId?: string; client: GameApiClient | null; roomId: string }>();
const emit = defineEmits<{ updated: [] }>();
const drafts = reactive<Record<string, string>>({});
const busy = ref(false), error = ref('');
const visible = computed(() => (props.records || []).filter(r => r.seatId === props.selfSeatId && r.transcriptionStatus === 'failed'));
async function supplement(record: PublicConversationRecord) {
  if (!props.client || busy.value) return;
  busy.value = true; error.value = '';
  try { await props.client.supplementVoice(props.roomId, record.kind, record.id, drafts[record.id] || ''); emit('updated'); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '文字补充失败'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section v-if="visible.length" class="voice-supplement glass" aria-label="补充我的发言">
    <div v-for="record in visible" :key="record.id">
      <p>你的{{ record.kind === 'lastwords' ? '遗言' : '发言' }}未能识别，可补充文字供 AI 阅读。</p>
      <form v-if="record.transcriptionStatus === 'failed' && record.seatId === selfSeatId" @submit.prevent="supplement(record)">
        <textarea v-model="drafts[record.id]" :maxlength="record.kind === 'lastwords' ? 200 : 1200" aria-label="补充本条录音文字" placeholder="请输入刚才发言的内容，供 AI 阅读"></textarea>
        <button :disabled="busy || !drafts[record.id]?.trim()">提交补充文字</button>
      </form>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.voice-supplement { padding: 12px; font-size: 12px; }
.voice-supplement textarea { width: 100%; box-sizing: border-box; min-height: 70px; margin-bottom: 8px; }
</style>
