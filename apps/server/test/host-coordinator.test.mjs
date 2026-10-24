import assert from 'node:assert/strict';
import { createRoom, appendEvent, PHASES } from '../../../packages/domain/src/model.mjs';
import { createHostCoordinator } from '../src/host-coordinator.mjs';
const room = createRoom({ roomId: 'host-coordinator', hostPlayerId: 'p1' }); const output = []; const coordinator = createHostCoordinator({ publish: (_, event) => output.push(event) });
appendEvent(room, { type: 'game.phase_changed', data: { phase: PHASES.SPEECH, seatId: 'P1' } }); coordinator.announce(room); assert.equal(output[0].type, 'host.speech_opened'); assert.equal(output[0].data.seatId, 'P1'); assert.equal(JSON.stringify(output), JSON.stringify(output).replace(/token|role|audio/gi, '')); console.log('host coordinator public events passed');
