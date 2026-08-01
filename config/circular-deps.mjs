import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');

/**
 * Module graphs checked for cycles. `alias` mirrors each target's tsconfig
 * paths (or module-alias for the legacy server); `internal` lists the aliased
 * specifier prefixes that are first-party alongside relative/absolute imports.
 * `minModules` is a resolution-rot guard: if a graph shrinks below it, the
 * scan is no longer seeing the real codebase and must fail rather than
 * silently pass.
 */
const targets = [
  {
    name: '@librechat/api',
    dir: 'packages/api',
    entries: ['src/index.ts', 'src/telemetry.ts'],
    alias: { '~': 'src' },
    internal: ['~'],
    minModules: 200,
  },
  {
    name: 'librechat-data-provider',
    dir: 'packages/data-provider',
    entries: ['src/index.ts', 'src/react-query/index.ts'],
    alias: { src: 'src' },
    internal: ['src/'],
    minModules: 20,
  },
  {
    name: '@librechat/data-schemas',
    dir: 'packages/data-schemas',
    entries: ['src/index.ts', 'src/admin/capabilities.ts'],
    alias: { '~': 'src' },
    internal: ['~'],
    minModules: 75,
  },
  {
    name: 'api server',
    dir: 'api',
    entries: ['server/index.js'],
    alias: { '~': '.' },
    internal: ['~'],
    minModules: 150,
  },
];

/** Loads the rolldown instance the tsdown builds run on, keeping resolution semantics identical. */
async function loadRolldown() {
  const apiRequire = createRequire(path.join(root, 'packages/api/package.json'));
  const tsdownRequire = createRequire(apiRequire.resolve('tsdown'));
  const rolldownEntry = tsdownRequire.resolve('rolldown');
  const { rolldown } = await import(pathToFileURL(rolldownEntry).href);
  return rolldown;
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (message) => message.replace(/\u001B\[[0-9;]*m/g, '');
const relativize = (message) => stripAnsi(message).replaceAll(root + path.sep, '');

async function scan(rolldown, target) {
  const cycles = [];
  const unresolved = [];
  const isInternal = (id) =>
    id.startsWith('.') || path.isAbsolute(id) || target.internal.some((p) => id.startsWith(p));
  const alias = Object.fromEntries(
    Object.entries(target.alias).map(([key, dir]) => [key, path.join(root, target.dir, dir)]),
  );

  try {
    const build = await rolldown({
      input: target.entries.map((entry) => path.join(root, target.dir, entry)),
      platform: 'node',
      resolve: { alias },
      external: (id) => !isInternal(id),
      checks: { circularDependency: true },
      onLog(_level, log) {
        if (log.code === 'CIRCULAR_DEPENDENCY') {
          cycles.push(relativize(log.message));
        } else if (log.code === 'UNRESOLVED_IMPORT') {
          unresolved.push(relativize(log.message));
        }
      },
    });
    const { output } = await build.generate({ format: 'cjs' });
    const modules = output.reduce((sum, chunk) => sum + (chunk.moduleIds?.length ?? 0), 0);
    await build.close();
    return { target, cycles, unresolved, modules, error: null };
  } catch (error) {
    return { target, cycles, unresolved, modules: 0, error };
  }
}

function report({ target, cycles, unresolved, modules, error }) {
  const problems = [];
  if (error) {
    problems.push(`build failed: ${relativize(error.message)}`);
  }
  if (cycles.length > 0) {
    problems.push(...cycles);
  }
  if (unresolved.length > 0) {
    problems.push(...unresolved.map((message) => `unresolved first-party import: ${message}`));
  }
  if (!error && modules < target.minModules) {
    problems.push(
      `graph has ${modules} modules, below the ${target.minModules} floor; the scan is no longer resolving the real codebase`,
    );
  }

  if (problems.length === 0) {
    console.log(`✓ ${target.name}: no circular dependencies (${modules} modules)`);
    return true;
  }
  console.error(`✗ ${target.name}:`);
  for (const problem of problems) {
    console.error(`    ${problem}`);
  }
  return false;
}

const rolldown = await loadRolldown();
const results = await Promise.all(targets.map((target) => scan(rolldown, target)));
const passed = results.map(report).every(Boolean);

if (!passed) {
  console.error('\nCircular dependency check failed.');
  process.exit(1);
}
