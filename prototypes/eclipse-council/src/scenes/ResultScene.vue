<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { ROLES } from '@/game/roles'
import RoleSilhouette from '@/components/seats/RoleSilhouette.vue'

const game = useGameStore()
const state = computed(() => game.state)
const winner = computed(() => state.value?.winner ?? null)
const isGood = computed(() => winner.value === 'good')

const roster = computed(() =>
  (state.value?.players ?? []).map((player) => ({
    ...player,
    meta: ROLES[player.role],
  })),
)

const survivors = computed(() => roster.value.filter((p) => p.alive).length)
const rounds = computed(() => state.value?.round ?? 1)

function again(): void {
  game.restart()
}

function toLobby(): void {
  game.quitToLobby()
}
</script>

<template>
  <div class="result" :class="isGood ? 'good' : 'wolf'" role="region" aria-label="对局结果">
    <div class="wash" aria-hidden="true"></div>
    <div class="glow" aria-hidden="true"></div>

    <div class="content">
      <p class="eyebrow">{{ isGood ? 'THE DAWN BREAKS' : 'THE FOREST FALLS' }}</p>
      <h1 class="verdict display">{{ winner == null ? '议会已散场' : isGood ? '好人阵营胜利' : '狼人阵营胜利' }}</h1>
      <p class="reason">{{ state?.endReason }}</p>

      <div class="stats">
        <div class="stat">
          <span class="s-num display">{{ rounds }}</span>
          <span class="s-label">夜与昼</span>
        </div>
        <span class="s-sep" aria-hidden="true"></span>
        <div class="stat">
          <span class="s-num display">{{ survivors }}</span>
          <span class="s-label">存活</span>
        </div>
        <span class="s-sep" aria-hidden="true"></span>
        <div class="stat">
          <span class="s-num display">9</span>
          <span class="s-label">参战</span>
        </div>
      </div>

      <ul class="roster">
        <li
          v-for="(player, index) in roster"
          :key="player.seat"
          class="member"
          :class="{ dead: !player.alive }"
          :style="{ '--i': index, '--accent': player.meta.accent }"
        >
          <span class="m-portrait">
            <RoleSilhouette :role="player.role" :tint="[player.meta.accent, player.meta.accent2]" />
          </span>
          <span class="m-no">{{ player.seat }}</span>
          <span class="m-name">{{ player.name }}</span>
          <span class="m-role" :style="{ color: player.meta.accent }">{{ player.meta.name }}</span>
          <span v-if="!player.alive" class="m-dead">出局</span>
        </li>
      </ul>

      <section v-if="game.ui.logOpen" class="review"><h2>本局公开复盘</h2><p>出局顺序：{{state?.players.filter(p=>!p.alive).sort((a,b)=>(a.deathRound??0)-(b.deathRound??0)).map(p=>`${p.seat} 号`).join(' → ') || '暂无'}}</p><p v-for="entry in state?.log.filter(l=>l.visibility==='public')" :key="entry.id">第 {{entry.round}} 轮 · {{entry.text}}</p><p>模拟对局已结束 · 无外部连接需要释放</p></section>
      <div class="actions">
        <button class="primary" type="button" @click="again">再来一局</button>
        <button class="ghost" type="button" @click="toLobby">回到大厅</button>
        <button class="ghost" type="button" @click="game.ui.logOpen = !game.ui.logOpen">{{game.ui.logOpen?'收起复盘':'查看复盘'}}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  overflow-y: auto;
  padding: 4vh 20px;
}

.wash {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(78% 46% at 50% 108%, rgba(96, 128, 168, 0.16), transparent 66%),
    radial-gradient(90% 80% at 50% -10%, #24384f 0%, #0d1622 44%, #070b12 76%, #04060a 100%);
}

.result.wolf .wash {
  background:
    radial-gradient(78% 46% at 50% 108%, rgba(168, 62, 58, 0.18), transparent 66%),
    radial-gradient(90% 80% at 50% -10%, #4a1a1c 0%, #1b0810 46%, #090409 78%, #040305 100%);
}

.glow {
  position: absolute;
  top: -20%;
  left: 50%;
  width: 90vmin;
  height: 90vmin;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(213, 177, 132, 0.22), transparent 62%);
  animation: breathe 8s ease-in-out infinite;
}

.result.wolf .glow {
  background: radial-gradient(circle, rgba(168, 62, 58, 0.28), transparent 62%);
}

.content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: min(1000px, 100%);
  animation: fade-up 900ms var(--ease-out) both;
}

.verdict {
  margin-top: 14px;
  font-size: clamp(30px, 5.4vw, 62px);
  letter-spacing: 0.16em;
  color: #f2e9d9;
  text-shadow: 0 0 60px rgba(213, 177, 132, 0.35);
}

.result.wolf .verdict {
  color: #f0d6d2;
  text-shadow: 0 0 60px rgba(168, 62, 58, 0.45);
}

.reason {
  margin-top: 12px;
  max-width: 52ch;
  font-family: var(--font-display);
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-2);
}

.stats {
  display: flex;
  align-items: center;
  gap: 26px;
  margin: 26px 0 30px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.s-num {
  font-size: 26px;
  color: var(--gold-text);
  line-height: 1;
}

.result.wolf .s-num {
  color: #e0a49b;
}

.s-label {
  font-size: 9.5px;
  letter-spacing: 0.22em;
  color: var(--ink-3);
}

.s-sep {
  width: 1px;
  height: 24px;
  background: rgba(213, 177, 132, 0.16);
}

.roster {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.member {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(8, 11, 16, 0.6);
  animation: fade-up 620ms var(--ease-out) both;
  animation-delay: calc(var(--i) * 55ms);
  transition: border-color 300ms var(--ease), transform 300ms var(--ease);
}

.member:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}

.member.dead {
  opacity: 0.52;
}

.m-portrait {
  width: clamp(38px, 4.6vw, 58px);
  height: clamp(38px, 4.6vw, 58px);
  border-radius: 50%;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.member.dead .m-portrait {
  filter: grayscale(0.9) brightness(0.7);
}

.m-no {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 9px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.m-name {
  font-size: 11.5px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.m-role {
  font-size: 9.5px;
  letter-spacing: 0.14em;
}

.m-dead {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 8px;
  letter-spacing: 0.1em;
  color: #c98d85;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 34px;
}

.primary {
  padding: 12px 30px;
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.14em;
  color: #1a1206;
  background: linear-gradient(180deg, #f2dcb4, #c9a169);
  box-shadow: 0 16px 40px rgba(201, 161, 105, 0.24);
  transition: transform 240ms var(--ease);
}

.primary:hover {
  transform: translateY(-2px);
}

.ghost {
  padding: 11px 22px;
  border-radius: 999px;
  border: 1px solid rgba(213, 177, 132, 0.22);
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--ink-2);
  transition: border-color 220ms, color 220ms;
}

.ghost:hover {
  border-color: var(--gold-soft);
  color: var(--ink);
}

@media (max-width: 900px) {
  .roster {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .stats {
    gap: 16px;
  }
  .actions {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>

<style scoped>.review{max-height:240px;overflow:auto;text-align:left;width:min(700px,100%);padding:18px;background:#080d16;border:1px solid #5a4934;border-radius:10px}.review h2{font-size:15px;color:var(--gold-text)}.review p{font-size:11px;line-height:1.9;padding:5px 0;border-bottom:1px solid #ffffff0a}</style>
