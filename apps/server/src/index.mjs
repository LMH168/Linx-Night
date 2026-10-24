import { createApiServer } from './api.mjs';
import { createLinxControllerManager } from './linx-manager.mjs';
const { server, port } = createApiServer({ sessions: createLinxControllerManager() });
server.listen(port, '0.0.0.0', () => console.log(`linx-night server listening on ${port}`));
