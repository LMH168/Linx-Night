<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGameStore } from './stores/game';
import GameWorld from './components/GameWorld.vue';
import type { GamePhase } from './types';

const store = useGameStore();
const route = useRoute();
onMounted(() => { void store.restore(); });
const stage = computed<'launch' | 'lobby' | 'table' | 'result'>(() => {
  if (route.name === 'result') return 'result';
  if (route.name === 'lobby') return 'lobby';
  if (route.name === 'table') return 'table';
  return 'launch';
});
const worldPhase = computed<GamePhase>(() => stage.value === 'table' ? store.phase : stage.value === 'result' ? 'GAME_OVER' : 'DAY_ANNOUNCEMENT');
const deadSeatIds = computed(() => {
  if (stage.value === 'lobby' || stage.value === 'launch') return [];
  return (stage.value === 'result' ? store.revealedSeats : store.publicSeats).filter(seat => !seat.alive).map(seat => seat.id);
});
const shieldSeatId = computed(() => null);
</script>

<template>
  <GameWorld v-if="stage !== 'launch'" :stage="stage" :phase="worldPhase" :dead-seat-ids="deadSeatIds" :selected-seat-id="stage === 'table' ? store.selectedSeatId : null" :self-seat-id="store.selfSeatId" :shield-seat-id="shieldSeatId" />
  <RouterView />
</template>
