<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import {
  cancelPick,
  confirmPick,
  pickAllowsNone,
  pickCancellable,
  seatPick,
  skipPick,
} from '@/composables/useSeatPick'

const game = useGameStore()

const target = computed(() => {
  const seat = seatPick.selected
  if (seat == null) return null
  return game.state?.players.find((p) => p.seat === seat) ?? null
})

const canSkip = computed(() => pickAllowsNone())
const canCancel = computed(() => pickCancellable())
const skipLabel = computed(() =>
  seatPick.mode === 'hunter' ? '放弃开枪' : seatPick.mode === 'vote' ? '弃票' : '跳过',
)
</script>

<template>
  <Transition name="rise">
    <div v-if="seatPick.active" class="pickbar" role="region" aria-label="选择目标">
      <div class="prompt">
        <p class="label">{{ seatPick.label }}</p>
        <p class="hint">
          <template v-if="target">
            已选择 <em>{{ target.seat }} 号</em> · {{ target.name }}
          </template>
          <template v-else>点击席位环上的头像进行选择</template>
        </p>
      </div>
      <div class="actions">
        <button v-if="canCancel" class="ghost" type="button" @click="cancelPick">返回</button>
        <button v-if="canSkip" class="ghost" type="button" @click="skipPick">{{ skipLabel }}</button>
        <button class="primary" type="button" :disabled="target === null" @click="confirmPick">
          确认
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pickbar {
  position: fixed;
  left: 50%;
  bottom: calc(var(--log-h) + 18px);
  z-index: 40;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 22px;
  width: min(560px, calc(100vw - 28px));
  padding: 12px 16px 12px 20px;
  border-radius: 16px;
  border: 1px solid rgba(226, 190, 130, 0.32);
  background: linear-gradient(180deg, rgba(20, 16, 10, 0.92), rgba(9, 8, 6, 0.96));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(226, 190, 130, 0.1);
}

.prompt {
  flex: 1 1 auto;
  min-width: 0;
}

.label {
  font-size: 12.5px;
  letter-spacing: 0.1em;
  color: var(--gold-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint {
  font-size: 11.5px;
  color: var(--ink-3);
  margin-top: 3px;
}

.hint em {
  font-style: normal;
  color: var(--ink);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.ghost {
  padding: 7px 12px;
  border-radius: 9px;
  border: 1px solid var(--line);
  font-size: 12px;
  color: var(--ink-2);
}

.ghost:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.primary {
  padding: 8px 20px;
  border-radius: 9px;
  font-size: 12.5px;
  letter-spacing: 0.1em;
  color: #1a1206;
  background: linear-gradient(180deg, #f0d6ac, #c9a169);
  transition: opacity 200ms, transform 200ms;
}

.primary:disabled {
  opacity: 0.4;
  color: #1a1206;
}

.primary:not(:disabled):hover {
  transform: translateY(-1px);
}

.rise-enter-active,
.rise-leave-active {
  transition: opacity 260ms var(--ease), transform 260ms var(--ease-out);
}

.rise-enter-from,
.rise-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px);
}

@media (max-width: 640px) {
  .pickbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    bottom: calc(var(--log-h) + 10px);
  }
  .actions {
    justify-content: flex-end;
  }
}
</style>
