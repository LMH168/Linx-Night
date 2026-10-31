<script setup lang="ts">
import { ref } from 'vue';
import { useGameStore } from '../stores/game';
import type { DemoScene, GamePhase } from '../types';

const store = useGameStore();
const open = ref(false);
const scenes: Array<{ id: DemoScene; label: string }> = [
  { id: 'speech', label: '白天发言' },
  { id: 'vote', label: '放逐投票' },
  { id: 'guard', label: '守卫夜晚' },
  { id: 'wolf', label: '狼人夜晚' },
  { id: 'seer', label: '预言家夜晚' },
  { id: 'witch', label: '女巫夜晚' },
  { id: 'result', label: '结算' },
];
const phases: GamePhase[] = ['NIGHT_GUARD', 'NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH', 'DAY_ANNOUNCEMENT', 'SPEECH', 'VOTE', 'RESULT'];
const viewpoints = [
  { id: 'P7', label: 'P7 预言家' }, { id: 'P8', label: 'P8 守卫' }, { id: 'P2', label: 'P2 狼人' }, { id: 'P5', label: 'P5 女巫' }, { id: 'P1', label: 'P1 村民' },
];
function setScene(scene: DemoScene) { store.applyScene(scene); open.value = false; }
function setPhase(event: Event) { store.setPhase((event.target as HTMLSelectElement).value as GamePhase); }
function setViewpoint(event: Event) { store.setViewpoint((event.target as HTMLSelectElement).value); }
</script>

<template>
  <div v-if="store.demoMode" class="demo-dock">
    <button class="demo-toggle" type="button" @click="open = !open">{{ open ? '收起演示' : '演示模式' }}</button>
    <div v-if="open" class="demo-panel">
      <span class="eyebrow">MOCK DRIVER · 本地剧本</span>
      <div class="demo-scenes"><button v-for="scene in scenes" :key="scene.id" type="button" @click="setScene(scene.id)">{{ scene.label }}</button></div>
      <div class="demo-row"><label>阶段<select :value="store.phase" @change="setPhase"><option v-for="phase in phases" :key="phase" :value="phase">{{ phase }}</option></select></label><label>视角<select :value="store.selfSeatId" @change="setViewpoint"><option v-for="view in viewpoints" :key="view.id" :value="view.id">{{ view.label }}</option></select></label></div>
      <button class="demo-reset" type="button" @click="store.reset()">重置演示</button>
    </div>
  </div>
</template>
