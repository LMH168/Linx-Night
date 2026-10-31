<script setup lang="ts">
defineProps<{ entering: boolean }>()
const emit = defineEmits<{ (e: 'enter'): void }>()
</script>

<template>
  <section class="hero">
    <p class="kicker"><span class="cn">林间 · 暮色</span><span class="rule" /><span class="en">A QUIET TABLE IN THE WOODS</span></p>

    <h1>
      暮林<span class="second">夜宴</span><i class="index">01</i>
    </h1>

    <p class="copy">今晚，九个人，只有六个人能看见天亮。<br />一盏灯，留给先到的人。</p>

    <div class="meta-line">
      <span>九人局</span><span class="dot" /><span>3 狼</span><span class="dot" /><span>3 民</span><span class="dot" /><span>预言家</span><span class="dot" /><span>女巫</span><span class="dot" /><span>守卫</span>
    </div>

    <div class="cta">
      <button class="enter" type="button" :disabled="entering" @click="emit('enter')">
        <span>{{ entering ? '正在入席' : '进入林间' }}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" /></svg>
      </button>
      <span class="hint">第 1 夜 · 即将开始</span>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: absolute;
  left: 46px;
  top: 50%;
  transform: translateY(-48%);
  width: min(640px, 46vw);
  z-index: 10;
}

.kicker {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 0 22px;
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--gold);
  text-transform: uppercase;
}
.kicker .cn {
  font-family: var(--serif);
  font-size: 12px;
  letter-spacing: 0.24em;
  color: rgba(243, 232, 208, 0.82);
}
.kicker .rule {
  width: 40px;
  height: 1px;
  background: linear-gradient(90deg, var(--line), transparent);
}
.kicker .en {
  color: var(--ink-faint);
}

h1 {
  margin: 0;
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(56px, 7.2vw, 104px);
  line-height: 0.98;
  letter-spacing: 0.04em;
  color: var(--ink);
  text-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  position: relative;
  display: inline-block;
}
h1 .second {
  display: inline-block;
  margin-left: 0.06em;
  background: linear-gradient(175deg, #f3e3c1 8%, #d4b27a 52%, #a8864f 96%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
h1 .index {
  position: absolute;
  top: 0.55em;
  left: calc(100% + 16px);
  font-family: var(--serif);
  font-style: normal;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: var(--gold-deep);
  opacity: 0.8;
  writing-mode: vertical-rl;
}

.copy {
  margin: 26px 0 0;
  font-size: 14.5px;
  line-height: 2;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}

.meta-line {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--gold-deep);
}
.meta-line .dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.7;
}

.cta {
  margin-top: 38px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.enter {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  height: 56px;
  padding: 0 34px 0 38px;
  border-radius: 2px;
  background: linear-gradient(180deg, #e7c991, #c9a568);
  color: #17110a;
  font-size: 13px;
  letter-spacing: 0.24em;
  border: 1px solid rgba(255, 240, 210, 0.5);
  box-shadow: 0 22px 48px -22px rgba(212, 178, 122, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.45);
  transition: transform 0.4s var(--ease-out), box-shadow 0.4s var(--ease-out), filter 0.4s var(--ease-out);
}
.enter svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.1;
  transition: transform 0.4s var(--ease-out);
}
.enter:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
  box-shadow: 0 28px 60px -24px rgba(212, 178, 122, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
.enter:hover svg {
  transform: translateX(4px);
}
.enter:disabled {
  opacity: 0.6;
  pointer-events: none;
}

.hint {
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--ink-faint);
}

@media (max-width: 900px) {
  .hero {
    left: 28px;
    width: calc(100vw - 56px);
    top: auto;
    bottom: 148px;
    transform: none;
  }
  .copy,
  .meta-line {
    display: none;
  }
}
</style>
