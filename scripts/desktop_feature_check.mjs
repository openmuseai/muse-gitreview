import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['test', 'typecheck', 'build']) {
  const result = spawnSync('npm', ['run', name], { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
