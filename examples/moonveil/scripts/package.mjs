import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Python's standard library keeps source exports independent of archive packages.
const result = spawnSync('python3', ['scripts/export-source.py'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) {
  console.error('源码打包需要 Python 3，请安装后重试。');
}
process.exitCode = result.status ?? 1;
