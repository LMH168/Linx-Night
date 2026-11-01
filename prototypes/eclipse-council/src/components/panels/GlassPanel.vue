<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    eyebrow?: string
    dense?: boolean
    glow?: boolean
  }>(),
  { title: '', eyebrow: '', dense: false, glow: false },
)
</script>

<template>
  <section class="glass" :class="{ dense, glow }">
    <span class="corner corner--tl" aria-hidden="true"></span>
    <span class="corner corner--br" aria-hidden="true"></span>
    <header v-if="title || eyebrow || $slots.actions" class="head">
      <div class="titles">
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <h2 v-if="title" class="title display">{{ title }}</h2>
      </div>
      <div class="actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="foot">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.glass {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 18px 18px 16px;
  border-radius: var(--radius);
  background:
    linear-gradient(180deg, rgba(23, 28, 39, 0.94) 0%, rgba(11, 14, 21, 0.96) 58%, rgba(7, 9, 14, 0.97) 100%);
  border: 1px solid var(--line);
  box-shadow:
    0 26px 64px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 400ms var(--ease), box-shadow 400ms var(--ease);
}

/* 顶部一道金色发丝光，比毛玻璃更贵气也更便宜 */
.glass::before {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(226, 190, 130, 0.42) 22%,
    rgba(226, 190, 130, 0.62) 50%,
    rgba(226, 190, 130, 0.42) 78%,
    transparent
  );
  pointer-events: none;
}

.glass.dense {
  padding: 12px 12px 10px;
}

.glass.glow {
  border-color: rgba(226, 190, 130, 0.28);
  box-shadow: var(--shadow-panel), 0 0 40px rgba(226, 190, 130, 0.08);
}

.corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 1px solid rgba(213, 177, 132, 0.32);
  pointer-events: none;
}

.corner--tl {
  top: 6px;
  left: 6px;
  border-right: 0;
  border-bottom: 0;
}

.corner--br {
  right: 6px;
  bottom: 6px;
  border-left: 0;
  border-top: 0;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.titles {
  min-width: 0;
  padding-left: 11px;
  border-left: 2px solid rgba(226, 190, 130, 0.45);
}

.title {
  font-size: 18px;
  letter-spacing: 0.09em;
  line-height: 1.25;
  color: var(--ink);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
</style>
