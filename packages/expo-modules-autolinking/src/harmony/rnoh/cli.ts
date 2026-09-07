import fs from 'node:fs';
import path from 'node:path';

import { RnohCliPackage } from '../../config/constants';
import { HarmonyAutolinkingError } from '../../errors';
import { readJsonAsync, realpathExistingAsync, resolvePackageFromProject } from '../../utilities/values';

function findPackageJson(root, packageName) {
  try {
    return resolvePackageFromProject(root, `${packageName}/package.json`);
  } catch (cause) {
    throw new HarmonyAutolinkingError('RNOH_CLI_NOT_FOUND', `${packageName} is not installed.`, {
      cause,
      stage: 'rnoh-preflight',
    });
  }
}

async function resolveCliAsync(options) {
  const root = await realpathExistingAsync(options.projectRoot, {
    type: 'directory',
    field: 'projectRoot',
    stage: 'rnoh-preflight',
  });

  const raw = options.rnohCliPackageJsonPath
    || findPackageJson(root, RnohCliPackage);
  const manifest = await realpathExistingAsync(raw, {
    type: 'file',
    code: 'RNOH_CLI_NOT_FOUND',
    field: 'RNOH CLI package.json',
    stage: 'rnoh-preflight',
  });

  const plugin = await readJsonAsync(manifest, 'RNOH_CLI_NOT_FOUND', 'rnoh-preflight');
  if (plugin.name !== RnohCliPackage) {
    throw new HarmonyAutolinkingError('RNOH_CLI_NOT_FOUND', `Expected ${RnohCliPackage}, found ${String(plugin.name)}.`, { stage: 'rnoh-preflight' });
  }

  const config = path.join(path.dirname(manifest), 'react-native.config.js');
  if (!fs.existsSync(config)) {
    throw new HarmonyAutolinkingError('RNOH_CLI_NOT_FOUND', `${RnohCliPackage} does not expose its public React Native CLI plugin config.`, { stage: 'rnoh-preflight' });
  }

  if (options.reactNativeExecutable) {
    const executable = await realpathExistingAsync(options.reactNativeExecutable, {
      type: 'file',
      code: 'RNOH_CLI_NOT_FOUND',
      field: 'project-local react-native executable',
      stage: 'rnoh-preflight',
    });

    return { executable, args: [] as string[] };
  }

  // Resolve the package itself, not a package-manager-generated .bin shell shim.
  // The real manifest path also handles symlinked packages (for example pnpm).
  const file = await realpathExistingAsync(
    options.nodeModulesPath
      ? path.join(options.nodeModulesPath, 'react-native', 'package.json')
      : findPackageJson(root, 'react-native'),
    {
      type: 'file',
      code: 'RNOH_CLI_NOT_FOUND',
      field: 'project-local react-native package.json',
      stage: 'rnoh-preflight',
    }
  );
  const pkg = await readJsonAsync(file, 'RNOH_CLI_NOT_FOUND', 'rnoh-preflight');
  const bin = typeof pkg.bin === 'string'
    ? pkg.bin
    : pkg.bin?.['react-native'];
  if (typeof bin !== 'string' || !bin.trim()) {
    throw new HarmonyAutolinkingError('RNOH_CLI_NOT_FOUND', 'The project-local react-native package does not declare a react-native bin entry.', { stage: 'rnoh-preflight' });
  }

  const entry = await realpathExistingAsync(path.resolve(path.dirname(file), bin), {
    type: 'file',
    code: 'RNOH_CLI_NOT_FOUND',
    field: 'project-local react-native executable',
    stage: 'rnoh-preflight',
  });

  return { executable: process.execPath, args: [entry] };
}

export {
  resolveCliAsync,
};
