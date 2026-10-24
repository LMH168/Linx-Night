import { randomUUID } from 'node:crypto';
import { CONTROLLER_STATES, controllerFor, updateController } from '../../../packages/domain/src/model.mjs';

/**
 * Owns one Linx connection per AI seat. Network and binding functions are
 * injected so the room lifecycle is testable without a real platform account.
 */
export class LinxSessionAdapter {
  constructor({ clientFactory, connectionFor, bind, release, now = () => new Date().toISOString(), onChange = () => {} } = {}) {
    if (typeof clientFactory !== 'function' || typeof connectionFor !== 'function' || typeof bind !== 'function' || typeof release !== 'function') throw new Error('Linx session adapter dependencies are required');
    this.clientFactory = clientFactory; this.connectionFor = connectionFor; this.bind = bind; this.release = release; this.now = now; this.onChange = onChange; this.clients = new Map(); this.profiles = new Map();
  }
  refreshRoomPhase(room) {
    const statuses = (room.controllers ?? []).map(controller => controller.status);
    room.controllerPhase = statuses.some(status => status === CONTROLLER_STATES.FAILED) ? 'failed' : statuses.length && statuses.every(status => status === CONTROLLER_STATES.READY) ? 'ready' : statuses.some(status => status === CONTROLLER_STATES.BINDING) ? 'binding' : 'connecting';
    return room.controllerPhase;
  }
  async connect(room, seatId) {
    const controller = controllerFor(room, seatId); if (!controller) throw new Error('controller seat is not reserved');
    if (![CONTROLLER_STATES.PENDING, CONTROLLER_STATES.FAILED, CONTROLLER_STATES.RECONNECTING].includes(controller.status)) throw new Error('controller is already active');
    const config = await this.connectionFor(controller);
    if (!config.profileName || this.profiles.has(config.profileName)) throw new Error('Linx profile is already in use');
    const client = this.clientFactory(config.identity);
    const runId = randomUUID(); this.clients.set(seatId, { client, runId, epoch: controller.controllerEpoch });
    this.profiles.set(config.profileName, seatId);
    updateController(room, seatId, { status: CONTROLLER_STATES.CONNECTING, profileName: config.profileName, agentId: config.agentId, runId, errorCode: null, lastSeenAt: this.now() }); this.refreshRoomPhase(room); this.onChange(room, seatId);
    try {
      await client.connect(config.connection);
      const sessionId = client.sessionId; if (!sessionId) throw new Error('Linx session did not return a session id');
      updateController(room, seatId, { status: CONTROLLER_STATES.CONNECTED, deviceId: config.identity.deviceId, sessionId, lastSeenAt: this.now() }); this.refreshRoomPhase(room); this.onChange(room, seatId);
      updateController(room, seatId, { status: CONTROLLER_STATES.BINDING }); this.refreshRoomPhase(room); this.onChange(room, seatId);
      await this.bind({ roomId: room.roomId, gameId: room.gameId, seatId, controllerEpoch: controller.controllerEpoch, agentId: config.agentId, deviceId: config.identity.deviceId, sessionId, runId });
      updateController(room, seatId, { status: CONTROLLER_STATES.READY, boundAt: this.now(), lastSeenAt: this.now() }); this.refreshRoomPhase(room); this.onChange(room, seatId); return controllerFor(room, seatId);
    } catch (error) {
      client.close?.(); this.clients.delete(seatId); this.profiles.delete(config.profileName); updateController(room, seatId, { status: CONTROLLER_STATES.FAILED, errorCode: error.code || error.message || 'CONNECT_FAILED', lastSeenAt: this.now() }); this.refreshRoomPhase(room); this.onChange(room, seatId); throw error;
    }
  }
  async reconnect(room, seatId) {
    const current = controllerFor(room, seatId); if (!current) throw new Error('controller seat is not reserved');
    await this.releaseSeat(room, seatId, { keepReservation: true });
    room.controllerEpoch += 1; updateController(room, seatId, { gameId: room.gameId, controllerEpoch: room.controllerEpoch, status: CONTROLLER_STATES.RECONNECTING, retryCount: current.retryCount + 1, sessionId: null, runId: null, boundAt: null });
    return this.connect(room, seatId);
  }
  async releaseSeat(room, seatId, { keepReservation = false } = {}) {
    const entry = this.clients.get(seatId); if (entry) { entry.client.close?.(); this.clients.delete(seatId); for (const [profile, owner] of this.profiles) if (owner === seatId) this.profiles.delete(profile); }
    const controller = controllerFor(room, seatId); if (!controller) return;
    if (controller.sessionId) await this.release({ roomId: room.roomId, gameId: room.gameId, seatId, controllerEpoch: controller.controllerEpoch, agentId: controller.agentId, deviceId: controller.deviceId, sessionId: controller.sessionId, runId: controller.runId });
    updateController(room, seatId, { status: keepReservation ? CONTROLLER_STATES.RECONNECTING : CONTROLLER_STATES.RELEASED, sessionId: null, runId: null, lastSeenAt: this.now() }); this.refreshRoomPhase(room); this.onChange(room, seatId);
  }
  async releaseAll(room) { await Promise.all((room.controllers ?? []).map(controller => this.releaseSeat(room, controller.seatId))); room.controllerPhase = 'released'; }
}
