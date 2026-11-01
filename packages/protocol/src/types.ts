export type Phase =
  | 'LOBBY' | 'ROLE_ASSIGNMENT' | 'NIGHT_WOLF' | 'NIGHT_SEER' | 'NIGHT_WITCH'
  | 'DAY_ANNOUNCEMENT' | 'HUNTER_RESPONSE' | 'LAST_WORDS' | 'SPEECH' | 'VOTE'
  | 'RESOLUTION' | 'GAME_OVER';

export type Role = 'werewolf' | 'seer' | 'witch' | 'hunter' | 'villager';
export type Camp = 'werewolf' | 'good';
export type PlayerType = 'human' | 'ai';
export type ControlSource = 'human' | 'linx' | 'rule_bot';
export type ControllerStatus = 'pending' | 'connecting' | 'connected' | 'binding' | 'ready' | 'failed' | 'reconnecting' | 'released';

export interface SeatState {
  seatId: string;
  displayName: string;
  playerType?: PlayerType;
  controlSource?: ControlSource;
  connectionState?: string;
  alive: boolean;
}

export interface ControllerState {
  seatId: string;
  status: ControllerStatus;
  retryCount: number;
  boundAt: string | null;
  lastSeenAt: string | null;
  errorCode: string | null;
}

export interface HostTask {
  id: string;
  attemptId?: string;
  gameId?: string;
  eventId?: string;
  seatId?: string | null;
  kind?: string;
  text: string;
  status: string;
  taskType?: string;
  sourceEventId?: string;
  errorCode?: string | null;
}

export interface HunterResponseState {
  windowId: string;
  seatId: string;
  phaseBefore?: Phase;
  cause?: string;
  status: 'open' | 'submitted' | 'skipped' | 'expired' | string;
  createdAt?: string;
  expiresAt: string;
  targetSeatId?: string | null;
}

export interface HunterActionState {
  windowId: string;
  expiresAt: string;
  canShoot?: boolean;
  canSkip?: boolean;
  targetSeatIds?: string[];
}

export interface LastWordsState {
  windowId: string;
  lastWordsId: string;
  seatId: string;
  round: number;
  cause?: string;
  status: 'open' | 'submitted' | 'skipped' | 'expired' | string;
  expiresAt: string;
  text?: string | null;
}

export interface SettlementState {
  eliminations?: Array<{ seatId: string; cause: string; eventId?: string }>;
  speeches?: SpeechRecord[];
  voteResolutions?: VoteResolution[];
  settlementId: string;
  roomId?: string;
  gameId?: string | null;
  settlementType: string;
  reason: string;
  endedAt: string;
  finalVersion: number;
  winner?: Camp | null;
  seats?: Array<Record<string, unknown>>;
  release?: Record<string, unknown>;
}

export interface SpeechRecord {
  speechId: string;
  round: number;
  seatId: string;
  text: string;
}

export interface VoteEntry {
  seatId: string;
  votes: number;
}

export interface VoteResolution {
  pk?: boolean;
  candidates?: string[];
  resolutionId: string;
  round: number;
  entries: VoteEntry[];
  totalVotes: number;
  maxVotes: number;
  leaders: string[];
  eliminatedSeatId: string | null;
}

export interface RoomPublicState {
  speechPlayback?: { speechId: string; status: string; seatId?: string } | null;
  pk?: { round: number; stage: 'speech' | 'vote'; candidates: string[] } | null;
  roomId: string;
  roomCode?: string | null;
  hostPlayerId: string;
  gameId: string | null;
  controllerEpoch: number;
  controllerPhase: string;
  preparing: boolean;
  phase: Phase;
  version: number;
  round: number;
  currentSeatId: string | null;
  submittedVoteRound: number | null;
  submittedVoteSeatIds: string[];
  speechDeadline?: string | number | null;
  seats: SeatState[];
  controllers: ControllerState[];
  hostController?: ControllerState | null;
  speeches: SpeechRecord[];
  voteResolutions: VoteResolution[];
  events: RoomEvent[];
  hostPlaybackEnabled: boolean;
  hostPlaybackBlocked: boolean;
  hostTasks?: HostTask[];
  speechPlaybackHistory?: Array<{ speechId: string; status: string }>;
  lastWords?: LastWordsState | null;
  hunterResponse?: HunterResponseState | null;
  settlement?: SettlementState | null;
}

export interface CurrentTurn {
  turnId: string;
  phase: Phase;
  seatId: string;
  expiresAt: string;
  controllerEpoch?: number | null;
}

export interface PrivateState {
  canAct?: boolean;
  werewolfTeammates?: string[];
  wolfProposal?: string | null;
  nightVictim?: string | null;
  roomId: string;
  seatId: string;
  playerId: string;
  role: Role | null;
  camp: Camp | null;
  alive: boolean;
  skills: Record<string, unknown>;
  seerResults: Array<{ seatId?: string; targetSeatId?: string; round?: number; result: Role | Camp | string }>;
  currentTurn: CurrentTurn | null;
  hunterAction: HunterActionState | null;
  speechSession?: Record<string, unknown> | null;
  lastWords?: LastWordsState | null;
  requiredAction?: unknown;
  [key: string]: unknown;
}

export interface RoomEvent {
  eventId: string;
  version: number;
  type: string;
  data: Record<string, unknown>;
  at?: string;
}

export interface ApiError {
  code?: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  state?: T;
  private_state?: T;
  error?: ApiError;
  [key: string]: unknown;
}

export interface VoiceDraft {
  recordingId: string | null;
  stage: 'idle' | 'recording' | 'transcribing' | 'confirming' | 'cancelled' | 'failed';
  text: string;
  expiresAt: string | null;
  error: string | null;
}

export interface SseCursor {
  version: number;
  eventIds: string[];
}
