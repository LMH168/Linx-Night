import type { ApiEnvelope, PrivateState, RoomPublicState } from '../../../../packages/protocol/src/types';

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

  eventsUrl(roomId: string, afterVersion: number): string {
    return `${this.baseUrl}/api/rooms/${encodeURIComponent(roomId)}/events?after=${encodeURIComponent(afterVersion)}`;
  }
}
