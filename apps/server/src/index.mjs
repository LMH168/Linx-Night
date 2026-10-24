import { createApiServer } from './api.mjs';
const { server, port } = createApiServer();
server.listen(port, '0.0.0.0', () => console.log(`linx-night server listening on ${port}`));
