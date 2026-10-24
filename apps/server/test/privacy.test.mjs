import assert from 'node:assert/strict';
import { createRoom, addPlayer, appendEvent, publicEventData, publicState } from '../../../packages/domain/src/model.mjs';
import { EventHub, eventStream } from '../src/realtime.mjs';
import { Writable } from 'node:stream';

const room = createRoom({ roomId: 'privacy-room', hostPlayerId: 'p1' });
addPlayer(room, { playerId: 'p1', displayName: '观察员' });
appendEvent(room, { type: 'game.speech_submitted', data: { speechId: 's1', seatId: 'P1', text: '公开发言', role: 'werewolf', token: 'secret', audio: 'raw-audio', modelReply: 'private-model' } });
room.speeches.push({ speechId: 's1', round: 0, seatId: 'P1', text: '公开发言' });
const state = publicState(room);
assert.match(JSON.stringify(state), /公开发言/);
assert.doesNotMatch(JSON.stringify(state), /werewolf|secret|raw-audio|private-model/);
assert.deepEqual(publicEventData('unknown.internal', { token: 'secret', role: 'werewolf' }), {});

const chunks = [];
const response = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk.toString()); callback(); } });
response.writeHead = () => {};
response.on = (event, listener) => { if (event === 'close') response.closeListener = listener; return response; };
const hub = new EventHub();
eventStream(response, hub, room.roomId, { history: room.events });
assert.doesNotMatch(chunks.join(''), /werewolf|secret|raw-audio|private-model/);
console.log('Public API and SSE privacy projection passed');
