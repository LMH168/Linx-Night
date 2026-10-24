import assert from 'node:assert/strict';
import { EventHub, TimeoutScheduler } from '../src/realtime.mjs';

const hub = new EventHub(); const received = []; const stop = hub.subscribe('room_1', event => received.push(event)); hub.publish('room_1', { eventId: 'evt_1', version: 1, type: 'game.phase_changed' }); hub.publish('room_2', { eventId: 'evt_2', version: 1 }); assert.equal(received.length, 1); stop(); hub.publish('room_1', { eventId: 'evt_3', version: 2 }); assert.equal(received.length, 1);
const scheduler = new TimeoutScheduler(); let completed = false; await new Promise((resolve, reject) => { scheduler.once('completed', () => { completed = true; resolve(); }); scheduler.once('failed', reject); scheduler.schedule({ key: 'job_1', delayMs: 10, task: () => {} }); }); assert.equal(completed, true); scheduler.cancelAll(); console.log('realtime tests passed');
