import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  PHASE_LABEL,
  ROLE_CATALOG,
  isNightPhase,
  type DemoScene,
  type GamePhase,
  type GameRole,
  type PublicSeat,
  type Seat,
  type SeerCheck,
  type VoteTally,
} from '../types';
import { MOCK_SEATS, MOCK_STORY, MOCK_VOTE_TALLY } from '../mock/seats';

export const useGameStore = defineStore('game', () => {
  const roomId = ref(MOCK_STORY.roomId);
  const phase = ref<GamePhase>('SPEECH');
  const day = ref(MOCK_STORY.day);
  const selfSeatId = ref('P7');
  const currentSpeakerId = ref<string | null>(MOCK_STORY.currentSpeakerId);
  const selectedSeatId = ref<string | null>(null);
  const submittedVoteSeatId = ref<string | null>(null);
  const submittedSpeech = ref('');
  const speech = ref(MOCK_STORY.speech);
  const guardLastTarget = ref(MOCK_STORY.guardLastTarget);
  const guardTarget = ref<string | null>(MOCK_STORY.guardTarget);
  const wolfTarget = ref<string | null>(MOCK_STORY.wolfTarget);
  const witchPoisonTarget = ref<string | null>(MOCK_STORY.witchPoisonTarget);
  const seerChecks = ref<SeerCheck[]>([
    { targetSeatId: 'P6', result: 'wolf', night: 2 },
    { targetSeatId: 'P1', result: 'good', night: 1 },
  ]);
  const voteTally = ref<VoteTally[]>(MOCK_VOTE_TALLY.map(row => ({ ...row })));
  const winner = ref<'good' | 'wolf' | null>(null);
  const demoMode = ref(import.meta.env.DEV || new URLSearchParams(location.search).has('demo'));
  const notice = ref('');

  const night = computed(() => isNightPhase(phase.value));
  const RESULT_DEAD = ['P2', 'P4', 'P6', 'P9'];
  const alive = computed(() => (seat: Seat) => {
    if (phase.value === 'LOBBY') return true;
    if (phase.value === 'RESULT') return !RESULT_DEAD.includes(seat.id);
    if (seat.id === 'P4' || seat.id === 'P9') return false;
    if (seat.id === 'P2') return night.value;
    return seat.alive;
  });
  const aliveSeats = computed(() => MOCK_SEATS.filter(seat => alive.value(seat)));
  const selfSeat = computed(() => MOCK_SEATS.find(seat => seat.id === selfSeatId.value) || MOCK_SEATS[6]);
  const selfRole = computed<GameRole>(() => selfSeat.value.role);
  const selfMeta = computed(() => ROLE_CATALOG[selfRole.value]);
  const wolfTeammates = computed(() => selfRole.value === 'werewolf' ? MOCK_SEATS.filter(seat => seat.role === 'werewolf').map(seat => ({ id: seat.id, name: seat.name, alive: alive.value(seat), isSelf: seat.id === selfSeatId.value })) : []);
  const selfAlive = computed(() => alive.value(selfSeat.value));
  const currentSpeaker = computed(() => MOCK_SEATS.find(seat => seat.id === currentSpeakerId.value) || null);
  const isMyAction = computed(() => {
    if (phase.value === 'SPEECH') return currentSpeakerId.value === selfSeatId.value;
    if (phase.value === 'VOTE') return selfAlive.value && submittedVoteSeatId.value === null;
    if (phase.value === 'NIGHT_GUARD') return selfRole.value === 'guard';
    if (phase.value === 'NIGHT_WOLF') return selfRole.value === 'werewolf';
    if (phase.value === 'NIGHT_SEER') return selfRole.value === 'seer';
    if (phase.value === 'NIGHT_WITCH') return selfRole.value === 'witch';
    return false;
  });
  const phaseTitle = computed(() => {
    if (phase.value === 'SPEECH') return `第 ${day.value} 天 · 顺序发言`;
    if (phase.value === 'VOTE') return `第 ${day.value} 天 · 放逐投票`;
    if (phase.value === 'RESULT') return `第 ${day.value} 天 · 本局结束`;
    if (phase.value === 'DAY_ANNOUNCEMENT') return `第 ${day.value} 天 · 天亮了`;
    if (night.value) return isMyAction.value ? `第 ${day.value} 夜 · ${PHASE_LABEL[phase.value]}` : `第 ${day.value} 夜 · 夜幕中`;
    return PHASE_LABEL[phase.value];
  });
  const phaseRailActive = computed(() => phase.value === 'VOTE' ? 'vote' : phase.value === 'SPEECH' ? 'speech' : 'dawn');
  const publicSeats = computed<PublicSeat[]>(() => MOCK_SEATS.map(seat => ({
    id: seat.id,
    name: seat.name,
    initial: seat.initial,
    alive: alive.value(seat),
    isSelf: seat.id === selfSeatId.value,
    isSpeaking: phase.value === 'SPEECH' && seat.id === currentSpeakerId.value,
    isSelected: seat.id === selectedSeatId.value,
    voted: phase.value === 'VOTE' ? submittedVoteSeatId.value !== null : false,
    voteCount: voteTally.value.find(row => row.seatId === seat.id)?.votes || 0,
  })));
  const revealedSeats = computed(() => MOCK_SEATS.map(seat => ({ ...seat, alive: !RESULT_DEAD.includes(seat.id) })));
  const aliveCount = computed(() => aliveSeats.value.length);
  const totalVotes = computed(() => voteTally.value.reduce((sum, row) => sum + row.votes, 0));
  const leader = computed(() => voteTally.value.slice().sort((a, b) => b.votes - a.votes)[0]);
  const voteSubmitted = computed(() => submittedVoteSeatId.value !== null);
  const isFinal = computed(() => phase.value === 'RESULT');

  function setPhase(next: GamePhase) {
    phase.value = next;
    if (next === 'SPEECH') { currentSpeakerId.value = MOCK_STORY.currentSpeakerId; selectedSeatId.value = null; }
    if (next === 'VOTE') { selectedSeatId.value = null; }
    if (next === 'NIGHT_GUARD') { selectedSeatId.value = guardTarget.value; }
    if (next === 'NIGHT_WOLF') { selectedSeatId.value = wolfTarget.value; }
    if (next === 'NIGHT_WITCH') { selectedSeatId.value = witchPoisonTarget.value; }
    if (next === 'NIGHT_SEER') { selectedSeatId.value = 'P6'; }
    if (next === 'RESULT') { winner.value = 'good'; }
  }

  function applyScene(scene: DemoScene) {
    selectedSeatId.value = null;
    submittedVoteSeatId.value = null;
    if (scene === 'guard') { selfSeatId.value = 'P8'; setPhase('NIGHT_GUARD'); }
    else if (scene === 'wolf') { selfSeatId.value = 'P2'; setPhase('NIGHT_WOLF'); }
    else if (scene === 'seer') { selfSeatId.value = 'P7'; setPhase('NIGHT_SEER'); }
    else if (scene === 'witch') { selfSeatId.value = 'P5'; setPhase('NIGHT_WITCH'); }
    else if (scene === 'vote') { selfSeatId.value = 'P7'; setPhase('VOTE'); }
    else if (scene === 'result') { selfSeatId.value = 'P7'; winner.value = 'good'; setPhase('RESULT'); }
    else { selfSeatId.value = 'P7'; setPhase('SPEECH'); }
    notice.value = '';
  }

  function setViewpoint(seatId: string) {
    if (MOCK_SEATS.some(seat => seat.id === seatId)) selfSeatId.value = seatId;
  }

  function selectSeat(seatId: string) {
    if (phase.value === 'SPEECH') return;
    const target = MOCK_SEATS.find(seat => seat.id === seatId);
    if (!target || !alive.value(target)) return;
    if (phase.value === 'VOTE' && !selfAlive.value) return;
    if (phase.value === 'NIGHT_GUARD' && seatId === guardLastTarget.value) return;
    if (phase.value === 'NIGHT_WOLF' && target.camp === 'wolf') return;
    if (phase.value === 'NIGHT_SEER' && (seatId === selfSeatId.value)) return;
    if (phase.value === 'NIGHT_WITCH' && seatId === selfSeatId.value) return;
    selectedSeatId.value = seatId;
    notice.value = '';
  }

  function nextPhase() {
    const order: GamePhase[] = ['NIGHT_GUARD', 'NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH', 'DAY_ANNOUNCEMENT', 'SPEECH', 'VOTE', 'RESULT'];
    const index = order.indexOf(phase.value);
    if (index >= 0 && index < order.length - 1) setPhase(order[index + 1]);
  }

  function confirmAction() {
    if (!selectedSeatId.value) { notice.value = '请先选择一个目标。'; return; }
    if (phase.value === 'NIGHT_GUARD') { guardTarget.value = selectedSeatId.value; notice.value = `已守护 ${selectedSeatId.value}`; }
    else if (phase.value === 'NIGHT_WOLF') { wolfTarget.value = selectedSeatId.value; notice.value = `刀口已锁定 ${selectedSeatId.value}`; }
    else if (phase.value === 'NIGHT_WITCH') { witchPoisonTarget.value = selectedSeatId.value; notice.value = `毒药目标 ${selectedSeatId.value}`; }
    else if (phase.value === 'NIGHT_SEER') {
      const seat = MOCK_SEATS.find(item => item.id === selectedSeatId.value);
      if (seat) {
        seerChecks.value = [{ targetSeatId: seat.id, result: seat.camp === 'wolf' ? 'wolf' : 'good', night: day.value }, ...seerChecks.value.filter(item => item.targetSeatId !== seat.id)];
        notice.value = `${seat.id} 的查验结果已记录。`;
      }
      return;
    } else if (phase.value === 'VOTE') {
      submittedVoteSeatId.value = selectedSeatId.value;
      notice.value = `你已投给 ${selectedSeatId.value}，等待公布票型。`;
      return;
    }
    nextPhase();
  }

  function submitSpeech(text: string) {
    if (!text.trim()) { notice.value = '发言不能为空。'; return; }
    submittedSpeech.value = text.trim();
    speech.value = text.trim();
    currentSpeakerId.value = null;
    setPhase('VOTE');
  }

  function reset() {
    phase.value = 'SPEECH'; day.value = 2; selfSeatId.value = 'P7'; currentSpeakerId.value = MOCK_STORY.currentSpeakerId;
    selectedSeatId.value = null; submittedVoteSeatId.value = null; submittedSpeech.value = '';
    speech.value = MOCK_STORY.speech; guardTarget.value = MOCK_STORY.guardTarget; wolfTarget.value = MOCK_STORY.wolfTarget;
    witchPoisonTarget.value = MOCK_STORY.witchPoisonTarget; winner.value = null; notice.value = '';
    seerChecks.value = [
      { targetSeatId: 'P6', result: 'wolf', night: 2 },
      { targetSeatId: 'P1', result: 'good', night: 1 },
    ];
  }

  return {
    roomId, phase, day, selfSeatId, currentSpeakerId, selectedSeatId, submittedVoteSeatId,
    submittedSpeech, speech, guardLastTarget, guardTarget, wolfTarget, witchPoisonTarget,
    seerChecks, voteTally, winner, demoMode, notice,
    night, aliveSeats, selfSeat, selfRole, selfMeta, selfAlive, wolfTeammates, currentSpeaker, isMyAction,
    phaseTitle, phaseRailActive, publicSeats, revealedSeats, aliveCount, totalVotes, leader,
    voteSubmitted, isFinal,
    setPhase, applyScene, setViewpoint, selectSeat, nextPhase, confirmAction, submitSpeech, reset,
  };
});
