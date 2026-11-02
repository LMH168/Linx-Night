import assert from 'node:assert/strict';
import { createRoom, addPlayer, fillAiSeats } from '../../../packages/domain/src/model.mjs';
import { submitSpeech } from '../../../packages/domain/src/engine.mjs';

const room = createRoom({ hostPlayerId: 'host' });
addPlayer(room, { playerId: 'host', displayName: 'host' });
fillAiSeats(room);
room.phase = 'SPEECH';
room.currentSeatId = 'P2';
room.gameId = 'game';
room.hostPlaybackEnabled = true;
room.seats[1].controlSource = 'linx';
submitSpeech(room, 'P2', '公开文字发言。', 'speech_1');
assert.equal(room.speeches[0].text, '公开文字发言。');
assert.equal(room.speechAudioRelay, undefined);
assert.equal(room.speechInputRelay, undefined);
assert.equal(room.speechPlayback.speechId, 'speech_1');
console.log('AI speech uses server text and host playback; no player audio relay is created');
