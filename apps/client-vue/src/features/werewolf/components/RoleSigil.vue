<script setup lang="ts">
import type { RoleId } from '../data/roles'
defineProps<{ role: RoleId; size?: number }>()
</script>

<template>
  <svg class="sigil" :class="role" viewBox="0 0 24 24" :width="size ?? 24" :height="size ?? 24" aria-hidden="true">
    <template v-if="role === 'wolf'">
      <path d="M3.4 9.6c2.6-2.4 4.8-2.4 7.4 0" />
      <path d="M13.2 9.6c2.6-2.4 4.8-2.4 7.4 0" />
      <path d="M5.6 14.4 6.9 17l1.4-2.6L9.7 17l1.4-2.6L12.5 17l1.4-2.6L15.3 17l1.4-2.6" />
      <path d="M4 5.6c1.4 3.2 1.4 8.2 0 12.8" stroke-opacity=".45" />
    </template>
    <template v-else-if="role === 'villager'">
      <path d="M3.6 11.6 12 4l8.4 7.6" />
      <path d="M6.4 10.6V20h11.2v-9.4" />
      <path d="M9.9 20v-5.1h4.2V20" />
      <path d="M2 20.6h20" stroke-opacity=".4" />
    </template>
    <template v-else-if="role === 'seer'">
      <path d="M2.6 12s3.4-5.4 9.4-5.4S21.4 12 21.4 12s-3.4 5.4-9.4 5.4S2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.1" />
      <path d="M12 1.8v1.8M12 20.4v1.8M1.8 12h1.8M20.4 12h1.8" stroke-opacity=".5" />
    </template>
    <template v-else-if="role === 'witch'">
      <path d="M9.8 3.2h4.4v3.6l3.4 9a3 3 0 0 1-2.8 4.1H9.2a3 3 0 0 1-2.8-4.1l3.4-9z" />
      <path d="M8.1 13.4h7.8" />
      <path d="M10.2 3.2V1.9h3.6v1.3" stroke-opacity=".5" />
    </template>
    <template v-else>
      <path d="M12 2.8 19 5.8v6.1c0 4-3 6.5-7 9.1-4-2.6-7-5.1-7-9.1V5.8z" />
      <path d="M12 8.2v6.2M9.4 11h5.2" />
      <path d="M5 5.8 12 2.8l7 3" stroke-opacity=".4" />
    </template>
  </svg>
</template>

<style scoped>
.sigil {
  fill: none;
  stroke: currentColor;
  stroke-width: 0.95;
  stroke-linecap: round;
  stroke-linejoin: round;
  display: block;
}
</style>
