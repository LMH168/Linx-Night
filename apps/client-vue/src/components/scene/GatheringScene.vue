<script setup lang="ts">
/**
 * 对局场景背景：同一张摄影底图 + 四档"光时"
 *
 * 性能约定（这版刻意做减法）：
 *   · 底图滤镜是**静态**的，只画一次；换光不碰 filter，不触发全屏重绘。
 *   · 每档光是一层固定的渐变（wash），换光只改 opacity —— 全部交给合成器。
 *   · 不用 backdrop-filter、不用 mix-blend-mode、不做逐帧改色。
 *   · 雾只动 transform，灯火只动 opacity，颗粒完全静止。
 */
import { computed } from 'vue'
import ParticleField from './ParticleField.vue'
import { LIGHT_LOOKS, type LightKey } from '../../data/light'
import bg from '../../assets/scene/gathering.webp'

const props = defineProps<{ light: LightKey; reduced?: boolean }>()

const look = computed(() => LIGHT_LOOKS[props.light])
const photoStyle = { backgroundImage: `url(${bg})` }
</script>

<template>
  <div class="gathering" :data-light="light" :class="{ reduced }" aria-hidden="true">
    <div class="photo-move">
      <div class="photo" :style="photoStyle"></div>
    </div>

    <div class="haze haze--low"></div>
    <div class="haze haze--high"></div>

    <!-- 四档光各一层：只切 opacity，不重绘渐变 -->
    <div class="wash wash--dusk"></div>
    <div class="wash wash--night"></div>
    <div class="wash wash--dawn"></div>
    <div class="wash wash--day"></div>

    <div class="lamp"><span class="lamp-core"></span></div>

    <ParticleField v-if="!reduced" :mode="look.particle" :count="look.particles" />

    <div class="vignette"></div>
    <div class="grain"></div>
  </div>
</template>

<style scoped>
.gathering {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #05070c;
}

/* ---------------- 底图 ---------------- */
/* 位移在外层、滤镜在内层：滤镜纹理只栅格化一次，Ken Burns 只动 transform */
.photo-move {
  position: absolute;
  inset: -5%;
  animation: ken-burns 64s ease-in-out infinite alternate;
  will-change: transform;
}

.photo {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 56%;
  background-repeat: no-repeat;
  filter: saturate(0.88) contrast(1.03) brightness(0.94);
}

/* ---------------- 雾：只做横移，颜色随光时换 ---------------- */
.haze {
  position: absolute;
  left: -20%;
  right: -20%;
  pointer-events: none;
  transition: opacity 900ms var(--ease);
  will-change: transform;
}

.haze--low {
  bottom: -6%;
  height: 46%;
  opacity: 0.85;
  animation: haze-drift 58s linear infinite alternate;
}

.haze--high {
  top: 12%;
  height: 34%;
  opacity: 0.5;
  animation: haze-drift 92s linear infinite alternate-reverse;
}

[data-light='dusk'] .haze {
  background:
    radial-gradient(60% 100% at 30% 60%, rgba(255, 196, 148, 0.18), transparent 70%),
    radial-gradient(52% 90% at 70% 40%, rgba(236, 162, 116, 0.13), transparent 72%);
}

[data-light='night'] .haze {
  background:
    radial-gradient(60% 100% at 30% 60%, rgba(150, 172, 196, 0.16), transparent 70%),
    radial-gradient(52% 90% at 70% 40%, rgba(140, 162, 188, 0.13), transparent 72%);
}

[data-light='dawn'] .haze {
  background:
    radial-gradient(60% 100% at 26% 62%, rgba(255, 214, 178, 0.22), transparent 70%),
    radial-gradient(52% 90% at 68% 42%, rgba(220, 200, 208, 0.16), transparent 72%);
}

[data-light='day'] .haze {
  background:
    radial-gradient(64% 100% at 34% 58%, rgba(238, 244, 242, 0.26), transparent 72%),
    radial-gradient(52% 90% at 70% 40%, rgba(226, 236, 234, 0.2), transparent 74%);
  opacity: 0.62;
}

/* ---------------- 四档光：固定渐变，只切 opacity ---------------- */
.wash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 900ms var(--ease);
  background-repeat: no-repeat;
}

[data-light='dusk'] .wash--dusk,
[data-light='night'] .wash--night,
[data-light='dawn'] .wash--dawn,
[data-light='day'] .wash--day {
  opacity: 1;
}

/* 黄昏：左下打来的暖光压上一层紫，夜还没落定 */
.wash--dusk {
  background-image:
    radial-gradient(78% 62% at 16% 88%, rgba(255, 148, 74, 0.34), transparent 66%),
    linear-gradient(198deg, rgba(46, 24, 32, 0.34) 0%, transparent 46%),
    linear-gradient(
      180deg,
      rgba(22, 12, 18, 0.46) 0%,
      rgba(18, 10, 14, 0.1) 42%,
      rgba(12, 7, 10, 0.5) 100%
    );
}

/* 深夜：冷月光从顶上来，中间压到只剩一圈桌心暖光 */
.wash--night {
  background-image:
    radial-gradient(86% 70% at 52% 6%, rgba(74, 104, 164, 0.42), transparent 70%),
    linear-gradient(
      180deg,
      rgba(3, 5, 12, 0.7) 0%,
      rgba(4, 7, 14, 0.46) 42%,
      rgba(2, 4, 9, 0.8) 100%
    );
}

/* 破晓：地平线渗进来的橙金，天顶还留着蓝 */
.wash--dawn {
  background-image:
    radial-gradient(76% 58% at 20% 78%, rgba(255, 186, 132, 0.4), transparent 68%),
    linear-gradient(16deg, rgba(255, 156, 96, 0.28) 0%, transparent 54%),
    linear-gradient(
      180deg,
      rgba(30, 24, 40, 0.32) 0%,
      rgba(20, 16, 30, 0.06) 46%,
      rgba(10, 10, 18, 0.42) 100%
    );
}

/* 白昼：阴天。统一抬亮 + 去色，灯火全灭，靠低对比保护文字 */
.wash--day {
  background-image:
    radial-gradient(70% 46% at 46% 2%, rgba(240, 246, 244, 0.36), transparent 70%),
    linear-gradient(
      180deg,
      rgba(206, 220, 222, 0.38) 0%,
      rgba(198, 214, 212, 0.24) 44%,
      rgba(176, 196, 192, 0.16) 72%,
      rgba(28, 38, 40, 0.3) 100%
    );
}

/* ---------------- 灯火：只动 opacity，呼吸在子元素上 ---------------- */
.lamp {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 1;
  transition: opacity 900ms var(--ease);
}

.lamp-core {
  position: absolute;
  inset: 0;
  background: radial-gradient(70% 58% at 46% 74%, rgba(255, 176, 108, 0.16), transparent 68%);
  animation: flicker 7.5s ease-in-out infinite;
}

[data-light='dusk'] .lamp {
  opacity: 0.9;
}

[data-light='dawn'] .lamp {
  opacity: 0.4;
}

[data-light='day'] .lamp {
  opacity: 0.06;
}

/* ---------------- 后期 ---------------- */
.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.82;
  transition: opacity 900ms var(--ease);
  background: radial-gradient(
    118% 94% at 46% 44%,
    transparent 30%,
    rgba(3, 5, 9, 0.36) 68%,
    rgba(2, 3, 6, 0.82) 100%
  );
}

[data-light='dusk'] .vignette {
  opacity: 0.66;
}

[data-light='dawn'] .vignette {
  opacity: 0.5;
}

[data-light='day'] .vignette {
  opacity: 0.3;
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

.reduced .photo-move, .reduced .haze, .reduced .lamp-core { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .photo-move,
  .haze,
  .lamp-core {
    animation: none;
  }
}
</style>
