import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApiServer, rooms, roomCodes } from '../src/api.mjs';
import { createRoom, addPlayer } from '../../../packages/domain/src/model.mjs';

const room = createRoom({ hostPlayerId: 'human' });
addPlayer(room, { playerId: 'human', displayName: '真人' });
room.gameId = 'realtime-game'; room.phase = 'SPEECH'; room.currentSeatId = 'P1'; room.hostPlaybackEnabled = true;
rooms.set(room.roomId, room); roomCodes.set(room.roomCode, room.roomId);
let onMessage;
const realtimeVoice = async hooks => {
  onMessage = hooks.onMessage;
  return { send: async frame => { if (frame.length === 640) queueMicrotask(() => onMessage({ type: 'stt', text: '实时发言' })); }, stop: async () => {}, close() {} };
};
const { server } = createApiServer({ realtimeVoice });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
try {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/rooms/${room.roomId}/voice/realtime?player_id=human`);
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'start' })); ws.send(Buffer.alloc(640));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(messages.some(message => message.type === 'ready'));
  assert.ok(messages.some(message => message.type === 'error' && /录音/.test(message.message)) === false);
  assert.equal(room.speeches[0]?.text, '实时发言');
  ws.send(JSON.stringify({ type: 'stop' })); ws.close();
} finally { rooms.delete(room.roomId); roomCodes.delete(room.roomCode); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
console.log('Realtime human voice bridge accepts PCM, transcribes and submits one public speech');
