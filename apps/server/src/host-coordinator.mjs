import { appendEvent, CAMPS, PHASES, publicEvent as projectEvent } from '../../../packages/domain/src/model.mjs';

const publicEvent = (room, type, data = {}) => { const event = appendEvent(room, { type, data }); event.publicOnly = true; return event; };
export class HostCoordinator {
  constructor({ publish = () => {} } = {}) { this.publish = publish; }
  announce(room) {
    room.hostAnnouncements ??= new Set();
    const events = [];
    for (const raw of [...room.events]) {
      const event=projectEvent(raw); if(!event)continue;
      if (room.hostAnnouncements.has(event.eventId)) continue;
      if (event.type === 'game.phase_changed') {
        const phase = event.data.phase; const type = phase === PHASES.SPEECH ? 'host.speech_opened' : phase === PHASES.VOTE ? 'host.vote_opened' : 'host.phase_announced';
        events.push(publicEvent(room, type, { phase, seatId: event.data.seatId ?? null }));
      }
      if (event.type === 'game.player_eliminated') events.push(publicEvent(room, 'host.deaths_announced', { seatId: event.data.seatId, cause: event.data.cause }));
      room.hostAnnouncements.add(event.eventId);
      if (event.type === 'game.phase_changed' && event.data.phase === PHASES.GAME_OVER) events.push(publicEvent(room, 'host.game_finished', { winner: event.data.winner }));
    }
    for (const event of events) this.publish(room.roomId, event); return events;
  }
}

export function createHostCoordinator(options) { return new HostCoordinator(options); }
