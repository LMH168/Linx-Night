import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const legacyRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
// Vue is the production entry after Issue #124. Set CLIENT_UI=legacy only for rollback.
const useVue = process.env.CLIENT_UI !== 'legacy';
const staticRoot = useVue ? resolve(process.env.CLIENT_DIST || join(legacyRoot, '../client-vue/dist')) : legacyRoot;
const port = Number(process.env.CLIENT_PORT || 5010);
const clientBuild = process.env.LINX_BUILD_ID || 'unknown';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = normalize(join(staticRoot, requested));
  if (file !== staticRoot && !file.startsWith(`${staticRoot}${process.platform === 'win32' ? '\\' : '/'}`)) { res.writeHead(403, { 'X-Linx-Client-Build': clientBuild }); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'X-Linx-Client-Build': clientBuild }); res.end(body); }
  catch { res.writeHead(404, { 'X-Linx-Client-Build': clientBuild }); res.end('Not Found'); }
}).listen(port, process.env.CLIENT_HOST || '0.0.0.0', () => console.log(`linx-night client listening on ${port} (${useVue ? 'vue' : 'legacy'})`));
