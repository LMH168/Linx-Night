import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createGameRouter } from './router';

describe('game hash routes', () => {
  beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); });

  it('resolves the four approved stages by name', async () => {
    const router = createGameRouter(createMemoryHistory());
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('launch');
    await router.push('/lobby');
    expect(router.currentRoute.value.name).toBe('lobby');
    await router.push('/room/WALD-02');
    expect(router.currentRoute.value.name).toBe('table');
    expect(router.currentRoute.value.params.roomId).toBe('WALD-02');
    await router.push('/room/WALD-02/result');
    expect(router.currentRoute.value.name).toBe('result');
    expect(router.currentRoute.value.params.roomId).toBe('WALD-02');
  });

  it('redirects unknown hash paths back to the launch screen', async () => {
    const router = createGameRouter(createMemoryHistory());
    await router.push('/not-a-room');
    expect(router.currentRoute.value.name).toBe('launch');
    expect(router.currentRoute.value.path).toBe('/');
  });
});
