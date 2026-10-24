import { createMcpServer } from './server.mjs';
const { server, port } = createMcpServer(); server.listen(port, '0.0.0.0', () => console.log(`linx-night mcp listening on ${port}`));
