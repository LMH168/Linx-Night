import type { ApiEnvelope, ApiError, HostTask, PrivateState, RoomPublicState } from '../../../../packages/protocol/src/types';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  playerId?: string;
  fetchImpl?: typeof fetch;
}

export interface CreateRoomResponse { room_id: string; player_id: string; state: RoomPublicState; }
export interface JoinRoomResponse { player: { playerId: string; seatId: string }; state: RoomPublicState; }
export interface StateResponse { state: RoomPublicState; }
export interface PrivateStateResponse { private_state: PrivateState; }
export interface MutationResponse { state: RoomPublicState; [key: string]: unknown; }
export interface RecordingStartResponse { recordingId: string; deadline: number; }
export interface HostStateResponse { task: (HostTask & { gameId?: string; eventId?: string; attemptId?: string }) | null; enabled?: boolean; blocked?: boolean; }

export class GameApiClient {
  readonly baseUrl: string;
  readonly playerId: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, playerId = '', fetchImpl = globalThis.fetch.bind(globalThis) }: ApiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.playerId = playerId;
    this.fetchImpl = fetchImpl;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (this.playerId) headers.set('x-player-id', this.playerId);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    let body: ApiEnvelope<T> | undefined;
    try { body = text ? JSON.parse(text) as ApiEnvelope<T> : undefined; } catch { body = undefined; }
    if (!response.ok) {
      const error = body?.error;
      throw new ApiRequestError(error?.message || `请求失败（${response.status}）`, response.status, error?.code, error?.details);
    }
    return (body ?? {}) as T;
  }

  /** Request a streaming response without trying to parse its body as JSON. */
  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.playerId) headers.set('x-player-id', this.playerId);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const text = await response.text();
      let error: ApiError | undefined;
      try { error = (JSON.parse(text) as ApiEnvelope<unknown>).error; } catch { /* non-json response */ }
      throw new ApiRequestError(error?.message || `请求失败（${response.status}）`, response.status, error?.code, error?.details);
    }
    return response;
  }

  async roomState(roomId: string): Promise<RoomPublicState> {
    const result = await this.request<{ state: RoomPublicState }>(`/api/rooms/${encodeURIComponent(roomId)}/state`);
    return result.state;
  }

  async privateState(roomId: string): Promise<PrivateState> {
    const result = await this.request<{ private_state: PrivateState }>(`/api/rooms/${encodeURIComponent(roomId)}/private-state`);
    return result.private_state;
  }

  createRoom(displayName: string): Promise<CreateRoomResponse> {
    return this.request('/api/rooms', { method: 'POST', body: JSON.stringify({ display_name: displayName }) });
  }

  joinRoom(roomId: string, displayName: string): Promise<JoinRoomResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/players`, { method: 'POST', body: JSON.stringify({ display_name: displayName }) });
  }

  addAi(roomId: string, displayName?: string): Promise<MutationResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/players`, { method: 'POST', body: JSON.stringify({ player_type: 'ai', ...(displayName ? { display_name: displayName } : {}) }) });
  }

  renameAi(roomId: string, seatId: string, displayName: string): Promise<MutationResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/players/${encodeURIComponent(seatId)}`, { method: 'PATCH', body: JSON.stringify({ display_name: displayName }) });
  }

  mutate(roomId: string, path: string, body: Record<string, unknown> = {}, method = 'POST'): Promise<MutationResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}${path}`, { method, body: JSON.stringify(body) });
  }

  endRoom(roomId: string): Promise<{ settlement_id?: string; settlement?: unknown; state?: RoomPublicState }> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/end`, { method: 'POST' });
  }

  recordingStart(roomId: string): Promise<RecordingStartResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/voice/recording-start`, { method: 'POST', body: '{}' });
  }

  recordingCancel(roomId: string, recordingId: string): Promise<{ cancelled: boolean }> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/voice/recording-cancel`, { method: 'POST', body: JSON.stringify({ recording_id: recordingId }) });
  }

  transcribe(roomId: string, wav: string, recordingId?: string): Promise<{ text: string }> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/voice/transcribe`, { method: 'POST', body: JSON.stringify({ wav, ...(recordingId ? { recording_id: recordingId } : {}) }) });
  }

  hostState(roomId: string): Promise<HostStateResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/host/state`);
  }

  hostStream(roomId: string, taskId: string, signal?: AbortSignal): Promise<Response> {
    return this.raw(`/api/rooms/${encodeURIComponent(roomId)}/host/stream?task_id=${encodeURIComponent(taskId)}`, { signal });
  }

  hostStarted(roomId: string, taskId: string, attemptId: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/host/started`, { method: 'POST', signal, body: JSON.stringify({ task_id: taskId, attempt_id: attemptId }) });
  }

  hostInterrupted(roomId: string, taskId: string, attemptId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/host/interrupted`, { method: 'POST', body: JSON.stringify({ task_id: taskId, attempt_id: attemptId }) });
  }

  hostPlayed(roomId: string, taskId: string, attemptId: string, metrics: { firstPlayMs?: number; playbackMs?: number } = {}): Promise<HostStateResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/host/played`, { method: 'POST', body: JSON.stringify({ task_id: taskId, attempt_id: attemptId, ...metrics }) });
  }

  hostRetry(roomId: string): Promise<HostStateResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/host/retry`, { method: 'POST', body: '{}' });
  }

  hostSkip(roomId: string, taskId: string): Promise<HostStateResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/host/skip`, { method: 'POST', body: JSON.stringify({ task_id: taskId }) });
  }

  eventsUrl(roomId: string, afterVersion: number): string {
    return `${this.baseUrl}/api/rooms/${encodeURIComponent(roomId)}/events?after=${encodeURIComponent(afterVersion)}`;
  }
}
