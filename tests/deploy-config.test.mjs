import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('production compose keeps Linx-Night on isolated loopback ports and mounts runtime state', async () => {
  const compose = await read('docker-compose.production.yml');
  assert.match(compose, /127\.0\.0\.1:\$\{LINX_API_HOST_PORT:-5000\}:5000/);
  assert.match(compose, /127\.0\.0\.1:\$\{LINX_CLIENT_HOST_PORT:-5010\}:5010/);
  assert.match(compose, /127\.0\.0\.1:\$\{LINX_MCP_HOST_PORT:-9091\}:9091/);
  assert.match(compose, /runtime\.env\}?:\/run\/linx-night\/runtime\.env:ro/);
  assert.match(compose, /LinxNight:\/var\/lib\/linx-night\/LinxNight/);
  assert.doesNotMatch(compose, /80:80|12500:|5432:/);
});

test('production image excludes credentials and local runtime artifacts', async () => {
  const ignore = await read('.dockerignore');
  const escape = value => value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
  for (const entry of ['.env', '.env.*', 'LinxNight', 'profiles', 'audio', 'evidence', '*.log']) assert.match(ignore, new RegExp(`^${escape(entry)}$`, 'm'));
  const dockerfile = await read('Dockerfile');
  assert.match(dockerfile, /USER linxnight/);
  assert.match(dockerfile, /scripts\/start-local\.mjs/);
  assert.match(dockerfile, /HEALTHCHECK/);
});

test('production listener configuration is opt-in while local defaults remain loopback', async () => {
  const run = await read('run.mjs');
  const start = await read('scripts/start-local.mjs');
  assert.match(run, /process\.env\.APP_HOST \|\| '127\.0\.0\.1'/);
  assert.match(start, /process\.env\.APP_HOST = process\.env\.APP_HOST \|\| '127\.0\.0\.1'/);
  assert.match(start, /process\.env\.CLIENT_HOST = process\.env\.CLIENT_HOST \|\| process\.env\.APP_HOST/);
});

test('remote deploy script requires immutable GHCR commit tags and has rollback logic', async () => {
  const script = await read('deploy/remote-deploy.sh');
  assert.match(script, /ghcr\[\.\]io/);
  assert.match(script, /\[0-9a-f\]\{40\}/);
  assert.match(script, /flock/);
  assert.match(script, /rollback\(\)/);
  assert.match(script, /--no-deps --force-recreate --wait app/);
  assert.doesNotMatch(script, /--remove-orphans/);
});
