import { describe, expect, it } from 'vitest';
import { BOARD, ROLES } from './roles';
import { SEATS, SEAT_RING } from './seats';

describe('暮林夜宴 · 席位与角色数据', () => {
  it('九席编号唯一且与座位环参数成对', () => {
    expect(SEATS).toHaveLength(9);
    expect(new Set(SEATS.map((s) => s.id)).size).toBe(9);
    expect(SEATS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(SEAT_RING.x).toBeGreaterThan(SEAT_RING.z);
  });

  it('结算盘面是 3 狼 6 好人，且只用已定义角色', () => {
    expect(BOARD).toHaveLength(9);
    const wolves = BOARD.filter((p) => ROLES[p.role].camp === 'wolf');
    expect(wolves).toHaveLength(3);
    for (const tile of BOARD) {
      expect(ROLES[tile.role]).toBeDefined();
      expect(tile.alive).toBeTypeOf('boolean');
    }
    expect(new Set(BOARD.map((p) => p.seat)).size).toBe(9);
  });

  it('每种角色都有中文名与英文名', () => {
    for (const role of Object.values(ROLES)) {
      expect(role.cn.length).toBeGreaterThan(0);
      expect(role.en).toMatch(/^THE /);
      expect(role.poem.length).toBeGreaterThan(0);
    }
  });
});
