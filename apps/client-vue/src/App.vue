<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { ApiRequestError, GameApiClient } from "./api/client";
import { useRoomStream } from "./composables/useRoomStream";
import { useHumanVoice } from "./composables/useHumanVoice";
import { useHostPlayback } from "./composables/useHostPlayback";
import { useRoomStore } from "./stores/room";
import { legalTargets, playerAction, visibleRole } from "./game/permissions";
import type {
  Role,
  SeatState,
  SettlementState,
} from "../../../packages/protocol/src/types";
import type {
  ActionRequest,
  HunterResponseRequest,
  LastWordsRequest,
  SpeechRequest,
  VoteRequest,
} from "../../../packages/protocol/src/api";
import CouncilLobby from "./components/CouncilLobby.vue";
import SceneBackground from "./components/scene/SceneBackground.vue";
import RoleSilhouette from "./components/seats/RoleSilhouette.vue";

const store = useRoomStore();
const query = new URLSearchParams(location.search);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const apiUrl =
  query.get("api") ||
  (local ? sessionStorage.getItem("linx-api") : "") ||
  (local ? "http://127.0.0.1:5100" : location.origin);
const roomId = ref(sessionStorage.getItem("linx-room") || "");
const playerId = ref(sessionStorage.getItem("linx-player") || "");
const joinCode = ref(query.get("room") || "");
const displayName = ref(sessionStorage.getItem("linx-name") || "");
const client = shallowRef<GameApiClient | null>(null);
let stream: ReturnType<typeof useRoomStream> | null = null;
let generation = 0;
let pendingCommand: { key: string; id: string } | null = null;
const busy = ref(false);
const actionBusy = ref(false);
const message = ref("");
const actionMessage = ref("");
const targetSeatId = ref("");
const speechText = ref("");
const lastWordsText = ref("");
const witchAction = ref<"skip" | "save" | "poison">("skip");
const settlement = ref<SettlementState | null>(null);
const settlementError = ref("");
const identityOpen = ref(false);
const showRules = ref(false);
const endConfirm = ref(false);
const renameSeat = ref<SeatState | null>(null);
const renameText = ref("");
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval>;
let heartbeatTimer: ReturnType<typeof setInterval>;
const phaseNames: Record<string, string> = {
  LOBBY: "等待开局",
  ROLE_ASSIGNMENT: "分配身份",
  NIGHT_WOLF: "狼人行动",
  NIGHT_SEER: "预言家行动",
  NIGHT_WITCH: "女巫行动",
  DAY_ANNOUNCEMENT: "天亮了",
  LAST_WORDS: "遗言",
  SPEECH: "依次发言",
  VOTE: "放逐投票",
  RESOLUTION: "结算中",
  GAME_OVER: "本局结束",
};
const roleNames: Record<string, string> = {
  werewolf: "狼人",
  seer: "预言家",
  witch: "女巫",
  hunter: "猎人",
  villager: "平民",
};
const state = computed(() => store.publicState);
const mine = computed(() => store.privateState);
const isHost = computed(() =>
  Boolean(state.value && state.value.hostPlayerId === playerId.value),
);
const mySeat = computed(() =>
  state.value?.seats.find((s) => s.seatId === mine.value?.seatId),
);
const finished = computed(() =>
  Boolean(settlement.value || state.value?.phase === "GAME_OVER"),
);
const inLobby = computed(
  () =>
    !finished.value &&
    (!state.value || state.value.phase === "LOBBY" || state.value.preparing),
);
const round = computed(() => (state.value?.round || 0) + 1);
const actionKey = computed(() =>
  [
    state.value?.roomId,
    state.value?.gameId,
    state.value?.round,
    state.value?.phase,
    state.value?.currentSeatId,
    state.value?.pk?.stage,
    mine.value?.seatId,
    mine.value?.hunterAction?.windowId,
    mine.value?.lastWords?.windowId,
  ].join(":"),
);
const submittedKey = ref("");
const action = computed(() =>
  submittedKey.value === actionKey.value
    ? null
    : playerAction(state.value, mine.value),
);
const targets = computed(() =>
  legalTargets(state.value, mine.value, action.value),
);
const needsTarget = computed(
  () =>
    action.value === "vote" ||
    action.value === "hunter" ||
    (action.value === "skill" &&
      (mine.value?.role !== "witch" || witchAction.value === "poison")),
);
const disconnected = computed(() =>
  ["reconnecting", "error"].includes(store.connectionStatus),
);
const aiFailed = computed(() => state.value?.controllers.some(c => c.status === "failed"));
const actionDisabled = computed(
  () =>
    actionBusy.value || busy.value || store.connectionStatus !== "connected" || aiFailed.value || timeExpired.value,
);
const scene = computed(() =>
  inLobby.value
    ? "lobby"
    : finished.value
      ? "vote"
      : state.value?.phase.startsWith("NIGHT_")
        ? "night"
        : state.value?.phase === "VOTE"
          ? "vote"
          : "day",
);
const phaseName = computed(() =>
  mine.value?.hunterAction
    ? "猎人响应"
    : state.value?.pk
      ? state.value.pk.stage === "speech"
        ? "PK 候选发言"
        : "PK 再投票"
      : scene.value === "night" && !action.value
        ? "夜间行动中"
        : phaseNames[state.value?.phase || "LOBBY"] || "结算中",
);
const deadline = computed(
  () =>
    mine.value?.hunterAction?.expiresAt ||
    mine.value?.lastWords?.expiresAt ||
    (action.value === "speech" ? state.value?.speechDeadline : null),
);
const secondsLeft = computed(() =>
  deadline.value
    ? Math.max(
        0,
        Math.ceil(
          ((typeof deadline.value === "number"
            ? deadline.value
            : Date.parse(deadline.value)) -
            now.value) /
            1000,
        ),
      )
    : null,
);
const timeExpired = computed(() => secondsLeft.value === 0);
const waiting = computed(() =>
  disconnected.value
    ? "连接中断，正在恢复最新状态。"
    : state.value?.controllers.some((c) => c.status === "failed")
      ? "AI 回合失败，等待房主处理。"
      : mySeat.value?.controlSource === "rule_bot"
        ? "当前由规则机器人托管，可恢复本人控制。"
        : state.value?.submittedVoteSeatIds.includes(mine.value?.seatId || "")
          ? "你已投票，等待其他存活玩家。"
          : state.value?.pk?.candidates.includes(mine.value?.seatId || "") &&
              state.value.pk.stage === "vote"
            ? "你是 PK 候选人，由台下存活玩家投票。"
            : !mine.value?.alive
              ? "你已出局，可继续旁观公开流程。"
              : state.value?.currentSeatId
                ? `等待 ${seatName(state.value.currentSeatId)} 完成发言。`
                : "等待其他玩家行动及服务端推进。",
);
const voice = useHumanVoice({
  client,
  roomId,
  contextKey: () => actionKey.value,
  canRecord: () => action.value === "speech" && !actionDisabled.value,
  onBusyStart: () => hostPlayback.suspend(),
  onBusyEnd: () => hostPlayback.resume(),
  onDraft: (text) => {
    speechText.value = text;
    actionMessage.value = "转写已填入草稿，请编辑确认后提交。";
    void refresh();
  },
});
const hostPlayback = useHostPlayback({
  client,
  roomId,
  isHost: () => isHost.value,
  suspended: () => voice.busy.value,
});
const artRole = (role?: Role | null) =>
  role === "werewolf" ? ("wolf" as const) : role || null;
const seatName = (id: string) =>
  `${id.replace("P", "")} 号 · ${state.value?.seats.find((s) => s.seatId === id)?.displayName || id}`;
const shownRole = (id: string) =>
  visibleRole(id, mine.value, identityOpen.value);
const connectionLabel = computed(
  () =>
    ({
      idle: "未连接",
      loading: "同步中",
      connected: "已连接",
      reconnecting: "重连中",
      error: "连接异常",
    })[store.connectionStatus],
);
function errorText(error: unknown) {
  if (error instanceof ApiRequestError && error.code === "PROFILE_IN_USE")
    return "灵矽身份正在被其他房间使用，请先结束其他房间，再取消本次准备后重试。";
  return error instanceof Error ? error.message : "请求失败，请重试。";
}
function copyRoomCode() {
  const code = state.value?.roomCode || roomId.value;
  if (code) navigator.clipboard?.writeText(code).catch(() => undefined);
}
function saveSession() {
  sessionStorage.setItem("linx-room", roomId.value);
  sessionStorage.setItem("linx-player", playerId.value);
  sessionStorage.setItem("linx-name", displayName.value);
  sessionStorage.setItem("linx-api", apiUrl);
}
async function loadSettlement() {
  if (!client.value || !roomId.value) return;
  const run = generation;
  try {
    const result = await client.value.settlement(roomId.value);
    if (run !== generation) return;
    settlement.value = result.settlement;
    settlementError.value = "";
  } catch (error) {
    if (run === generation) settlementError.value = errorText(error);
  }
}
async function refresh() {
  if (!client.value || !roomId.value) return;
  try {
    await store.refreshAfterEvent(client.value, roomId.value);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404)
      await loadSettlement();
    else message.value = errorText(error);
  }
}
async function openRoom(id: string, player: string) {
  generation++;
  const run = generation;
  actionBusy.value = false;
  stream?.close();
  voice.reset();
  hostPlayback.stop();
  store.reset();
  settlement.value = null;
  identityOpen.value = false;
  roomId.value = id;
  playerId.value = player;
  client.value = new GameApiClient({ baseUrl: apiUrl, playerId: player });
  saveSession();
  try {
    await store.hydrate(client.value, id);
    if (run !== generation) return;
    stream = useRoomStream(client.value, id);
    message.value = "已连接房间。";
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      await loadSettlement();
      if (settlement.value) return;
    }
    throw error;
  }
}
async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await task();
  } catch (error) {
    message.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
async function createRoom() {
  await run(async () => {
    if (!displayName.value.trim()) return;
    const r = await new GameApiClient({ baseUrl: apiUrl }).createRoom(
      displayName.value.trim(),
    );
    await openRoom(r.room_id, r.player_id);
  });
}
async function joinRoom() {
  await run(async () => {
    if (!displayName.value.trim() || !joinCode.value.trim()) return;
    const id = joinCode.value.trim();
    const r = await new GameApiClient({ baseUrl: apiUrl }).joinRoom(
      id,
      displayName.value.trim(),
    );
    await openRoom(id, r.player.playerId);
  });
}
async function addAi(fill = false) {
  await run(async () => {
    if (!client.value || !isHost.value) return;
    let count = fill
      ? 9 - (state.value?.seats.filter((s) => s.playerType).length || 0)
      : 1;
    while (count-- > 0) {
      const r = await client.value.addAi(roomId.value);
      store.publicState = r.state;
    }
    message.value = "AI 已入座。";
  });
}
async function renameAi() {
  await run(async () => {
    if (!client.value || !renameSeat.value || !renameText.value.trim()) return;
    const r = await client.value.renameAi(
      roomId.value,
      renameSeat.value.seatId,
      renameText.value.trim(),
    );
    store.publicState = r.state;
    renameSeat.value = null;
  });
}
async function hostMutation(kind: "start" | "retry" | "cancel" | "turn") {
  await run(async () => {
    if (!client.value || !isHost.value) return;
    const r = await (kind === "start"
      ? client.value.startRoom(roomId.value)
      : kind === "retry"
        ? client.value.retryControllers(roomId.value)
        : kind === "cancel"
          ? client.value.cancelControllers(roomId.value)
          : client.value.retryTurn(roomId.value));
    if (r.state) store.publicState = r.state;
    if (kind === "retry") {
      const started = await client.value.startRoom(roomId.value);
      if (started.state) store.publicState = started.state;
    }
    await refresh();
  });
}
async function endGame() {
  await run(async () => {
    if (!client.value || !isHost.value) return;
    const r = await client.value.endRoom(roomId.value);
    settlement.value = r.settlement || null;
    stream?.close();
    voice.reset();
    hostPlayback.stop();
    endConfirm.value = false;
    if (state.value)
      store.publicState = {
        ...state.value,
        phase: "GAME_OVER",
        preparing: false,
      };
  });
}
function leaveRoom() {
  generation++;
  actionBusy.value = false;
  stream?.close();
  stream = null;
  voice.reset();
  hostPlayback.cleanup();
  client.value = null;
  store.reset();
  settlement.value = null;
  settlementError.value = "";
  roomId.value = "";
  playerId.value = "";
  joinCode.value = "";
  identityOpen.value = false;
  submittedKey.value = "";
  for (const k of ["linx-room", "linx-player", "linx-settlement"])
    sessionStorage.removeItem(k);
  message.value = "创建新房间，或加入朋友的房间。";
}
async function submit(
  path: "actions" | "votes" | "speeches" | "hunter-response" | "last-words",
  body:
    | ActionRequest
    | VoteRequest
    | SpeechRequest
    | HunterResponseRequest
    | LastWordsRequest,
) {
  if (!client.value || actionDisabled.value) return false;
  const key = actionKey.value;
  const run = generation;
  const commandKey = key + JSON.stringify(body);
  if (pendingCommand?.key !== commandKey)
    pendingCommand = { key: commandKey, id: crypto.randomUUID() };
  const payload = { ...body, action_id: pendingCommand.id };
  actionBusy.value = true;
  actionMessage.value = "正在提交…";
  try {
    const c = client.value;
    const r = await (path === "actions"
      ? c.submitAction(roomId.value, payload as ActionRequest)
      : path === "votes"
        ? c.submitVote(roomId.value, payload as VoteRequest)
        : path === "speeches"
          ? c.submitSpeech(roomId.value, payload as SpeechRequest)
          : path === "hunter-response"
            ? c.submitHunterResponse(
                roomId.value,
                payload as HunterResponseRequest,
              )
            : c.submitLastWords(roomId.value, payload as LastWordsRequest));
    if (run !== generation) return false;
    submittedKey.value = key;
    pendingCommand = null;
    if (r.state && (!state.value || r.state.version >= state.value.version))
      store.publicState = r.state;
    actionMessage.value = "已提交，等待流程推进。";
    await refresh();
    return true;
  } catch (error) {
    if (run === generation) {
      actionMessage.value = "提交失败：" + errorText(error);
      await refresh();
    }
    return false;
  } finally {
    if (run === generation) actionBusy.value = false;
  }
}
async function submitSpeech() {
  if (voice.busy.value || !speechText.value.trim()) return;
  if (await submit("speeches", { text: speechText.value.trim() })) {
    speechText.value = "";
    voice.markSubmitted();
  }
}
async function submitSkill() {
  const role = mine.value?.role;
  if (role === "werewolf")
    await submit("actions", {
      type: "wolf_target",
      target_seat_id: targetSeatId.value,
    });
  else if (role === "seer")
    await submit("actions", {
      type: "seer_check",
      target_seat_id: targetSeatId.value,
    });
  else if (role === "witch")
    await submit("actions", {
      type: "witch_action",
      action: witchAction.value,
      ...(witchAction.value === "poison"
        ? { target_seat_id: targetSeatId.value }
        : {}),
    });
}
async function submitHunter(shoot: boolean) {
  const window_id = mine.value?.hunterAction?.windowId;
  if (!window_id) return;
  await submit(
    "hunter-response",
    shoot
      ? { action: "shoot", target_seat_id: targetSeatId.value, window_id }
      : { action: "skip", window_id },
  );
}
async function submitLastWords(skip = false) {
  const window_id = mine.value?.lastWords?.windowId;
  if (!window_id) return;
  if (
    await submit(
      "last-words",
      skip
        ? { action: "skip", window_id }
        : { action: "submit", text: lastWordsText.value.trim(), window_id },
    )
  )
    lastWordsText.value = "";
}
async function startRecording() {
  try {
    await voice.start();
    await refresh();
  } catch (error) {
    actionMessage.value = errorText(error);
  }
}
async function cancelRecording() {
  await voice.cancel();
  await refresh();
}
async function audioControl(kind: "retry" | "skip") {
  try {
    await hostPlayback[kind]();
  } catch (error) {
    actionMessage.value = errorText(error);
  }
}
async function heartbeat() {
  if (!client.value || !state.value || finished.value) return;
  try {
    await client.value.heartbeat(roomId.value);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404)
      await loadSettlement();
  }
}
async function restoreControl() {
  await run(async () => {
    if (!client.value) return;
    await client.value.setControl(roomId.value, "human");
    await refresh();
  });
}
function downloadReport() {
  if (!settlement.value) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(settlement.value, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `月蚀议会-${settlement.value.roomId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function eventText(event: { type: string; data: Record<string, unknown> }) {
  const d = event.data;
  if (event.type === "game.pk_started") return "首次平票，进入候选人 PK 发言";
  if (event.type === "game.phase_changed")
    return String(d.phase).startsWith("NIGHT_")
      ? "夜间行动中"
      : phaseNames[String(d.phase)] || "流程推进";
  if (event.type === "game.player_eliminated")
    return `${seatName(String(d.seatId))} 已出局`;
  if (event.type === "game.vote_resolved")
    return `${d.pk ? "PK" : "首轮"}投票结算：${d.eliminatedSeatId ? seatName(String(d.eliminatedSeatId)) + " 出局" : "平票，无人出局"}`;
  if (event.type === "game.night_resolved")
    return `昨夜出局：${((d.deathSeatIds as string[]) || []).join("、") || "平安夜"}`;
  if (event.type === "game.last_words_submitted")
    return `${seatName(String(d.seatId))} 遗言：${d.text}`;
  if (event.type === "game.vote_submitted")
    return `${seatName(String(d.seatId))} 已投票`;
  return "";
}
const events = computed(() =>
  store.recentEvents
    .map((e) => ({ ...e, text: eventText(e) }))
    .filter((e) => e.text)
    .reverse(),
);
const reportSeats = computed(
  () =>
    (settlement.value?.seats || []) as Array<{
      seatId: string;
      displayName: string;
      role: Role;
      alive: boolean;
    }>,
);
const reportEliminations = computed(
  () =>
    (settlement.value?.eliminations || []) as Array<{
      seatId: string;
      cause: string;
    }>,
);
const reportVotes = computed(
  () => settlement.value?.voteResolutions || state.value?.voteResolutions || [],
);
const reportSpeeches = computed(
  () => settlement.value?.speeches || state.value?.speeches || [],
);
watch(actionKey, () => {
  targetSeatId.value = "";
  speechText.value = "";
  lastWordsText.value = "";
  witchAction.value = "skip";
  actionMessage.value = "";
  submittedKey.value = "";
  pendingCommand = null;
  voice.reset();
});
watch(targets, () => {
  if (!targets.value.some((s) => s.seatId === targetSeatId.value))
    targetSeatId.value = "";
});
watch(
  () => state.value?.version,
  () => hostPlayback.notify(),
);
watch(
  () => state.value?.phase,
  (phase) => {
    if (phase === "GAME_OVER") void loadSettlement();
  },
);
watch(
  () => store.error,
  (error) => {
    if (error) message.value = error;
  },
);
watch([showRules, endConfirm, renameSeat], async () => {
  await nextTick();
  document
    .querySelector<HTMLElement>(
      '[aria-modal="true"] button,[aria-modal="true"] input',
    )
    ?.focus();
});
function keyboard(event: KeyboardEvent) {
  const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]');
  if (event.key === "Escape") {
    showRules.value = false;
    endConfirm.value = false;
    renameSeat.value = null;
  }
  if (event.key === "Tab" && dialog) {
    const items = [
      ...dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,textarea",
      ),
    ];
    if (items.length) {
      event.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[
        (i + (event.shiftKey ? -1 : 1) + items.length) % items.length
      ]?.focus();
    }
  }
}
onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now();
  }, 250);
  heartbeatTimer = setInterval(() => void heartbeat(), 10000);
  window.addEventListener("keydown", keyboard);
  if (!state.value && roomId.value && playerId.value)
    void run(() => openRoom(roomId.value, playerId.value));
});
onBeforeUnmount(() => {
  generation++;
  stream?.close();
  voice.reset();
  hostPlayback.cleanup();
  clearInterval(ticker);
  clearInterval(heartbeatTimer);
  window.removeEventListener("keydown", keyboard);
});
</script>

<template>
  <div class="council" :data-scene="scene">
    <SceneBackground :scene="scene" />
    <CouncilLobby
      v-if="inLobby"
      :state="state"
      v-model:nickname="displayName"
      v-model:code="joinCode"
      :host="isHost"
      :busy="busy"
      :message="message"
      @create="createRoom"
      @join="joinRoom"
      @copy="copyRoomCode"
      @add="addAi()"
      @fill="addAi(true)"
      @rename="
        (seat) => {
          renameSeat = seat;
          renameText = seat.displayName;
        }
      "
      @start="hostMutation('start')"
      @retry="hostMutation('retry')"
      @cancel="hostMutation('cancel')"
      @leave="leaveRoom"
      @rules="showRules = true"
    />
    <template v-else>
      <header class="council-header">
        <div class="brand">
          <span>☾</span>
          <div>
            <h1 class="display">月蚀议会</h1>
            <small>九人预巫猎 · 第 {{ round }} 轮</small>
          </div>
        </div>
        <p class="phase-label">{{ phaseName }}</p>
        <div class="header-actions">
          <span :title="state?.roomId">{{ connectionLabel }}</span
          ><button @click="showRules = true">规则</button
          ><button v-if="isHost && !finished" @click="endConfirm = true">
            结束本局
          </button>
        </div>
      </header>
      <div
        v-if="disconnected && !finished"
        class="connection-banner"
        role="alert"
      >
        连接中断，自动重连中；操作暂不可用。<button @click="refresh">
          重新同步
        </button>
      </div>
      <main v-if="!finished" class="council-stage">
        <section class="ring-zone" aria-label="九人席位">
          <div class="council-ring">
            <div class="ring-line"></div>
            <button
              v-for="(seat, index) in state?.seats"
              :key="seat.seatId"
              class="council-seat"
              :class="{
                dead: !seat.alive,
                self: seat.seatId === mine?.seatId,
                speaking:
                  state?.phase === 'SPEECH' &&
                  state.currentSeatId === seat.seatId,
                candidate: state?.pk?.candidates.includes(seat.seatId),
                selectable:
                  needsTarget && targets.some((s) => s.seatId === seat.seatId),
                selected: targetSeatId === seat.seatId,
              }"
              :style="{
                '--sin': Math.sin((index / 9) * Math.PI * 2),
                '--cos': -Math.cos((index / 9) * Math.PI * 2),
              }"
              :aria-label="`${index + 1} 号 ${seat.displayName} ${!seat.alive ? '已出局' : ''}`"
              :aria-pressed="targetSeatId === seat.seatId"
              :disabled="
                !needsTarget ||
                actionDisabled ||
                !targets.some((s) => s.seatId === seat.seatId)
              "
              @click="targetSeatId = seat.seatId"
            >
              <div class="seat-art">
                <RoleSilhouette
                  :role="artRole(shownRole(seat.seatId))"
                  :veiled="!shownRole(seat.seatId)"
                /><b>{{ index + 1 }}</b
                ><span v-if="!seat.alive" class="dead-mark">出局</span>
              </div>
              <span class="seat-name">{{ seat.displayName }}</span
              ><small
                >{{ seat.seatId === mine?.seatId ? "你 · " : ""
                }}{{
                  state?.submittedVoteSeatIds.includes(seat.seatId)
                    ? "已投票"
                    : seat.playerType === "ai"
                      ? "灵矽 AI"
                      : "真人"
                }}</small
              >
            </button>
            <div class="council-hub">
              <span>{{ scene === "night" ? "☾" : state?.pk ? "✕" : "✧" }}</span>
              <h2 class="display">{{ phaseName }}</h2>
              <p>{{ state?.seats.filter((s) => s.alive).length }} / 9 存活</p>
              <p v-if="state?.phase === 'VOTE'">
                {{ state.submittedVoteSeatIds.length }} 人已投票
              </p>
            </div>
          </div>
          <p class="ring-note">
            暗牌对局 · 出局不翻牌<span v-if="state?.pk">
              · PK 候选 {{ state.pk.candidates.join("、") }}</span
            >
          </p>
        </section>
        <aside class="council-dock">
          <section class="glass identity-panel">
            <div class="panel-title">
              <h2>我的私密状态</h2>
              <button @click="identityOpen = !identityOpen">
                {{ identityOpen ? "收起身份" : "查看身份" }}
              </button>
            </div>
            <div v-if="identityOpen && mine?.role" class="identity-card">
              <RoleSilhouette :role="artRole(mine.role)" />
              <div>
                <h3 class="display">{{ roleNames[mine.role] }}</h3>
                <p>{{ mine.seatId }} · {{ mine.alive ? "存活" : "已出局" }}</p>
              </div>
            </div>
            <p v-else class="muted">身份已收起，只有你能查看。</p>
            <template v-if="identityOpen"
              ><p v-if="mine?.role === 'werewolf'" class="private-note">
                狼队友：{{
                  mine.werewolfTeammates?.map(seatName).join("、") ||
                  "暂无存活队友"
                }}<br /><span v-if="mine.wolfProposal"
                  >队友已选择
                  {{ seatName(mine.wolfProposal) }}，请确认一致目标。</span
                >
              </p>
              <p v-if="mine?.role === 'seer'" class="private-note">
                查验记录：<span v-if="!mine.seerResults.length">暂无</span
                ><span v-for="(r, i) in mine.seerResults" :key="i"
                  >{{ r.targetSeatId || r.seatId }} ·
                  {{ r.result === "werewolf" ? "狼人" : "好人" }}；</span
                >
              </p>
              <p v-if="mine?.role === 'witch'" class="private-note">
                解药 {{ mine.skills.antidoteAvailable ? "可用" : "已用" }} ·
                毒药 {{ mine.skills.poisonAvailable ? "可用" : "已用"
                }}<br />今晚刀口：{{
                  mine.nightVictim ? seatName(mine.nightVictim) : "无"
                }}
                · 每夜限一种行动
              </p></template
            >
          </section>
          <section class="glass action-panel">
            <div class="panel-title">
              <h2>{{ action ? "轮到你行动" : "等待中" }}</h2>
              <span v-if="secondsLeft !== null" class="countdown"
                >{{ secondsLeft }} 秒</span
              >
            </div>
            <p v-if="aiFailed" class="error" role="alert">AI 回合失败，已暂停操作，等待房主重试。</p>
            <p v-if="!action" class="muted" role="status">{{ waiting }}</p>
            <p v-if="timeExpired" class="error">
              响应时间已到，等待服务端结算。
            </p>
            <template v-if="action === 'speech'"
              ><p class="muted">
                {{ state?.pk ? "平票候选发言" : "按存活席位号码递增发言" }} ·
                草稿确认后才公开
              </p>
              <label
                >公开发言<textarea
                  v-model="speechText"
                  rows="4"
                  maxlength="1200"
                  placeholder="说出你的判断"
                  :disabled="actionDisabled"
                />
              </label>
              <div class="voice-controls">
                <p role="status">
                  {{
                    voice.draft.value.stage === "recording"
                      ? `正在录音 · 剩余 ${Math.ceil(voice.remainingMs.value / 1000)} 秒`
                      : voice.draft.value.stage === "transcribing"
                        ? "正在转写，请稍候"
                        : voice.draft.value.stage === "confirming"
                          ? "转写完成，请检查文字后提交"
                          : voice.draft.value.error ||
                            "支持录音转写，也可直接输入。"
                  }}
                </p>
                <div class="buttons">
                  <button
                    :disabled="voice.busy.value || actionDisabled"
                    @click="startRecording"
                  >
                    开始录音</button
                  ><button
                    v-if="voice.draft.value.stage === 'recording'"
                    @click="voice.stop"
                  >
                    结束录音</button
                  ><button
                    v-if="voice.draft.value.stage !== 'idle'"
                    @click="cancelRecording"
                  >
                    取消录音/转写
                  </button>
                </div>
              </div>
              <button
                class="gold"
                :disabled="
                  actionDisabled || voice.busy.value || !speechText.trim()
                "
                @click="submitSpeech"
              >
                确认提交发言
              </button></template
            >
            <template v-if="action === 'lastwords'"
              ><p class="muted">遗言最多 200 字，确认提交后公开。</p>
              <label
                >遗言<textarea
                  v-model="lastWordsText"
                  maxlength="200"
                  rows="3"
                  :disabled="actionDisabled"
                />
              </label>
              <div class="buttons">
                <button
                  class="gold"
                  :disabled="actionDisabled || !lastWordsText.trim()"
                  @click="submitLastWords()"
                >
                  提交遗言</button
                ><button
                  :disabled="actionDisabled"
                  @click="submitLastWords(true)"
                >
                  跳过遗言
                </button>
              </div></template
            >
            <template v-if="action === 'skill' && mine?.role === 'witch'"
              ><label
                >女巫行动<select
                  v-model="witchAction"
                  :disabled="actionDisabled"
                >
                  <option value="skip">今晚不用药</option>
                  <option
                    value="save"
                    :disabled="!mine.skills.antidoteAvailable"
                  >
                    使用解药
                  </option>
                  <option
                    value="poison"
                    :disabled="!mine.skills.poisonAvailable"
                  >
                    使用毒药
                  </option>
                </select></label
              ></template
            >
            <label v-if="needsTarget"
              >{{
                action === "vote"
                  ? "投票目标"
                  : action === "hunter"
                    ? "开枪目标"
                    : "行动目标"
              }}<select v-model="targetSeatId" :disabled="actionDisabled">
                <option value="">点击席位或选择目标</option>
                <option v-for="s in targets" :key="s.seatId" :value="s.seatId">
                  {{ seatName(s.seatId) }}
                </option>
              </select></label
            >
            <p v-if="action === 'vote'" class="muted">
              {{
                state?.pk
                  ? "仅台下存活玩家重投平票候选；再次平票无人出局。"
                  : "投票结束前只公开已投席位，不公开选票。"
              }}
            </p>
            <div class="buttons">
              <button
                v-if="action === 'skill'"
                class="gold"
                :disabled="actionDisabled || (needsTarget && !targetSeatId)"
                @click="submitSkill"
              >
                确认行动</button
              ><button
                v-if="action === 'vote'"
                class="gold"
                :disabled="actionDisabled || !targetSeatId"
                @click="submit('votes', { target_seat_id: targetSeatId })"
              >
                确认投票</button
              ><button
                v-if="action === 'hunter'"
                class="gold"
                :disabled="
                  actionDisabled ||
                  !targetSeatId ||
                  mine?.hunterAction?.canShoot === false
                "
                @click="submitHunter(true)"
              >
                确认开枪</button
              ><button
                v-if="action === 'hunter'"
                :disabled="actionDisabled"
                @click="submitHunter(false)"
              >
                放弃开枪
              </button>
            </div>
            <p v-if="actionMessage" class="action-message" role="status">
              {{ actionMessage }}
            </p>
            <button
              v-if="mySeat?.controlSource === 'rule_bot'"
              :disabled="busy"
              @click="restoreControl"
            >
              恢复本人控制
            </button>
            <button
              v-if="
                isHost && state?.controllers.some((c) => c.status === 'failed')
              "
              :disabled="busy"
              @click="hostMutation('turn')"
            >
              重试失败 AI 回合
            </button>
          </section>
          <section class="glass audio-panel">
            <div class="panel-title">
              <h2>公共语音</h2>
              <small>{{
                hostPlayback.enabled.value ? "已启用" : "未启用"
              }}</small>
            </div>
            <p class="muted" role="status">{{ hostPlayback.status.value }}</p>
            <p
              v-if="state?.hostPlaybackBlocked && !hostPlayback.enabled.value"
              class="private-note"
            >
              等待主持播报；房主请启用公共声音以继续。
            </p>
            <div class="buttons">
              <button
                @click="
                  hostPlayback.enabled.value
                    ? hostPlayback.stop()
                    : hostPlayback.start()
                "
              >
                {{
                  hostPlayback.enabled.value ? "暂停公共声音" : "启用公共声音"
                }}</button
              ><button
                v-if="hostPlayback.canManage.value && hostPlayback.error.value"
                @click="audioControl('retry')"
              >
                重试音频</button
              ><button
                v-if="hostPlayback.canManage.value && hostPlayback.task.value"
                @click="audioControl('skip')"
              >
                跳过当前音频
              </button>
            </div>
          </section>
          <p class="muted" role="status">{{ message }}</p>
        </aside>
      </main>
      <main v-else class="council-result">
        <p class="eyebrow">THE END · 身份公开</p>
        <h2 class="display">
          {{
            settlement?.winner === "good"
              ? "好人阵营获胜"
              : settlement?.winner === "werewolf"
                ? "狼人阵营获胜"
                : "本局结束"
          }}
        </h2>
        <p class="muted">{{ settlement?.reason || "正在获取结算报告…" }}</p>
        <p v-if="settlementError" class="error">
          {{ settlementError }}
          <button @click="loadSettlement">重试结算</button>
        </p>
        <div class="result-roles">
          <article v-for="s in reportSeats" :key="s.seatId" class="glass">
            <RoleSilhouette :role="artRole(s.role)" /><strong>{{
              roleNames[s.role] || "身份未知"
            }}</strong
            ><span>{{ s.seatId }} · {{ s.displayName }}</span
            ><small>{{ s.alive ? "存活" : "已出局" }}</small>
          </article>
        </div>
        <section class="result-audio">
          <p class="muted">{{ hostPlayback.status.value }}</p>
          <button
            @click="
              hostPlayback.enabled.value
                ? hostPlayback.stop()
                : hostPlayback.start()
            "
          >
            {{
              hostPlayback.enabled.value ? "暂停公共声音" : "启用公共声音"
            }}</button
          ><button
            v-if="hostPlayback.canManage.value && hostPlayback.error.value"
            @click="audioControl('retry')"
          >
            重试音频
          </button>
        </section>
        <div class="buttons result-buttons">
          <button class="gold" @click="leaveRoom">返回大厅</button
          ><button :disabled="!settlement" @click="downloadReport">
            下载本局记录
          </button>
        </div>
        <div class="result-records">
          <section class="glass">
            <h3>出局顺序</h3>
            <p v-for="(e, i) in reportEliminations" :key="i">
              {{ i + 1 }}. {{ e.seatId }} ·
              {{
                e.cause === "night"
                  ? "夜间出局"
                  : e.cause === "vote"
                    ? "放逐出局"
                    : "技能出局"
              }}
            </p>
            <p v-if="!reportEliminations.length" class="muted">暂无出局记录</p>
          </section>
          <section class="glass">
            <h3>投票记录</h3>
            <p v-for="r in reportVotes" :key="r.resolutionId">
              第 {{ r.round + 1 }} 轮 {{ r.pk ? "PK" : "首轮" }}：{{
                r.entries.map((e) => `${e.seatId} ${e.votes}票`).join("、")
              }}
              · {{ r.eliminatedSeatId || "无人出局" }}
            </p>
          </section>
          <section class="glass">
            <h3>公开发言</h3>
            <p v-for="s in reportSpeeches" :key="s.speechId">
              <strong>{{ s.seatId }}</strong
              >：{{ s.text }}
            </p>
          </section>
        </div>
      </main>
      <details v-if="!finished" class="public-log">
        <summary>桌边记录 · {{ events.length }} 条公开动态</summary>
        <div class="log-columns">
          <section>
            <h3>公开动态</h3>
            <p v-for="e in events" :key="e.eventId">{{ e.text }}</p>
          </section>
          <section>
            <h3>公开发言</h3>
            <p v-for="s in state?.speeches" :key="s.speechId">
              <strong>{{ s.seatId }}</strong
              >：{{ s.text }}
            </p>
          </section>
          <section>
            <h3>已结算投票</h3>
            <p v-for="r in state?.voteResolutions" :key="r.resolutionId">
              第 {{ r.round + 1 }} 轮 {{ r.pk ? "PK" : "首轮" }}：{{
                r.entries.map((e) => `${e.seatId} ${e.votes}票`).join("、")
              }}
            </p>
          </section>
        </div>
      </details>
    </template>
    <div
      v-if="showRules || endConfirm || renameSeat"
      class="dialog-backdrop"
      @click.self="
        showRules = false;
        endConfirm = false;
        renameSeat = null;
      "
    >
      <section
        class="glass dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="
          showRules ? '本局规则' : endConfirm ? '提前结束确认' : '修改 AI 名称'
        "
      >
        <template v-if="showRules"
          ><h2 class="display">本局规则</h2>
          <p>
            九人预巫猎：三狼、预言家、女巫、猎人、三平民；无警长、无自爆，死亡不自动翻牌。
          </p>
          <p>
            白天按存活席位号码递增发言。首次平票由候选人 PK
            发言，台下存活玩家重投候选；再次平票无人出局。
          </p>
          <p>
            狼人必须确认一致目标，不能攻击自己或队友。查验结果仅预言家本人可见。女巫每夜限一种行动；药品、自救和刀口以服务端状态为准。
          </p>
          <p>
            猎人响应与遗言均由服务端计时。遗言最多 200
            字；首夜死亡、白天放逐可留遗言。AI 失败由房主重试。
          </p>
          <button class="gold" @click="showRules = false">
            知道了
          </button></template
        >
        <template v-else-if="endConfirm"
          ><h2 class="display">提前结束本局？</h2>
          <p>
            将结束当前房间、生成结算报告并释放 AI 会话。新一局需要创建新房间。
          </p>
          <div class="buttons">
            <button class="gold" :disabled="busy" @click="endGame">
              确认结束</button
            ><button :disabled="busy" @click="endConfirm = false">
              继续游戏
            </button>
          </div>
          <p class="error" role="status">{{ message }}</p></template
        >
        <template v-else
          ><h2 class="display">修改 AI 名称</h2>
          <label
            >新昵称<input
              v-model="renameText"
              maxlength="24"
              :disabled="busy"
              @keydown.enter="renameAi"
          /></label>
          <div class="buttons">
            <button
              class="gold"
              :disabled="busy || !renameText.trim()"
              @click="renameAi"
            >
              保存名称</button
            ><button :disabled="busy" @click="renameSeat = null">取消</button>
          </div>
          <p class="error" role="status">{{ message }}</p></template
        >
      </section>
    </div>
  </div>
</template>
