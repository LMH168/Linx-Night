<script setup lang="ts">
import { computed } from 'vue'
import type { Player } from '@/game/types'
import { ROLES } from '@/game/roles'
import { personaOf } from '@/ai/personas'
import RoleSilhouette from './RoleSilhouette.vue'

const props = withDefaults(
  defineProps<{
    player: Player
    roleVisible?: boolean
    isSelf?: boolean
    isTeammate?: boolean
    isActor?: boolean
    isSpeaker?: boolean
    isThinking?: boolean
    interactive?: boolean
    isCandidate?: boolean
    isSelected?: boolean
    dim?: boolean
    votes?: number
  }>(),
  {
    roleVisible: false,
    isSelf: false,
    isTeammate: false,
    isActor: false,
    isSpeaker: false,
    isThinking: false,
    interactive: false,
    isCandidate: false,
    isSelected: false,
    dim: false,
    votes: 0,
  },
)

const emit = defineEmits<{ select: [seat: number]; hover: [seat: number | null] }>()

const tint = computed<[string, string]>(() => {
  if (props.roleVisible) {
    const meta = ROLES[props.player.role]
    return [meta.accent, meta.accent2]
  }
  return personaOf(props.player.persona).palette
})

const roleLabel = computed(() =>
  props.roleVisible ? ROLES[props.player.role].name : '',
)

const dead = computed(() => !props.player.alive)

function onClick(): void {
  if (!props.interactive) return
  emit('select', props.player.seat)
}
</script>

<template>
  <button
    class="seat"
    type="button"
    :class="{
      'is-dead': dead,
      'is-self': isSelf,
      'is-actor': isActor,
      'is-speaker': isSpeaker,
      'is-interactive': interactive,
      'is-candidate': isCandidate,
      'is-selected': isSelected,
      'is-dim': dim,
      'is-teammate': isTeammate,
    }"
    :aria-label="`${player.seat} 号 ${player.name}${dead ? ' 已出局' : ''}`"
    :aria-pressed="isSelected"
    :tabindex="interactive ? 0 : -1"
    @click="onClick"
    @mouseenter="emit('hover', player.seat)"
    @mouseleave="emit('hover', null)"
  >
    <span class="halo" aria-hidden="true"></span>

    <span class="avatar">
      <span class="well">
        <RoleSilhouette
          :role="player.role"
          :veiled="!roleVisible"
          :tint="tint"
          class="portrait"
        />
        <span class="shade" aria-hidden="true"></span>
        <span class="gloss" aria-hidden="true"></span>
        <span v-if="dead" class="crack" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <path d="M22,8 L38,34 L30,46 L48,58 L40,74 L58,96" />
            <path d="M78,14 L64,38 L74,50 L58,66" />
          </svg>
        </span>
      </span>
      <span class="index">{{ player.seat }}</span>
      <span v-if="isTeammate && !dead" class="mate" title="狼队友">狼</span>
      <span v-if="votes > 0" class="votes">{{ votes }}</span>
      <span v-if="dead" class="out-mark">出局</span>
    </span>

    <span class="meta">
      <span class="name">{{ player.name }}</span>
      <span v-if="roleLabel" class="role" :style="{ color: tint[0] }">{{ roleLabel }}</span>
      <span v-else-if="player.isHuman" class="human">真人</span>
    </span>

    <span v-if="isSpeaker" class="wave" aria-hidden="true">
      <i></i><i></i><i></i><i></i>
    </span>
    <span v-if="isThinking" class="thinking" aria-label="正在思考">
      <i></i><i></i><i></i>
    </span>
  </button>
</template>

<style scoped>
.seat {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: var(--seat-w, 92px);
  padding: 0;
  background: none;
  border: 0;
  color: inherit;
  transition: transform 380ms var(--ease-out), opacity 420ms var(--ease), filter 420ms var(--ease);
}

.seat.is-interactive {
  cursor: pointer;
}

.seat.is-interactive:hover {
  transform: translateY(-3px);
}

.halo {
  position: absolute;
  top: 0;
  left: 50%;
  width: calc(var(--seat-size) + 26px);
  height: calc(var(--seat-size) + 26px);
  margin-left: calc((var(--seat-size) + 26px) / -2);
  margin-top: -13px;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 500ms var(--ease);
  background: radial-gradient(
    circle,
    var(--scene-glow, rgba(213, 177, 132, 0.35)) 0%,
    transparent 68%
  );
}

.is-actor .halo,
.is-speaker .halo {
  opacity: 1;
  animation: breathe 3.2s ease-in-out infinite;
}

.is-selected .halo {
  opacity: 1;
  background: radial-gradient(circle, rgba(226, 190, 130, 0.55) 0%, transparent 70%);
}

.avatar {
  --bezel: max(2px, calc(var(--seat-size) * 0.038));
  position: relative;
  width: var(--seat-size);
  height: var(--seat-size);
  border-radius: 50%;
  overflow: visible;
  /* 金属镜圈：斜上方受光，左下偏冷，右下压暗 —— 一圈就能立起来 */
  background: conic-gradient(
    from 208deg,
    rgba(240, 217, 180, 0.92),
    rgba(122, 98, 64, 0.34) 18%,
    rgba(228, 200, 158, 0.78) 34%,
    rgba(84, 66, 42, 0.3) 52%,
    rgba(232, 208, 170, 0.86) 70%,
    rgba(104, 82, 52, 0.34) 86%,
    rgba(244, 224, 190, 0.94)
  );
  box-shadow:
    0 12px 26px -10px rgba(0, 0, 0, 0.92),
    0 3px 10px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(0, 0, 0, 0.6),
    inset 0 0 0 1px rgba(255, 244, 220, 0.3);
  transition: box-shadow 420ms var(--ease), transform 420ms var(--ease-out),
    filter 600ms var(--ease);
}

/* 内井：肖像嵌在镜圈里，四边有内阴影，顶部有一道受光边 */
.well {
  position: absolute;
  inset: var(--bezel);
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(circle at 50% 26%, #1c2632 0%, #070b11 72%, #04070b 100%);
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.12),
    inset 0 -10px 18px rgba(0, 0, 0, 0.6),
    inset 0 0 0 1px rgba(0, 0, 0, 0.55);
}

.portrait {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  transition: filter 700ms var(--ease), opacity 700ms var(--ease);
}

.shade {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 20%, transparent 30%, rgba(2, 4, 8, 0.5) 86%),
    linear-gradient(180deg, rgba(2, 4, 8, 0) 58%, rgba(2, 4, 8, 0.42) 100%);
  pointer-events: none;
}

/* 玻璃反光：斜向一道很淡的高光 + 底部一点暖色反射光 */
.gloss {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(58% 40% at 34% 14%, rgba(255, 255, 255, 0.16), transparent 66%),
    radial-gradient(90% 44% at 54% 104%, rgba(255, 178, 112, 0.14), transparent 62%);
}

.is-actor .avatar,
.is-speaker .avatar {
  box-shadow:
    0 0 0 1.5px rgba(232, 204, 160, 0.9),
    0 0 32px 2px rgba(213, 177, 132, 0.34),
    0 12px 26px -10px rgba(0, 0, 0, 0.92);
}

.is-self .avatar {
  box-shadow:
    0 0 0 1.5px rgba(242, 218, 172, 0.92),
    0 0 20px rgba(213, 177, 132, 0.26),
    0 12px 26px -10px rgba(0, 0, 0, 0.92);
}

.is-selected .avatar {
  box-shadow:
    0 0 0 2px var(--gold),
    0 0 42px 4px rgba(226, 190, 130, 0.42),
    0 12px 26px -10px rgba(0, 0, 0, 0.92);
  transform: scale(1.03);
}

.is-candidate .avatar {
  outline: 1px dashed rgba(226, 190, 130, 0.45);
  outline-offset: 3px;
}

.is-candidate.is-interactive:hover .avatar {
  box-shadow:
    0 0 0 1.5px rgba(226, 190, 130, 0.8),
    0 0 30px 2px rgba(226, 190, 130, 0.32),
    0 12px 26px -10px rgba(0, 0, 0, 0.92);
}

.is-dim {
  opacity: 0.38;
}

.is-dead {
  opacity: 0.5;
  filter: grayscale(0.92) brightness(0.72);
}

.is-dead .avatar {
  transform: scale(0.95);
}

.crack {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.62));
  animation: crack-in 900ms var(--ease) both;
}

.crack svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: rgba(0, 0, 0, 0.72);
  stroke-width: 2.2;
  stroke-linejoin: round;
}

.index {
  position: absolute;
  left: -3px;
  top: -3px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: #f2dab2;
  background: linear-gradient(158deg, #2c2418 0%, #10141b 52%, #070a0f 100%);
  border: 1px solid rgba(226, 196, 150, 0.42);
  box-shadow:
    0 2px 7px rgba(0, 0, 0, 0.72),
    inset 0 1px 0 rgba(255, 240, 210, 0.22);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.mate {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 10px;
  color: #ffd9d2;
  background: rgba(122, 40, 38, 0.92);
  border: 1px solid rgba(255, 150, 140, 0.4);
}

.votes {
  position: absolute;
  right: -6px;
  bottom: -4px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #1a1206;
  background: linear-gradient(180deg, #f4d9ac 0%, #d6ad74 58%, #b48c58 100%);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 250, 235, 0.6);
  animation: pop-in 260ms var(--ease-out) both;
}

.out-mark {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  font-size: 10px;
  letter-spacing: 0.24em;
  color: rgba(255, 220, 210, 0.55);
  white-space: nowrap;
}

.meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-height: 22px;
  max-width: 100%;
}

.name {
  font-size: 12.5px;
  letter-spacing: 0.04em;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  transition: color 320ms var(--ease);
}

.is-self .name {
  color: var(--gold-text);
}

.is-actor .name,
.is-speaker .name {
  color: var(--ink);
}

.role {
  font-size: 10.5px;
  letter-spacing: 0.14em;
}

.human {
  font-size: 9.5px;
  letter-spacing: 0.2em;
  color: var(--ink-3);
}

.wave {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 12px;
}

.wave i {
  width: 2px;
  height: 5px;
  border-radius: 2px;
  background: var(--gold);
  animation: breathe 1.1s ease-in-out infinite;
}

.wave i:nth-child(2) {
  animation-delay: 0.14s;
  height: 9px;
}
.wave i:nth-child(3) {
  animation-delay: 0.28s;
  height: 7px;
}
.wave i:nth-child(4) {
  animation-delay: 0.42s;
  height: 4px;
}

.thinking {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 3px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(4, 7, 11, 0.8);
  border: 1px solid var(--line);
  animation: pop-in 220ms var(--ease-out) both;
}

.thinking i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--gold);
  animation: dots 1.3s infinite;
}

.thinking i:nth-child(2) {
  animation-delay: 0.16s;
}
.thinking i:nth-child(3) {
  animation-delay: 0.32s;
}

@media (max-width: 900px) {
  .seat {
    width: var(--seat-w, 66px);
    gap: 5px;
  }
  .name {
    font-size: 11px;
  }
  .index {
    width: 18px;
    height: 18px;
    font-size: 10px;
  }
}
</style>
