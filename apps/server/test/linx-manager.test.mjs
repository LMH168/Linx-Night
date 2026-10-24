import assert from 'node:assert/strict';
import { createLinxControllerManager } from '../src/linx-manager.mjs';
import { createRoom, addPlayer, fillAiSeats, beginControllerPreparation } from '../../../packages/domain/src/model.mjs';
const room = createRoom({ roomId: 'manager-config', hostPlayerId: 'human' }); addPlayer(room, { playerId: 'human', displayName: '观察员' }); fillAiSeats(room); beginControllerPreparation(room);
const manager = createLinxControllerManager({ env: {}, fetchImpl: async () => { throw new Error('should not call network'); } });
await assert.rejects(() => manager.prepare(room), error => error.code === 'LINX_CONFIG_MISSING'); console.log('real Linx manager rejects missing production configuration');
