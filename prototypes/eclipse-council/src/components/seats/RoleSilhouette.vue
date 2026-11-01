<script setup lang="ts">
import { computed, useId } from 'vue'
import type { Role } from '@/game/types'
import { ROLES } from '@/game/roles'

const props = withDefaults(
  defineProps<{
    role?: Role | null
    tint?: [string, string]
    /** 是否渲染为「暗牌」兜帽剪影 */
    veiled?: boolean
  }>(),
  { role: null, tint: () => ['#8d99a8', '#10161d'], veiled: false },
)

const uid = useId()
const gradId = computed(() => `rs-g-${uid}`)
const rimId = computed(() => `rs-r-${uid}`)
const glowId = computed(() => `rs-l-${uid}`)

const variant = computed(() => {
  if (props.veiled || !props.role) return 'veiled'
  return props.role
})

/**
 * 可选的立绘替换：把 `wolf.png` / `seer.webp` 等放进 `src/assets/portraits/`，
 * 文件名等于角色 id 即可自动替换 SVG 剪影；没有文件时回落到程序化剪影。
 */
const portraits = import.meta.glob<string>('../../assets/portraits/*.{png,jpg,jpeg,webp,avif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const photo = computed(() => {
  if (!props.role || props.veiled) return null
  for (const [path, url] of Object.entries(portraits)) {
    const name = path.split('/').pop()?.replace(/\.[^.]+$/, '')
    if (name === props.role) return url
  }
  return null
})
</script>

<template>
  <img v-if="photo" class="silhouette photo" :src="photo" :alt="role ? ROLES[role].name : '隐藏身份'" />
  <svg
    v-else
    class="silhouette"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradId" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" :stop-color="tint[0]" stop-opacity="0.92" />
        <stop offset="62%" :stop-color="tint[0]" stop-opacity="0.42" />
        <stop offset="100%" :stop-color="tint[1]" stop-opacity="1" />
      </linearGradient>
      <linearGradient :id="rimId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55" />
        <stop offset="55%" stop-color="#ffffff" stop-opacity="0.05" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0.35" />
      </linearGradient>
      <radialGradient :id="glowId" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- 背景光 -->
    <rect width="100" height="100" fill="transparent" />
    <circle cx="50" cy="38" r="46" :fill="`url(#${glowId})`" opacity="0.18" />

    <!-- 肩背 -->
    <path
      d="M2,100 C6,78 22,64 50,64 C78,64 94,78 98,100 Z"
      :fill="`url(#${gradId})`"
      class="body"
    />

    <!-- 头部 -->
    <ellipse cx="50" cy="41" rx="16" ry="19" :fill="`url(#${gradId})`" class="head" />

    <template v-if="variant === 'veiled'">
      <path
        d="M28,48 C28,22 38,8 50,8 C62,8 72,22 72,48 C72,58 62,64 50,64 C38,64 28,58 28,48 Z"
        :fill="`url(#${gradId})`"
        opacity="0.95"
      />
      <ellipse cx="50" cy="44" rx="9" ry="12" fill="#04060a" opacity="0.72" />
      <path d="M28,48 C28,22 38,8 50,8" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1" />
    </template>

    <template v-else-if="variant === 'wolf'">
      <path d="M32,26 L36,6 L46,18 Z" :fill="`url(#${gradId})`" />
      <path d="M68,26 L64,6 L54,18 Z" :fill="`url(#${gradId})`" />
      <path
        d="M29,46 C29,24 39,14 50,14 C61,14 71,24 71,46 C71,56 62,62 50,62 C38,62 29,56 29,46 Z"
        :fill="`url(#${gradId})`"
        opacity="0.92"
      />
      <ellipse cx="43" cy="40" rx="2.6" ry="1.6" fill="#a8f0bd" opacity="0.9" />
      <ellipse cx="57" cy="40" rx="2.6" ry="1.6" fill="#a8f0bd" opacity="0.9" />
      <ellipse cx="43" cy="40" rx="6" ry="4" fill="#7fe3a0" opacity="0.18" />
      <ellipse cx="57" cy="40" rx="6" ry="4" fill="#7fe3a0" opacity="0.18" />
    </template>

    <template v-else-if="variant === 'seer'">
      <path d="M30,40 C26,54 26,74 32,84 L24,86 C18,72 20,52 26,38 Z" :fill="`url(#${gradId})`" opacity="0.8" />
      <path d="M70,40 C74,54 74,74 68,84 L76,86 C82,72 80,52 74,38 Z" :fill="`url(#${gradId})`" opacity="0.8" />
      <path
        d="M31,42 C31,22 40,14 50,14 C60,14 69,22 69,42 C69,54 60,62 50,62 C40,62 31,54 31,42 Z"
        :fill="`url(#${gradId})`"
        opacity="0.9"
      />
      <circle cx="50" cy="74" r="11" fill="none" stroke="#cfe4ff" stroke-opacity="0.55" stroke-width="1.2" />
      <circle cx="50" cy="74" r="11" fill="#9cc4ff" opacity="0.12" />
      <circle cx="50" cy="74" r="4" fill="#dcebff" opacity="0.45" />
    </template>

    <template v-else-if="variant === 'witch'">
      <path
        d="M31,42 C31,22 40,14 50,14 C60,14 69,22 69,42 C69,54 60,62 50,62 C40,62 31,54 31,42 Z"
        :fill="`url(#${gradId})`"
        opacity="0.9"
      />
      <rect x="18" y="70" width="7" height="16" rx="3" fill="#7fb6ff" opacity="0.75" />
      <rect x="18" y="70" width="7" height="5" rx="2" fill="#cfe2ff" opacity="0.8" />
      <rect x="29" y="78" width="7" height="16" rx="3" fill="#b98cff" opacity="0.7" />
      <rect x="29" y="78" width="7" height="5" rx="2" fill="#ead9ff" opacity="0.8" />
    </template>

    <template v-else-if="variant === 'hunter'">
      <path
        d="M31,42 C31,22 40,14 50,14 C60,14 69,22 69,42 C69,54 60,62 50,62 C40,62 31,54 31,42 Z"
        :fill="`url(#${gradId})`"
        opacity="0.9"
      />
      <path d="M12,46 L88,74" stroke="#0c1016" stroke-width="4.5" stroke-linecap="round" opacity="0.9" />
      <path d="M12,46 L88,74" stroke="#c8a678" stroke-width="1" stroke-linecap="round" opacity="0.5" />
      <path d="M70,64 L84,70 L78,78 Z" fill="#0c1016" opacity="0.9" />
    </template>

    <template v-else>
      <path
        d="M31,42 C31,22 40,14 50,14 C60,14 69,22 69,42 C69,54 60,62 50,62 C40,62 31,54 31,42 Z"
        :fill="`url(#${gradId})`"
        opacity="0.9"
      />
    </template>

    <!-- 顶部轮廓光 -->
    <path
      d="M31,44 C31,24 40,15 50,15"
      fill="none"
      stroke="#ffffff"
      stroke-opacity="0.22"
      stroke-width="1.4"
      stroke-linecap="round"
    />
    <rect width="100" height="100" :fill="`url(#${rimId})`" opacity="0.12" />
  </svg>
</template>

<style scoped>
.silhouette {
  display: block;
  width: 100%;
  height: 100%;
}

.photo {
  object-fit: cover;
  filter: saturate(0.85) contrast(1.05);
}
</style>
