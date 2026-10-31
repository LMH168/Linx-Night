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

  eventsUrl(roomId: string, afterVersion: number): string {
    return `${this.baseUrl}/api/rooms/${encodeURIComponent(roomId)}/events?after=${encodeURIComponent(afterVersion)}`;
  }
}
