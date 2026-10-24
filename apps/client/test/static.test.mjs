import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['index.html', 'app.js', 'style.css', 'server.mjs']) { const text = await readFile(`${root}${file}`, 'utf8'); assert.ok(text.length > 0, `${file} is empty`); }
const html = await readFile(`${root}index.html`, 'utf8'); assert.match(html, /id="create"/); assert.match(html, /id="seats"/); console.log('client static tests passed');
