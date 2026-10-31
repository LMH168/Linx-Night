<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import ForestCabinScene from './ForestCabinScene.vue';

const emit = defineEmits<{ ready: [] }>();
const progress = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

function enter() {
  if (progress.value >= 100) emit('ready');
}

onMounted(() => {
  const startedAt = performance.now();
  timer = setInterval(() => {
    progress.value = Math.min(100, Math.round(((performance.now() - startedAt) / 1800) * 100));
    if (progress.value >= 100 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }, 40);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="forest-startup" aria-label="暮林山舍启动画面" @click="enter">
    <ForestCabinScene />
    <div class="forest-startup__grain" aria-hidden="true"></div>
    <div class="forest-startup__inner">
      <p class="forest-startup__eyebrow">PRIVATE RETREAT · 47° 12′ N</p>
      <div class="forest-startup__mark" aria-hidden="true">
        <svg viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="22.8" fill="none" stroke="currentColor" stroke-opacity=".34" stroke-width=".75" />
          <path d="M12 27.7 25 12.8l13 14.9" fill="none" stroke="currentColor" stroke-width=".95" />
          <path d="M17.3 26v10.4h15.4V26" fill="none" stroke="currentColor" stroke-width=".75" stroke-opacity=".68" />
          <path d="M22 36.4v-6.1h6v6.1" fill="none" stroke="currentColor" stroke-width=".65" stroke-opacity=".4" />
        </svg>
      </div>
      <h1 class="forest-startup__title">暮 林 山 舍</h1>
      <p class="forest-startup__sub">WALDHÜTTE · A FOREST RETREAT</p>
      <div class="forest-startup__track" aria-hidden="true"><span :style="{ width: `${progress}%` }"></span></div>
      <div class="forest-startup__status"><span>{{ progress >= 100 ? '准备就绪' : '正在进入林间' }}</span><span>{{ progress }}%</span></div>
    </div>
    <button class="forest-startup__note" type="button" :disabled="progress < 100" @click.stop="enter">点击进入 · 建议开启环境声</button>
  </section>
</template>
