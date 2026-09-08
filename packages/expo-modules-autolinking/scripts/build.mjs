import { spawnSync } from 'node:child_process';
import { chmodSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

rmSync(path.join(root, 'build'), { recursive: true, force: true });

const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  throw new Error('Unable to start the TypeScript compiler.', { cause: result.error });
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else if (process.platform !== 'win32') {
  const file = path.join(root, 'build/bin/expo-harmony-autolinking.js');
  chmodSync(file, statSync(file).mode | 0o111);
}
