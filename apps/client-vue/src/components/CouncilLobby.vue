<script setup lang="ts">
import { computed } from "vue";
import type { RoomPublicState } from "../../../../packages/protocol/src/types";
import RoleSilhouette from "./seats/RoleSilhouette.vue";
const props = defineProps<{
  state: RoomPublicState | null;
  nickname: string;
  code: string;
  host: boolean;
  busy: boolean;
  message: string;
}>();
defineEmits([
  "update:nickname",
  "update:code",
  "create",
  "join",
  "copy",
  "add",
  "fill",
  "rename",
  "start",
  "retry",
  "cancel",
  "leave",
  "rules",
]);
const roles = [
  { role: "wolf", name: "狼人" },
  { role: "seer", name: "预言家" },
  { role: "witch", name: "女巫" },
  { role: "hunter", name: "猎人" },
  { role: "villager", name: "平民" },
] as const;
const seats = computed(
  () =>
    props.state?.seats ||
    Array.from({ length: 9 }, (_, i) => ({
      seatId: `P${i + 1}`,
      displayName: "",
      playerType: undefined,
    })),
);
const occupied = computed(() => seats.value.filter((s) => s.playerType).length);
const controllers = computed(() => [
  ...(props.state?.controllers || []),
  ...(props.state?.hostController
    ? [{ ...props.state.hostController, seatId: "HOST" }]
    : []),
]);
const statusNames: Record<string, string> = {
  pending: "等待连接",
  connecting: "正在连接",
  connected: "连接成功",
  binding: "正在绑定",
  ready: "已就绪",
  failed: "连接失败",
  reconnecting: "正在重连",
  released: "已释放",
};
</script>
<template>
  <main class="lobby">
    <header class="mast">
      <span>☾ &nbsp; ECLIPSE COUNCIL</span><span>九人预巫猎 · Linx Night</span>
    </header>
    <div class="layout">
      <section class="intro">
        <p class="eyebrow">月落之前，辨明真相</p>
        <h1 class="display">暗林月夜<span>月蚀议会</span></h1>
        <p class="story">
          九个席位，一片暗林。<br />让每一次发言，都成为照亮夜色的线索。
        </p>
        <div class="roles">
          <article v-for="role in roles" :key="role.role">
            <RoleSilhouette :role="role.role" /><span>{{ role.name }}</span>
          </article>
        </div>
        <p class="board">
          3 狼 · 预言家 · 女巫 · 猎人 · 3 民<br />暗牌 / 无警长 / 无自爆 / 平票
          PK
        </p>
        <div v-if="!state" class="entry">
          <label
            >你的昵称<input
              :value="nickname"
              @input="
                $emit(
                  'update:nickname',
                  ($event.target as HTMLInputElement).value,
                )
              "
              maxlength="24"
              placeholder="为今夜留下名字"
              :disabled="busy"
          /></label>
          <button
            class="gold"
            :disabled="busy || !nickname.trim()"
            @click="$emit('create')"
          >
            创建房间 <span>→</span>
          </button>
          <div class="join">
            <label
              >房间码或 UUID<input
                :value="code"
                @input="
                  $emit(
                    'update:code',
                    ($event.target as HTMLInputElement).value,
                  )
                "
                placeholder="填写六位房间码或 UUID"
                :disabled="busy" /></label
            ><button
              :disabled="busy || !code.trim() || !nickname.trim()"
              @click="$emit('join')"
            >
              加入房间
            </button>
          </div>
          <p class="muted">默认一位真人与八位 AI，也可邀请朋友加入。</p>
        </div>
        <div v-else class="room-info">
          <p class="eyebrow">
            {{ host ? "你是房主" : "你是加入者" }} · {{ nickname }}
          </p>
          <h2 class="display">房间 {{ state.roomCode || state.roomId }}</h2>
          <button class="text-button" type="button" @click="$emit('copy')">复制房间码</button>
          <p class="muted">{{ occupied }} / 9 已入座 · 主持不占玩家席位</p>
          <div v-if="host && !state.preparing" class="buttons">
            <button @click="$emit('add')" :disabled="busy || occupied === 9">
              添加一名 AI</button
            ><button @click="$emit('fill')" :disabled="busy || occupied === 9">
              补齐 AI 空位
            </button>
          </div>
          <button
            v-if="host && !state.preparing"
            class="gold"
            :disabled="busy || occupied !== 9"
            @click="$emit('start')"
          >
            {{ occupied === 9 ? "开始准备 →" : "等待九席满员" }}
          </button>
          <p v-if="!host" class="waiting">九席满员后，由房主开始游戏。</p>
          <button class="text-button" :disabled="busy" @click="$emit('leave')">
            返回入口
          </button>
        </div>
        <p v-if="message" class="error" role="status">{{ message }}</p>
        <button class="text-button" @click="$emit('rules')">
          查看本局规则 ↗
        </button>
      </section>
      <section class="table-zone">
        <template v-if="!state?.preparing">
          <div class="orbit">
            <div class="inner-orbit"></div>
            <div class="core">
              <span>☾</span>
              <h2 class="display">{{ state ? "等待旅人入席" : "九席虚位" }}</h2>
              <p>身份隐于夜色</p>
            </div>
            <div
              v-for="(seat, i) in seats"
              :key="seat.seatId"
              class="seat"
              :class="{ empty: !seat.playerType }"
              :style="{
                '--x': Math.sin((i / 9) * Math.PI * 2),
                '--y': -Math.cos((i / 9) * Math.PI * 2),
              }"
            >
              <div class="portrait">
                <RoleSilhouette :veiled="true" /><b>{{ i + 1 }}</b>
              </div>
              <template v-if="seat.playerType"
                ><button
                  v-if="host && seat.playerType === 'ai'"
                  class="rename"
                  :disabled="busy"
                  @click="$emit('rename', seat)"
                >
                  {{ seat.displayName }} ✎</button
                ><span v-else>{{ seat.displayName }}</span
                ><small>{{
                  seat.playerType === "human" ? "真人" : "灵矽 AI"
                }}</small></template
              >
              <template v-else
                ><span>等待入座</span><small>空席</small></template
              >
            </div>
          </div>
          <p class="table-note">
            {{
              state
                ? host
                  ? "点击 AI 昵称修改 · 满九席后准备"
                  : "等待房主补齐席位"
                : "创建房间，或用房间号加入议会"
            }}
          </p>
        </template>
        <section v-else class="preparation">
          <p class="eyebrow">入夜前的准备</p>
          <h2 class="display">
            {{
              state.controllerPhase === "failed"
                ? "连接暂时中断"
                : "正在召集议会"
            }}
          </h2>
          <p class="muted">
            {{ controllers.filter((c) => c.status === "ready").length }} /
            {{ controllers.length }} 已就绪 · 全部就绪后才分配身份
          </p>
          <div v-for="c in controllers" :key="c.seatId" class="controller">
            <span>{{
              c.seatId === "HOST"
                ? "独立 AI 主持"
                : seats.find((s) => s.seatId === c.seatId)?.displayName
            }}</span
            ><b
              >{{ statusNames[c.status] || c.status
              }}{{ c.errorCode ? " · " + c.errorCode : "" }}</b
            >
          </div>
          <div class="buttons">
            <button
              v-if="host && state.controllerPhase === 'failed'"
              class="gold"
              :disabled="busy"
              @click="$emit('retry')"
            >
              重试连接</button
            ><button v-if="host" :disabled="busy" @click="$emit('cancel')">
              取消准备
            </button>
          </div>
        </section>
      </section>
    </div>
    <footer>身份仅本人及合法队友可见 · 死亡不翻牌</footer>
  </main>
</template>
<style scoped>
.lobby {
  height: 100dvh;
  overflow: auto;
  padding: 26px 5vw 20px;
  background: linear-gradient(90deg, rgba(4, 7, 12, 0.5), transparent);
}
.mast {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--gold-text);
  padding-bottom: 22px;
  border-bottom: 1px solid rgba(213, 177, 132, 0.15);
}
.layout {
  max-width: 1380px;
  min-height: calc(100dvh - 145px);
  margin: auto;
  display: grid;
  grid-template-columns: minmax(300px, 0.85fr) minmax(450px, 1.15fr);
  align-items: center;
  gap: 6vw;
  padding: 36px 0;
}
h1 {
  font-size: clamp(42px, 5vw, 76px);
  line-height: 1.2;
  letter-spacing: 0.15em;
  margin: 15px 0 20px;
}
h1 span {
  display: block;
  font-size: 12px;
  letter-spacing: 0.7em;
  color: var(--gold-text);
  margin-top: 12px;
}
.story {
  color: var(--ink-2);
  font-size: 13px;
  line-height: 2;
}
.roles {
  display: flex;
  gap: 14px;
  margin-top: 24px;
}
.roles article {
  display: grid;
  gap: 7px;
  justify-items: center;
  color: var(--ink-2);
  font-size: 11px;
}
.roles article :deep(.silhouette) {
  width: 55px;
  height: 55px;
  border-radius: 50%;
  background: #111a26;
}
.board {
  font-size: 11px;
  line-height: 1.9;
  color: var(--ink-3);
  margin: 18px 0;
}
.entry,
.room-info {
  max-width: 365px;
  display: grid;
  gap: 12px;
}
.room-info h2 {
  font-size: 28px;
  letter-spacing: 0.08em;
}
label {
  display: grid;
  gap: 5px;
  font-size: 10px;
  color: var(--ink-3);
}
input {
  min-width: 0;
  width: 100%;
  border: 1px solid rgba(213, 177, 132, 0.22);
  border-radius: 8px;
  background: rgba(5, 8, 14, 0.7);
  padding: 10px 12px;
  color: var(--ink);
  outline-offset: 2px;
}
button {
  padding: 10px 15px;
  border: 1px solid rgba(213, 177, 132, 0.25);
  border-radius: 8px;
  font-size: 12px;
}
button:hover {
  border-color: var(--gold-text);
}
button:disabled {
  opacity: 0.4;
}
.gold {
  background: linear-gradient(135deg, #ead1a4, #b38c55);
  color: #20170b;
  border: 0;
  display: flex;
  justify-content: space-between;
}
.join {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: 10px;
}
.muted,
.waiting {
  font-size: 11px;
  color: var(--ink-3);
  line-height: 1.8;
}
.buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.text-button {
  padding: 8px 0;
  border: 0;
  color: var(--gold-text);
  text-align: left;
  font-size: 11px;
}
.error {
  color: #e7a5a0;
  font-size: 12px;
}
.table-zone {
  display: grid;
  justify-items: center;
  gap: 34px;
}
.orbit {
  --size: min(43vw, 59vh, 580px);
  --radius: calc(var(--size) / 2 - 34px);
  position: relative;
  width: var(--size);
  height: var(--size);
  border: 1px solid rgba(213, 177, 132, 0.18);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(213, 177, 132, 0.07),
    transparent 65%
  );
}
.inner-orbit {
  position: absolute;
  inset: 22%;
  border: 1px dashed rgba(213, 177, 132, 0.13);
  border-radius: 50%;
}
.core {
  position: absolute;
  inset: 28%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.core > span {
  font-size: 32px;
  color: var(--gold-text);
}
.core h2 {
  font-size: 16px;
  letter-spacing: 0.13em;
}
.core p {
  font-size: 10px;
  color: var(--ink-3);
  margin-top: 8px;
}
.seat {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  transform: translate(
      calc(var(--x) * var(--radius)),
      calc(var(--y) * var(--radius))
    )
    translate(-50%, -50%);
  font-size: 11px;
}
.portrait {
  width: 66px;
  height: 66px;
  position: relative;
  border: 1px solid rgba(213, 177, 132, 0.3);
  border-radius: 50%;
  background: #0b101a;
}
.portrait :deep(.silhouette) {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
.portrait b {
  position: absolute;
  left: -3px;
  top: -3px;
  border-radius: 50%;
  background: #11151c;
  padding: 0 5px;
  color: var(--gold-text);
  font-size: 10px;
}
.seat input {
  text-align: center;
  padding: 2px 4px;
  font-size: 11px;
  background: rgba(5, 8, 14, 0.4);
  border-color: transparent;
}
.seat input:hover {
  border-color: var(--gold-soft);
}
small {
  font-size: 9px;
  color: var(--gold-text);
}
.empty .portrait {
  border-style: dashed;
  opacity: 0.4;
}
.empty > span,
.empty small {
  color: var(--ink-3);
}
.table-note {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-3);
}
.preparation {
  width: min(100%, 460px);
  padding: 26px;
  border: 1px solid rgba(213, 177, 132, 0.25);
  border-radius: 18px;
  background: rgba(8, 12, 20, 0.88);
}
.preparation h2 {
  font-size: 28px;
  margin: 9px 0;
}
.controller {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(213, 177, 132, 0.08);
  font-size: 11px;
}
.controller b {
  font-weight: 400;
  color: var(--gold-text);
}
.preparation .buttons {
  margin-top: 18px;
}
footer {
  text-align: center;
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--ink-3);
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    gap: 65px;
    justify-items: center;
  }
  .intro {
    width: min(100%, 480px);
  }
  .table-zone {
    width: 100%;
    padding: 25px 0;
  }
  .orbit {
    --size: min(76vw, 480px);
  }
  .entry,
  .room-info {
    max-width: none;
  }
  .mast {
    font-size: 9px;
  }
  .roles {
    justify-content: space-between;
  }
  .lobby {
    padding: 20px 6vw;
  }
  .layout {
    padding-top: 24px;
  }
  .core h2 {
    font-size: 14px;
  }
}
@media (max-width: 450px) {
  .orbit {
    --size: 78vw;
    --radius: calc(var(--size) / 2 - 22px);
  }
  .portrait {
    width: 48px;
    height: 48px;
  }
  .seat {
    width: 68px;
    font-size: 10px;
  }
  .core p {
    display: none;
  }
  .table-note {
    font-size: 9px;
  }
  .mast span:last-child {
    max-width: 120px;
    text-align: right;
  }
  h1 {
    font-size: 43px;
  }
  .roles article :deep(.silhouette) {
    width: 46px;
    height: 46px;
  }
}
</style>

<style scoped>
.room-info h2 {
  overflow-wrap: anywhere;
  font-size: 22px;
}
.rename {
  padding: 0;
  border: 0;
  font-size: 11px;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
