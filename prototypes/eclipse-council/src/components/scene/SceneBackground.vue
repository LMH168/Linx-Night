<script setup lang="ts">
/**
 * 场景背景调度：
 *   lobby（主页）        → 山林小屋（程序化绘制）
 *   night / day / vote   → 电影级摄影底图 + 分场景调色
 */
import { computed } from 'vue'
import CabinForest from './CabinForest.vue'
import GatheringScene from './GatheringScene.vue'

const props = defineProps<{ scene: string }>()

const isLobby = computed(() => props.scene === 'lobby')
</script>

<template>
  <div class="scene-bg" aria-hidden="true">
    <CabinForest v-if="isLobby" />
    <GatheringScene v-else :mode="scene" />
  </div>
</template>

<style scoped>
.scene-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: #05070c;
  contain: strict;
}
</style>
