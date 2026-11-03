<script setup lang="ts">
import GatheringScene from './GatheringScene.vue'
import type { LightKey } from '../../data/light'
defineProps<{ light: LightKey; reduced?: boolean }>()
</script>
<template><div class="scene-background" aria-hidden="true"><GatheringScene :light="light" :reduced="reduced" /></div></template>
<style scoped>.scene-background{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}</style>
