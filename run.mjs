import {HostPlayback} from './apps/server/src/host-playback.mjs';
import { createVoiceService, createRealtimeVoiceService } from './apps/linx/src/voice.mjs';
import { LinxTurnRuntime } from './apps/scheduler/src/linx-runtime.mjs';
import { rooms, publishNewEvents, roomChanges } from './apps/server/src/api.mjs';
import { tickRoom } from './apps/scheduler/src/local.mjs';
import { createApiServer } from './apps/server/src/api.mjs';
import { createLinxControllerManager } from './apps/server/src/linx-manager.mjs';
import { createMcpServer } from './apps/mcp/src/server.mjs';
import './apps/client/server.mjs';
const manager = createLinxControllerManager({onChange:room=>publishNewEvents(room)});
const servers = [];
const runtime = new LinxTurnRuntime({manager,publish:publishNewEvents});
const hostPlayback=new HostPlayback({manager,publish:room=>{ room.version++; runtime.wake(room); }});
roomChanges.on('changed', room => {hostPlayback.sync(room);runtime.wake(room);});
const appHost = process.env.APP_HOST || '127.0.0.1';
for (const [factory, options] of [[createApiServer, { sessions: manager, hostPlayback, voice: createVoiceService(), realtimeVoice: createRealtimeVoiceService() }], [createMcpServer, {}]]) {
  const {server, port} = factory(options); servers.push(server);
  server.listen(port, appHost, () => console.log(`Listening on ${appHost}:${port}`));
}

const gameTimer = setInterval(() => { for (const room of rooms.values()) {try { hostPlayback.tick(room); hostPlayback.sync(room); tickRoom(room, () => false); publishNewEvents(room); runtime.tick(room).catch(() => console.error('Linx lifecycle failed')); } catch (error) {console.error('Game tick:', error.message);} } }, 2000);

async function shutdown() {
  clearInterval(gameTimer);
  for (const room of rooms.values()) {room.invalidated = true;hostPlayback.cancel(room);}
  await Promise.allSettled([...rooms.values()].map(room => manager.release(room)));
  for (const server of servers) { server.closeAllConnections(); server.close(); }
  process.exit(0);
}
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
