import assert from 'node:assert/strict';
import { createRoom, addPlayer, fillAiSeats, beginControllerPreparation, updateController, CONTROLLER_STATES } from '../../../packages/domain/src/model.mjs';
import { bindController, controllerBindings, createMcpServer, releaseController, sessions, devices } from '../src/server.mjs';
import { rooms } from '../../server/src/api.mjs';

const room = createRoom({ roomId: 'controller-room', hostPlayerId: 'human' }); addPlayer(room, { playerId: 'human', displayName: '观察员' }); fillAiSeats(room); beginControllerPreparation(room); rooms.set(room.roomId, room);
const first = room.controllers[0]; const binding = { roomId: room.roomId, gameId: room.gameId, seatId: first.seatId, controllerEpoch: first.controllerEpoch, agentId: 'agent', deviceId: 'device-a', sessionId: 'session-a', runId: 'run-a' };
try {
  const context = bindController(binding); assert.equal(context.seatId, first.seatId); assert.equal(room.seats[1].linxControlled, true); assert.equal(room.seats[1].controlSource, 'linx');
  assert.equal(context.sessionId, binding.sessionId);
  assert.throws(() => bindController({ ...binding, sessionId: 'session-b', seatId: room.controllers[1].seatId }), /device is already bound/);
  assert.throws(() => bindController({ ...binding, controllerEpoch: first.controllerEpoch + 1 }), /reservation does not match/);
  updateController(room, first.seatId, { status: CONTROLLER_STATES.READY, deviceId: binding.deviceId, agentId: binding.agentId, sessionId: binding.sessionId });
  assert.equal(releaseController({ sessionId: binding.sessionId }), true); assert.equal(sessions.has(binding.sessionId), false); assert.equal(devices.has(`${binding.agentId}:${binding.deviceId}`), false); assert.equal(room.seats[1].linxControlled, true); assert.equal(room.seats[1].controlSource, 'linx');
  assert.equal(releaseController({ sessionId: binding.sessionId }), false);
  console.log('controller binding isolation and release passed');
} finally { controllerBindings.clear(); sessions.clear(); devices.clear(); rooms.delete(room.roomId); }
