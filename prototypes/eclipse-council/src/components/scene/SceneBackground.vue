<script setup lang="ts">
/**
 * 场景背景调度
 *   photo  → 摄影底图 + 光时（大厅、发牌、对局、投票）
 *   forest → 程序化剪影插画（只留给结算页做片尾）
 *
 * 大厅不再换一套画法：它和对局共用同一机位，只是停在"黄昏"这一档。
 */
import type { LightKey } from '@/data/light'
import CabinForest from './CabinForest.vue'
import GatheringScene from './GatheringScene.vue'

defineProps<{ light: LightKey; variant: 'photo' | 'forest' }>()
</script>

<template>
  <div class="scene-bg" aria-hidden="true">
    <CabinForest v-if="variant === 'forest'" />
    <GatheringScene v-else :light="light" />
  </div>
</template>

<style scoped>
.scene-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--scene-bg);
  contain: strict;
}
</style>
