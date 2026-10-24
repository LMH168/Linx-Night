import { rooms, publishNewEvents } from './apps/server/src/api.mjs';
import { tickRoom } from './apps/scheduler/src/local.mjs';
import { createApiServer } from './apps/server/src/api.mjs';
import { createMcpServer } from './apps/mcp/src/server.mjs';
import './apps/client/server.mjs';
for (const factory of [createApiServer, createMcpServer]) {
  const {server, port} = factory();
  server.listen(port, '127.0.0.1', () => console.log(`Listening on ${port}`));
}

setInterval(() => { for (const room of rooms.values()) {try { tickRoom(room); publishNewEvents(room); } catch (error) {console.error('Game tick:', error.message);} } }, 2000);
