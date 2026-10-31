import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['index.html', 'app.js', 'style.css', 'server.mjs']) { const text = await readFile(`${root}${file}`, 'utf8'); assert.ok(text.length > 0, `${file} is empty`); }
const html = await readFile(`${root}index.html`, 'utf8'); assert.match(html, /id="create"/); assert.match(html, /id="seats"/); console.log('client static tests passed');
const app = await readFile(`${root}app.js`, 'utf8'); assert.match(app, /after=\$\{state\.lastVersion\}/); assert.match(app, /scheduleReconnect/); assert.match(app, /beforeunload/); console.log('client reconnect checks passed');
const server = await readFile(`${root}server.mjs`, 'utf8'); assert.match(server, /LINX_BUILD_ID/); assert.match(server, /X-Linx-Client-Build/); console.log('client build marker checks passed');
