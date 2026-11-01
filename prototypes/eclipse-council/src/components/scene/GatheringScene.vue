<script setup lang="ts">
/**
 * 对局场景背景：电影级摄影底图 + 分场景调色
 *
 * 底图是一张写实夜景（林间集会空地、雾、满月、提灯与南瓜灯、远处长桌的卡牌与蜡烛）。
 * 同一张底图靠调色区分昼夜：
 *   night → 压暗、抽暖、偏蓝紫
 *   day   → 提亮、去饱和、偏冷灰
 *   vote  → 略暗、偏紫、暖灯更突出
 * 上面再叠缓慢飘移的雾、空气中的尘埃粒子、暗角与胶片颗粒。
 */
import { computed } from 'vue'
import ParticleField from './ParticleField.vue'
import bg from '@/assets/scene/gathering.webp'

const props = defineProps<{ mode: string }>()

const particleMode = computed<'fog' | 'dust' | 'ember'>(() => {
  if (props.mode === 'night') return 'fog'
  if (props.mode === 'day') return 'dust'
  return 'ember'
})

const particleCount = computed(() => (props.mode === 'night' ? 34 : 26))
</script>

<template>
  <div class="gathering" :data-mode="mode" aria-hidden="true">
    <div class="photo" :style="{ backgroundImage: `url(${bg})` }"></div>

    <div class="haze haze--low"></div>
    <div class="haze haze--high"></div>

    <ParticleField :mode="particleMode" :count="particleCount" />

    <div class="flicker"></div>
    <div class="grade"></div>
    <div class="vignette"></div>
    <div class="grain"></div>
  </div>
</template>

<style scoped>
.gathering {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #05070d;
}

/* 底图：略大于容器，留出缓慢推移的余量（Ken Burns） */
.photo {
  position: absolute;
  inset: -5%;
  background-size: cover;
  background-position: center 56%;
  background-repeat: no-repeat;
  will-change: transform;
  animation: ken-burns 64s ease-in-out infinite alternate;
  transition: filter 900ms var(--ease);
}

/* ---------------- 分场景调色 ---------------- */
[data-mode='night'] .photo {
  filter: brightness(0.76) saturate(0.84) contrast(1.08) hue-rotate(-7deg);
}

[data-mode='day'] .photo {
  filter: brightness(1.08) saturate(0.66) contrast(0.92) hue-rotate(10deg);
}

[data-mode='vote'] .photo {
  filter: brightness(0.88) saturate(1.04) contrast(1.05) hue-rotate(9deg);
}

/* 雾：两条极慢横移的低空雾带，贴着地面走 */
.haze {
  position: absolute;
  left: -20%;
  right: -20%;
  pointer-events: none;
  background:
    radial-gradient(60% 100% at 30% 60%, rgba(150, 172, 196, 0.16), transparent 70%),
    radial-gradient(52% 90% at 70% 40%, rgba(140, 162, 188, 0.13), transparent 72%);
  will-change: transform;
}

.haze--low {
  bottom: -6%;
  height: 46%;
  animation: haze-drift 58s linear infinite alternate;
  opacity: 0.85;
}

.haze--high {
  top: 12%;
  height: 34%;
  opacity: 0.5;
  animation: haze-drift 92s linear infinite alternate-reverse;
}

/* 烛火呼吸：极轻微的全局暖光波动 */
.flicker {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(70% 60% at 46% 74%, rgba(255, 176, 108, 0.14), transparent 66%);
  animation: flicker 7.5s ease-in-out infinite;
}

/* ---------------- 后期 ---------------- */
.grade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(14, 18, 34, 0.55) 0%, transparent 46%),
    linear-gradient(
      180deg,
      rgba(6, 9, 16, 0.6) 0%,
      rgba(6, 9, 16, 0.08) 26%,
      transparent 52%,
      rgba(4, 6, 11, 0.62) 100%
    );
}

[data-mode='day'] .grade {
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(208, 220, 228, 0.34) 0%, transparent 46%),
    linear-gradient(180deg, rgba(18, 26, 30, 0.42) 0%, transparent 34%, rgba(10, 16, 18, 0.5) 100%);
}

[data-mode='vote'] .grade {
  background:
    radial-gradient(110% 70% at 50% 0%, rgba(38, 16, 46, 0.55) 0%, transparent 50%),
    linear-gradient(180deg, rgba(14, 7, 18, 0.58) 0%, transparent 30%, rgba(8, 4, 12, 0.62) 100%);
}

.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    118% 94% at 46% 44%,
    transparent 30%,
    rgba(3, 5, 9, 0.36) 68%,
    rgba(2, 3, 6, 0.82) 100%
  );
}

.grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}

@keyframes ken-burns {
  from {
    transform: scale(1) translate3d(-0.6%, 0.4%, 0);
  }
  to {
    transform: scale(1.06) translate3d(0.8%, -0.6%, 0);
  }
}

@keyframes haze-drift {
  from {
    transform: translate3d(-4%, 0, 0);
  }
  to {
    transform: translate3d(5%, -1.5%, 0);
  }
}

@keyframes flicker {
  0%,
  100% {
    opacity: 0.55;
  }
  23% {
    opacity: 0.78;
  }
  46% {
    opacity: 0.5;
  }
  71% {
    opacity: 0.86;
  }
  86% {
    opacity: 0.62;
  }
}

@media (prefers-reduced-motion: reduce) {
  .photo,
  .haze,
  .flicker {
    animation: none;
  }
}
</style>
