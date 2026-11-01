import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { GameApiClient, type CreateRoomResponse, type JoinRoomResponse } from '../../api/client';
import type { ActionRequest, HunterResponseRequest, LastWordsRequest, SpeechRequest, VoteRequest } from '../../../../../packages/protocol/src/api';
import { useRoomStream } from '../../composables/useRoomStream';
import { useRoomStore } from '../../stores/room';
import { PHASE_LABEL, ROLE_CATALOG, isNightPhase, type GamePhase, type GameRole, type PublicSeat, type SeerCheck, type VoteTally } from '../types';
import type { PrivateState, RoomPublicState, SeatState } from '../../../../../packages/protocol/src/types';

type Stream = ReturnType<typeof useRoomStream>;
const initialOf = (name: string) => [...name].slice(0, 1).join('') || '?';

export const useGameStore = defineStore('game', () => {
  const room = useRoomStore();
  const client = shallowRef<GameApiClient | null>(null);
  const stream = shallowRef<Stream | null>(null);
  const roomIdRef = ref(sessionStorage.getItem('linx-room') || '');
  const playerId = ref(sessionStorage.getItem('linx-player') || '');
  const displayName = ref(sessionStorage.getItem('linx-name') || '玩家');
  const apiUrl = ref(new URLSearchParams(location.search).get('api') || (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? 'http://127.0.0.1:5100' : location.origin));
  const selectedSeatId = ref<string | null>(null);
  const notice = ref('');
  const actionBusy = ref(false);
  const speech = ref('');
  const witchAction = ref<'skip' | 'save' | 'poison'>('skip');
  const settlement = ref<Record<string, unknown> | null>(null);

  const publicState = computed(() => room.publicState as RoomPublicState | null);
  const roomId = computed({ get: () => publicState.value?.roomId || roomIdRef.value, set: value => { roomIdRef.value = value; } });
  const privateState = computed(() => room.privateState as PrivateState | null);
  const phase = computed<GamePhase>(() => (publicState.value?.phase || 'LOBBY') as GamePhase);
  const day = computed(() => Math.max(1, (publicState.value?.round || 0) + 1));
  const night = computed(() => isNightPhase(phase.value));
  const selfSeatId = computed(() => privateState.value?.seatId || '');
  const selfRole = computed<GameRole>(() => (privateState.value?.role || 'villager') as GameRole);
  const selfMeta = computed(() => ROLE_CATALOG[selfRole.value] || ROLE_CATALOG.villager);
  const selfAlive = computed(() => Boolean(privateState.value?.alive));
  const publicSeatStates = computed(() => publicState.value?.seats || []);
  const selfSeat = computed(() => publicSeatStates.value.find(seat => seat.seatId === selfSeatId.value) || ({ seatId: selfSeatId.value || 'P?', displayName: displayName.value, alive: selfAlive.value } as SeatState));
  const currentSpeakerId = computed(() => publicState.value?.currentSeatId || null);
  const currentSpeaker = computed(() => publicSeatStates.value.find(seat => seat.seatId === currentSpeakerId.value) || null);
  const actionDeadline = computed(() => publicState.value?.speechDeadline || (privateState.value?.currentTurn as any)?.expiresAt || (privateState.value?.hunterAction as any)?.expiresAt || (privateState.value?.lastWords as any)?.expiresAt || null);
  const voteResolution = computed(() => publicState.value?.voteResolutions?.at(-1));
  const voteTally = computed<VoteTally[]>(() => (voteResolution.value?.entries || []).map(entry => ({ seatId: entry.seatId, votes: entry.votes })));
  const totalVotes = computed(() => publicState.value?.submittedVoteSeatIds?.length || voteResolution.value?.totalVotes || 0);
  const leader = computed(() => voteTally.value.slice().sort((a, b) => b.votes - a.votes)[0] || null);
  const voteSubmitted = computed(() => Boolean(publicState.value?.submittedVoteSeatIds?.includes(selfSeatId.value)));
  const submittedVoteSeatId = computed(() => voteSubmitted.value ? selectedSeatId.value : null);
  const aliveCount = computed(() => publicSeatStates.value.filter(seat => seat.alive).length);
  const publicSeats = computed<PublicSeat[]>(() => publicSeatStates.value.map(seat => ({
    id: seat.seatId,
    name: seat.displayName || seat.seatId,
    initial: initialOf(seat.displayName || seat.seatId),
    alive: seat.alive,
    isSelf: seat.seatId === selfSeatId.value,
    isSpeaking: phase.value === 'SPEECH' && seat.seatId === currentSpeakerId.value,
    isSelected: seat.seatId === selectedSeatId.value,
    voted: publicState.value?.submittedVoteSeatIds?.includes(seat.seatId) || false,
    voteCount: voteTally.value.find(row => row.seatId === seat.seatId)?.votes || 0,
  })));
  const revealedSeats = computed(() => {
    const report = settlement.value || publicState.value?.settlement as Record<string, unknown> | null;
    const seats = Array.isArray(report?.seats) ? report.seats as Array<Record<string, unknown>> : [];
    return publicSeats.value.map(seat => {
      const revealed = seats.find(item => item.seatId === seat.id);
      return { ...seat, role: revealed?.role as GameRole | undefined, camp: revealed?.camp as 'good' | 'wolf' | undefined };
    });
  });
  const wolfTeammates = computed(() => {
    const ids = Array.isArray(privateState.value?.werewolfTeammates) ? privateState.value?.werewolfTeammates as string[] : [];
    return ids.map(id => ({ id, name: publicSeats.value.find(seat => seat.id === id)?.name || id, alive: publicSeats.value.find(seat => seat.id === id)?.alive !== false, isSelf: id === selfSeatId.value }));
  });
  const seerChecks = computed<SeerCheck[]>(() => (privateState.value?.seerResults || []).map((item: any) => ({ targetSeatId: item.targetSeatId || item.seatId, result: item.result === 'werewolf' || item.result === 'wolf' ? 'wolf' : 'good', night: item.round || day.value })));
  const phaseTitle = computed(() => {
    if (phase.value === 'SPEECH') return `第 ${day.value} 天 · 顺序发言`;
    if (phase.value === 'VOTE') return `第 ${day.value} 天 · 放逐投票`;
    if (phase.value === 'GAME_OVER') return `第 ${day.value} 天 · 本局结束`;
    if (phase.value === 'DAY_ANNOUNCEMENT') return `第 ${day.value} 天 · 天亮了`;
    if (night.value) return isMyAction.value ? `第 ${day.value} 夜 · ${PHASE_LABEL[phase.value] || phase.value}` : `第 ${day.value} 夜 · 夜幕中`;
    return PHASE_LABEL[phase.value] || phase.value;
  });
  const isMyAction = computed(() => {
    if (!privateState.value?.alive) return false;
    if (phase.value === 'SPEECH') return currentSpeakerId.value === selfSeatId.value;
    if (phase.value === 'VOTE') return !voteSubmitted.value;
    if (phase.value === 'HUNTER_RESPONSE') return Boolean(privateState.value?.hunterAction);
    if (phase.value === 'LAST_WORDS') return Boolean(privateState.value?.lastWords);
    if (phase.value === 'NIGHT_WOLF') return selfRole.value === 'werewolf';
    if (phase.value === 'NIGHT_SEER') return selfRole.value === 'seer';
    if (phase.value === 'NIGHT_WITCH') return selfRole.value === 'witch';
    return false;
  });

  function newClient(nextPlayerId = playerId.value) { return new GameApiClient({ baseUrl: apiUrl.value, playerId: nextPlayerId }); }
  async function refresh() { if (client.value && roomId.value) await room.refreshAfterEvent(client.value, roomId.value); }
  async function openRoom(nextRoomId: string, nextPlayerId: string, nextDisplayName = displayName.value) {
    stream.value?.close();
    room.reset();
    roomId.value = nextRoomId; playerId.value = nextPlayerId; displayName.value = nextDisplayName;
    client.value = newClient(nextPlayerId);
    sessionStorage.setItem('linx-api', apiUrl.value.replace(/\/$/, ''));
    sessionStorage.setItem('linx-room', roomId.value); sessionStorage.setItem('linx-player', playerId.value); sessionStorage.setItem('linx-name', displayName.value);
    await room.hydrate(client.value, roomId.value);
    stream.value = useRoomStream(client.value, roomId.value);
  }
  async function restore() { if (roomId.value && playerId.value) { try { await openRoom(roomId.value, playerId.value); } catch (error) { notice.value = error instanceof Error ? error.message : '房间恢复失败'; } } }
  async function createRoom(name = displayName.value) { const response = await newClient('').createRoom(name.trim() || '玩家') as CreateRoomResponse; await openRoom(response.room_id, response.player_id, name); return response; }
  async function joinRoom(id = roomId.value, name = displayName.value) { const response = await newClient('').joinRoom(id.trim(), name.trim() || '玩家') as JoinRoomResponse; await openRoom(id.trim(), response.player.playerId, name); return response; }
  async function runMutation(request: () => Promise<{ state?: RoomPublicState }>) {
    if (!client.value || !roomId.value) throw new Error('请先进入房间');
    if (actionBusy.value) return null;
    actionBusy.value = true;
    try { const response = await request(); if (response.state) room.publicState = response.state; await refresh(); return response; }
    finally { actionBusy.value = false; }
  }
  async function startGame() { if (!client.value || !roomId.value) throw new Error('请先进入房间'); return runMutation(() => client.value!.startRoom(roomId.value)); }
  async function retryControllers() { return runMutation(() => client.value!.retryControllers(roomId.value)); }
  async function cancelControllers() { return runMutation(() => client.value!.cancelControllers(roomId.value)); }
  async function retryTurn() { return runMutation(() => client.value!.retryTurn(roomId.value)); }
  async function endGame() { if (!client.value || !roomId.value) return; const response = await client.value.endRoom(roomId.value); settlement.value = (response.settlement || null) as Record<string, unknown> | null; stream.value?.close(); if (publicState.value) room.publicState = { ...publicState.value, phase: 'GAME_OVER', preparing: false }; return response; }
  async function loadSettlement() { if (!client.value || !roomId.value) return null; const response = await client.value.settlement(roomId.value); settlement.value = response.settlement as unknown as Record<string, unknown>; return settlement.value; }
  async function addAi(name?: string) { if (!client.value || !roomId.value) return; const response = await client.value.addAi(roomId.value, name); room.publicState = response.state; return response; }
  async function renameAi(seatId: string, name: string) { if (!client.value || !roomId.value) return; const response = await client.value.renameAi(roomId.value, seatId, name); room.publicState = response.state; return response; }
  async function submitAction(path: string, body: ActionRequest | VoteRequest | SpeechRequest | HunterResponseRequest | LastWordsRequest) {
    if (!client.value || !roomId.value) throw new Error('请先进入房间');
    const payload = { ...body, action_id: `${path.replaceAll('/', '_')}_${crypto.randomUUID()}` } as typeof body;
    return runMutation(() => path === '/actions' ? client.value!.submitAction(roomId.value, payload as ActionRequest) : path === '/votes' ? client.value!.submitVote(roomId.value, payload as VoteRequest) : path === '/speeches' ? client.value!.submitSpeech(roomId.value, payload as SpeechRequest) : path === '/hunter-response' ? client.value!.submitHunterResponse(roomId.value, payload as HunterResponseRequest) : client.value!.submitLastWords(roomId.value, payload as LastWordsRequest));
  }
  async function submitSpeech(text: string) { if (!text.trim()) { notice.value = '发言不能为空。'; return; } await submitAction('/speeches', { text: text.trim() }); notice.value = '发言已提交。'; speech.value = ''; }
  async function confirmAction() {
    if (!selectedSeatId.value) { notice.value = '请先选择一个目标。'; return; }
    if (phase.value === 'NIGHT_WOLF') await submitAction('/actions', { type: 'wolf_target', target_seat_id: selectedSeatId.value });
    else if (phase.value === 'NIGHT_SEER') await submitAction('/actions', { type: 'seer_check', target_seat_id: selectedSeatId.value });
    else if (phase.value === 'NIGHT_WITCH') await submitAction('/actions', { type: 'witch_action', action: witchAction.value, ...(witchAction.value === 'poison' ? { target_seat_id: selectedSeatId.value } : {}) });
    else if (phase.value === 'VOTE') await submitAction('/votes', { target_seat_id: selectedSeatId.value });
    else if (phase.value === 'HUNTER_RESPONSE') await submitAction('/hunter-response', { action: 'shoot', target_seat_id: selectedSeatId.value, window_id: (privateState.value?.hunterAction as any)?.windowId });
    notice.value = '行动已提交，等待服务端推进。';
  }
  async function skipAction() {
    if (phase.value === 'NIGHT_WITCH') { await submitAction('/actions', { type: 'witch_action', action: 'skip' }); notice.value = '已选择不使用药剂。'; }
    else if (phase.value === 'HUNTER_RESPONSE') { await submitAction('/hunter-response', { action: 'skip', window_id: (privateState.value?.hunterAction as any)?.windowId }); notice.value = '已放弃猎人技能。'; }
    else if (phase.value === 'LAST_WORDS') { await submitAction('/last-words', { action: 'skip', window_id: (privateState.value?.lastWords as any)?.windowId }); notice.value = '已跳过遗言。'; }
  }
  async function submitLastWords(text: string) { await submitAction('/last-words', { action: 'submit', text: text.trim(), window_id: (privateState.value?.lastWords as any)?.windowId }); notice.value = '遗言已提交。'; }
  async function announceDay() { await submitAction('/actions', { type: 'announce_day' }); notice.value = '已宣布天亮。'; }
  function selectSeat(id: string) { const target = publicSeats.value.find(seat => seat.id === id); if (!target?.alive || (phase.value === 'NIGHT_WOLF' && wolfTeammates.value.some(member => member.id === id)) || target.isSelf && ['NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH'].includes(phase.value)) return; selectedSeatId.value = id; notice.value = ''; }
  function setPhase(next: GamePhase) { if (next === 'VOTE' || next === 'SPEECH') notice.value = '阶段由服务端推进，请等待实时事件。'; }
  function reset() { selectedSeatId.value = null; notice.value = ''; speech.value = ''; settlement.value = null; }

  return { room, publicState, privateState, client, roomId, playerId, displayName, apiUrl, phase, day, night, selfSeatId, selfRole, selfMeta, selfAlive, selfSeat, publicSeats, revealedSeats, currentSpeakerId, currentSpeaker, actionDeadline, selectedSeatId, submittedVoteSeatId, speech, witchAction, seerChecks, wolfTeammates, phaseTitle, isMyAction, aliveCount, totalVotes, voteTally, leader, voteSubmitted, settlement, notice, actionBusy, publicSeatStates, restore, createRoom, joinRoom, openRoom, refresh, loadSettlement, addAi, renameAi, startGame, retryControllers, cancelControllers, retryTurn, endGame, submitSpeech, submitAction, confirmAction, skipAction, submitLastWords, announceDay, selectSeat, setPhase, reset };
});
