import assert from 'node:assert/strict';
import { hunterRoom } from '../../../tests/fixtures/hunter.mjs';
import { announceDay, checkWinner, expireHunterResponse, hunterShot, skipHunterResponse, skipLastWords, submitSpeech, submitVote } from '../src/engine.mjs';
import { publicState } from '../src/model.mjs';
import { tickRoom } from '../../../apps/scheduler/src/local.mjs';

function unchanged(room, action) { const before = structuredClone(room); assert.throws(action); assert.deepEqual(room, before); }
for (const cause of ['night', 'vote', 'poison']) {
  const room = hunterRoom(cause), response = room.hunterResponse, windowId = response.windowId;
  assert.equal(room.phase, 'HUNTER_RESPONSE');
  assert.equal(room.events.filter(e => e.type === 'game.hunter_response_opened').length, 1);
  assert.equal(publicState(room).version, room.version);
  assert.equal(publicState(room).hunterResponse, null);
  unchanged(room, () => hunterShot(room, 'P1', 'P2', 'bad', windowId));
  unchanged(room, () => hunterShot(room, 'P7', 'P7', 'bad', windowId));
  unchanged(room, () => hunterShot(room, 'P7', 'P2', 'bad'));
  unchanged(room, () => hunterShot(room, 'P7', 'P2', 'bad', 'old-window'));
  unchanged(room, () => hunterShot(room, 'P7', 'P2', '', windowId));
  unchanged(room, () => hunterShot(room, 'P7', 'P2', 'bad', windowId, Date.parse(room.hunterResponse.expiresAt)));
  unchanged(room, () => skipHunterResponse(room, 'P7', 'bad', windowId, Date.parse(room.hunterResponse.expiresAt)));
  unchanged(room, () => submitVote(room, 'P1', 'P2', 'bad'));
  unchanged(room, () => submitSpeech(room, 'P1', 'late', 'bad'));
  unchanged(room, () => announceDay(room));
  const waiting = structuredClone(room); tickRoom(room); assert.deepEqual(room, waiting);
  hunterShot(room, 'P7', 'P2', 'shot', windowId);
  assert.equal(room.seats[1].alive, false);
  assert.equal(response.status, 'completed');
  assert.equal(room.phase, 'LAST_WORDS');
  assert.equal(room.round, 0);
  unchanged(room, () => hunterShot(room, 'P7', 'P3', 'shot', windowId));
  unchanged(room, () => skipHunterResponse(room, 'P7', 'late', windowId));
  assert.equal(room.events.filter(e => e.type === 'game.hunter_response_closed').length, 1);
}
for (const cause of ['night', 'vote']) {
  const room = hunterRoom(cause), response = room.hunterResponse;
  unchanged(room, () => skipHunterResponse(room, 'P1', 'skip', response.windowId));
  skipHunterResponse(room, 'P7', 'skip', response.windowId);
  assert.equal(response.status, 'skipped'); assert.equal(room.seats[6].skills.hunterShotAvailable, false);
  assert.equal(room.phase, 'LAST_WORDS');
  const timeout = hunterRoom(cause), timeoutResponse = timeout.hunterResponse, before = structuredClone(timeout);
  assert.equal(expireHunterResponse(timeout, Date.parse(timeout.hunterResponse.expiresAt) - 1), false);
  assert.deepEqual(timeout, before);
  assert.equal(expireHunterResponse(timeout, Date.parse(timeout.hunterResponse.expiresAt)), true);
  assert.equal(timeoutResponse.status, 'expired');
  assert.equal(expireHunterResponse(timeout, Infinity), false);
}
// A winning shot must resolve before parity is adjudicated.
const win = hunterRoom();
win.seats.forEach(s => { s.alive = ['P1','P2'].includes(s.seatId); });
assert.equal(checkWinner(win), null);
hunterShot(win, 'P7', 'P2', 'winning-shot', win.hunterResponse.windowId);
skipLastWords(win, 'P7', 'winning-last-words', win.lastWords.windowId);
checkWinner(win);
assert.equal(win.phase, 'GAME_OVER');
assert.equal(win.events.at(-1).data.winner, 'good');
unchanged(win, () => hunterShot(win, 'P7', 'P1', 'late', win.hunterResponse.windowId));
const loss = hunterRoom(); loss.seats.forEach(s => { s.alive = ['P1','P2'].includes(s.seatId); });
skipHunterResponse(loss, 'P7', 'skip', loss.hunterResponse.windowId);
skipLastWords(loss, 'P7', 'loss-last-words', loss.lastWords.windowId);
checkWinner(loss);
assert.equal(loss.events.at(-1).data.winner, 'werewolf');
console.log('Hunter windows: night/vote/poison, atomic rejection, deadline, skip, timeout, continuation and victory passed');
