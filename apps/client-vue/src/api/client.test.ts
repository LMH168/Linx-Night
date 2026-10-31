import { describe, expect, it } from 'vitest';
import { ApiRequestError, GameApiClient } from './client';

describe('GameApiClient', () => {
  it('adds the player header and reads room state', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new GameApiClient({
      baseUrl: 'http://api.test/',
      playerId: 'player-1',
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({ state: { roomId: 'room/1', version: 3 } }), { status: 200 });
      }
    });

    const state = await client.roomState('room/1');
    expect(state.roomId).toBe('room/1');
    expect(calls[0].url).toBe('http://api.test/api/rooms/room%2F1/state');
    expect(new Headers(calls[0].init?.headers).get('x-player-id')).toBe('player-1');
  });

  it('normalizes structured API errors', async () => {
    const client = new GameApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'ROOM_NOT_FOUND', message: '房间不存在' } }), { status: 404 })
    });

    await expect(client.roomState('missing')).rejects.toMatchObject({ status: 404, code: 'ROOM_NOT_FOUND', message: '房间不存在' } satisfies Partial<ApiRequestError>);
  });
});
