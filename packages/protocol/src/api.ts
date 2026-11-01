import type { HostTask, PrivateState, RoomPublicState, SettlementState } from './types';

/** Wire contract shared by the browser client and Node API. Field names follow the live REST API. */
export type StateResponse = { state: RoomPublicState };
export type PrivateStateResponse = { private_state: PrivateState };
export type CreateRoomRequest = { display_name: string };
export type CreateRoomResponse = { room_id: string; room_code: string; player_id: string; state: RoomPublicState };
export type JoinRoomRequest = { display_name: string; player_id?: string };
export type JoinRoomResponse = { player: { playerId: string; seatId: string; displayName?: string; playerType?: string }; state: RoomPublicState };
export type AddPlayerRequest = { player_type: 'ai' | 'human'; display_name?: string; player_id?: string };
export type RenamePlayerRequest = { display_name: string };
export type MutationResponse = StateResponse & Record<string, unknown>;
export type StartGameResponse = StateResponse & { preparation?: boolean; game_id?: string; controller_epoch?: number };

export type ActionRequest =
  | { type: 'wolf_target'; target_seat_id: string; action_id?: string }
  | { type: 'seer_check'; target_seat_id: string; action_id?: string }
  | { type: 'witch_action'; action: 'skip' | 'save' | 'poison'; target_seat_id?: string; action_id?: string }
  | { type: 'hunter_shot'; target_seat_id: string; window_id: string; action_id?: string }
  | { type: 'announce_day'; action_id?: string };
export type VoteRequest = { target_seat_id: string; action_id?: string };
export type SpeechRequest = { text: string; action_id?: string };
export type PresenceResponse = { ok: boolean };
export type ControlRequest = { mode: 'human' };
export type HunterResponseRequest =
  | { action: 'skip'; window_id: string; action_id?: string }
  | { action: 'shoot'; target_seat_id: string; window_id: string; action_id?: string };
export type LastWordsRequest =
  | { action: 'skip'; window_id: string; action_id?: string }
  | { action: 'submit'; text: string; window_id: string; action_id?: string };

export type RecordingStartResponse = { recordingId: string; deadline: number };
export type HostStateResponse = {
  task: (HostTask & { gameId?: string; eventId?: string; seatId?: string | null; kind?: string; errorCode?: string | null }) | null;
  enabled?: boolean; blocked?: boolean; errorCode?: string | null;
  watchdogDeadlineAt?: string | null; recoveryRequired?: boolean;
};
export type Settlement = SettlementState;
export type EndRoomResponse = { ended?: boolean; idempotent?: boolean; settlement_id?: string; settlement?: SettlementState; state?: RoomPublicState };
export type SettlementResponse = { settlement: SettlementState };
export type ControllersResponse = { game_id: string | null; controller_epoch: number; phase: string; controllers: RoomPublicState['controllers']; host?: RoomPublicState['hostController'] };
