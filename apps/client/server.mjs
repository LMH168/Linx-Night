import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url)); const port = Number(process.env.CLIENT_PORT || 5010); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
createServer(async (req, res) => { const requested = req.url === '/' ? 'index.html' : req.url.slice(1); const file = normalize(join(root, requested)); if (!file.startsWith(root)) { res.writeHead(403); return res.end(); } try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end('Not Found'); } }).listen(port, '0.0.0.0', () => console.log(`linx-night client listening on ${port}`));
