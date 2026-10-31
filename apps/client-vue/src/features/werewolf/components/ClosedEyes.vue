<script setup lang="ts">
defineProps<{ night?: number; phase?: string }>()
</script>

<template>
  <div class="eyes">
    <div class="veil" />
    <div class="core">
      <div class="seal">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="56" class="ring" />
          <circle cx="60" cy="60" r="47" class="ring2" />
          <path d="M74 40a24 24 0 1 0 0 40 28 28 0 0 1 0-40z" class="moon" />
          <path d="M60 14v8M60 98v8M14 60h8M98 60h8" class="rays" />
        </svg>
      </div>
      <h2>闭 眼</h2>
      <p class="sub">狼人正在行动</p>
      <div class="bar"><i :style="{ width: '38%' }" /></div>
      <p class="meta">第 {{ night ?? 1 }} 夜 · {{ phase ?? '02:41' }}</p>
    </div>
    <p class="foot">请保持安静 · 天亮后自动睁眼</p>
  </div>
</template>

<style scoped>
.eyes {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 30;
  pointer-events: none;
}
.veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 50% at 50% 46%, rgba(8, 12, 10, 0.86), rgba(3, 6, 5, 0.97) 78%),
    rgba(3, 6, 5, 0.9);
  backdrop-filter: blur(3px);
}
.core {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.seal {
  width: 168px;
  height: 168px;
  color: rgba(212, 178, 122, 0.72);
  margin-bottom: 14px;
}
.ring {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  opacity: 0.5;
}
.ring2 {
  fill: none;
  stroke: currentColor;
  stroke-width: 0.5;
  opacity: 0.28;
  stroke-dasharray: 2 5;
}
.moon {
  fill: rgba(212, 178, 122, 0.16);
  stroke: currentColor;
  stroke-width: 1;
}
.rays {
  stroke: currentColor;
  stroke-width: 1;
  opacity: 0.4;
}
h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 62px;
  font-weight: 400;
  letter-spacing: 0.5em;
  text-indent: 0.44em;
  color: #f0e9d9;
}
.sub {
  margin: 6px 0 0;
  font-size: 14px;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: rgba(236, 230, 214, 0.55);
}
.bar {
  width: 260px;
  height: 1px;
  margin-top: 26px;
  background: rgba(224, 210, 180, 0.16);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, rgba(212, 178, 122, 0.2), #d4b27a);
}
.meta {
  margin: 14px 0 0;
  font-size: 11px;
  letter-spacing: 0.26em;
  color: rgba(212, 178, 122, 0.55);
}
.foot {
  position: absolute;
  bottom: 46px;
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.24em;
  color: rgba(236, 230, 214, 0.32);
}
</style>
