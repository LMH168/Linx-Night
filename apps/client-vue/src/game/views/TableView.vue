<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import GameHud from '../components/GameHud.vue';

const store = useGameStore();
const router = useRouter();
const route = useRoute();

onMounted(() => {
  if (store.phase === 'LOBBY') store.setPhase('SPEECH');
});
watch(() => store.phase, phase => {
  if (phase === 'RESULT' && route.name !== 'result') router.replace(`/room/${store.roomId}/result`);
}, { immediate: true });
</script>

<template>
  <div class="table-screen" aria-label="暮林山舍对局桌面">
    <GameHud />
    <p class="sr-only" role="status" aria-live="polite">{{ store.phaseTitle }}{{ store.isMyAction ? '，轮到你行动' : '' }}</p>
  </div>
</template>
