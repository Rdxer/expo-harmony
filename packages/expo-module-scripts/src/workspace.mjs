import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import glob from 'fast-glob';
import JSON5 from 'json5';
import semver from 'semver';

const sections = ['dependencies', 'devDependencies', 'dynamicDependencies'];

async function readOptional(file) {
  try {
    return await fs.readFile(file);
  } catch (cause) {
    if (cause.code === 'ENOENT') return undefined;

    throw new Error(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

export async function findWorkspacePackages(root) {
  root = await fs.realpath(root);

  for (let directory = root; ; directory = path.dirname(directory)) {
    const source = await readOptional(path.join(directory, 'package.json'));
    const manifest = source && JSON.parse(source);
    const patterns = Array.isArray(manifest?.workspaces) ? manifest.workspaces : manifest?.workspaces?.packages;

    if (Array.isArray(patterns)) {
      const files = await glob(patterns.map(pattern => `${pattern.replace(/\/$/u, '')}/package.json`), {
        cwd: directory,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: ['**/node_modules/**'],
      });
      const roots = await Promise.all(files.map(file => fs.realpath(path.dirname(file))));

      const packages = [...new Set(roots)].sort();
      if (directory === root || packages.includes(root)) return { root: directory, packages };
    }

    if (path.dirname(directory) === directory) return undefined;
  }
}

// Native manifests, rather than the JS dependency graph, determine HAR build order.
export function planWorkspaceBuild(projects, targets) {
  const registry = new Map();
  for (const project of projects) {
    const { name, version } = project.ohPackage;

    if (name !== project.packageJson.name || version !== project.packageJson.version || !semver.valid(version)) {
      throw new Error(`${project.packageRoot}: npm and OHPM package names and versions must match.`);
    }
    if (registry.has(name)) throw new Error(`Duplicate workspace OHPM package: ${name}.`);

    registry.set(name, project);
  }

  const ordered = new Map();
  const visiting = [];

  function visit(project) {
    const name = project.ohPackage.name;
    if (ordered.has(name)) return ordered.get(name);
    if (visiting.includes(name)) throw new Error(`Circular Harmony workspace dependency: ${[...visiting, name].join(' -> ')}.`);

    visiting.push(name);
    const dependencies = new Map();
    const declarations = [
      ...sections.flatMap(section => Object.entries(project.ohPackage[section] || {})),
      ...sections.flatMap(section => Object.entries(project.ohProjectPackage[section] || {})
        // The project normally includes its own ./library module.
        .filter(([dependency]) => dependency !== name)),
      ...Object.entries(project.ohProjectPackage.overrides || {}).filter(([dependency]) => dependency !== name),
    ];

    for (const [target, range] of declarations) {
      const dependency = registry.get(target);
      if (!dependency) continue;

      if (typeof range !== 'string' || !semver.validRange(range) || !semver.satisfies(dependency.ohPackage.version, range)) {
        throw new Error(`${name} requires ${target}@${range}, but the workspace contains ${dependency.ohPackage.version}. Update the native dependency before building.`);
      }

      const entry = visit(dependency);
      for (const transitive of entry.dependencies) dependencies.set(transitive.ohPackage.name, transitive);
      dependencies.set(target, dependency);
    }

    visiting.pop();
    const entry = { project, dependencies: [...dependencies.values()] };
    ordered.set(name, entry);

    return entry;
  }

  for (const target of targets) visit(target);

  return [...ordered.values()];
}

export function workspaceOverrides(project, dependencies) {
  return Object.fromEntries(dependencies.map(dependency => [
    dependency.ohPackage.name,
    `file:${path.relative(project.projectRoot, dependency.bundledHar).replace(/\\/gu, '/')}`,
  ]));
}

export async function withWorkspaceOverrides(project, overrides, build) {
  // Fail instead of letting simultaneous builds overwrite each other's manifests.
  const lock = path.join(project.projectRoot, '.expo-harmony-build.lock');
  try {
    await fs.mkdir(lock);
  } catch (cause) {
    if (cause.code === 'EEXIST') throw new Error(`Harmony build already locked: ${lock}. If a previous process was killed, remove this directory after confirming it has stopped.`);

    throw new Error(cause instanceof Error ? cause.message : String(cause), { cause });
  }

  const snapshots = new Map();
  const controller = new globalThis.AbortController();
  const { signal } = controller;
  const interrupt = () => controller.abort();

  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  try {
    if (Object.keys(overrides).length > 0) {
      const file = path.join(project.projectRoot, 'oh-package.json5');
      const files = [
        file,
        path.join(project.projectRoot, 'oh-package-lock.json5'),
        path.join(project.moduleRoot, 'oh-package-lock.json5'),
      ];

      for (const target of files) {
        snapshots.set(target, await readOptional(target));
      }

      const manifest = JSON5.parse(snapshots.get(file).toString());
      manifest.overrides = { ...manifest.overrides, ...overrides };

      await fs.writeFile(file, `${JSON5.stringify(manifest, null, 2)}\n`);

      // Local HARs may change without their version or path changing. Force OHPM
      // to re-resolve them instead of retaining an older lockfile resolution.
      for (const target of files.slice(1)) await fs.rm(target, { force: true });
    }

    if (signal.aborted) throw new globalThis.DOMException('This operation was aborted', 'AbortError');

    const result = await build(signal);
    if (signal.aborted) throw new globalThis.DOMException('This operation was aborted', 'AbortError');

    return result;
  } finally {
    try {
      for (const [file, source] of snapshots) {
        if (source === undefined) await fs.rm(file, { force: true });
        else await fs.writeFile(file, source);
      }
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);

      await fs.rmdir(lock);
    }
  }
}
