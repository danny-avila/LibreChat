import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from './bamlFingerprint.mjs';

/**
 * Asserts the shape of `packages/api/dist` after any supported build.
 *
 * The plan's exact ten-file manifest is asserted for everything the BAML change
 * owns. It cannot be asserted for the whole directory: the pre-existing CJS build
 * already emits hashed shared chunks between `index` and `telemetry`
 * (`redisTelemetry-*.cjs`, `index-*.d.cts`), and removing those would mean
 * rewriting the package's entry graph for reasons unrelated to BAML. So hashed
 * CJS chunks are the ONE tolerated extra, and every failure mode the manifest
 * exists to catch — an ESM twin of a CJS entry, a CJS twin of an ESM entry, a
 * leaked generated tree, a spec, a probe, the old source adapter — is denied by
 * name.
 */

const DIST = path.join(PACKAGE_ROOT, 'dist');

const REQUIRED = [
  'index.cjs',
  'index.cjs.map',
  'index.d.cts',
  'telemetry.cjs',
  'telemetry.cjs.map',
  'telemetry.d.cts',
  'baml/runtime.mjs',
  'baml/runtime.mjs.map',
  'baml/worker.mjs',
  'baml/worker.mjs.map',
];

const FORBIDDEN = [
  'index.mjs',
  'telemetry.mjs',
  'baml/runtime.cjs',
  'baml/worker.cjs',
  'baml/adapter.mjs',
  'baml/manifest.js',
];

/** A rolldown shared chunk: `<name>-<hash>.cjs` and friends. */
const HASHED_CJS_CHUNK = /^[A-Za-z0-9_$]+-[A-Za-z0-9_-]{6,}\.(cjs|cjs\.map|d\.cts)$/;

const walk = (dir, prefix = '') => {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...walk(path.join(dir, entry.name), relative));
      continue;
    }
    found.push(relative);
  }
  return found;
};

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

try {
  statSync(DIST);
} catch {
  fail(`Missing build output: ${DIST}`);
}

const actual = new Set(walk(DIST));
const problems = [];

for (const required of REQUIRED) {
  if (!actual.has(required)) {
    problems.push(`missing: dist/${required}`);
  }
}

for (const forbidden of FORBIDDEN) {
  if (actual.has(forbidden)) {
    problems.push(`must not be emitted: dist/${forbidden}`);
  }
}

for (const file of actual) {
  if (REQUIRED.includes(file)) {
    continue;
  }
  if (file.startsWith('baml/')) {
    problems.push(`unexpected file in the BAML runtime output: dist/${file}`);
    continue;
  }
  if (/\.(spec|test)\./.test(file) || file.includes('generated/') || file.endsWith('.d.mts')) {
    problems.push(`must not be emitted: dist/${file}`);
    continue;
  }
  if (!HASHED_CJS_CHUNK.test(file)) {
    problems.push(`unexpected file: dist/${file}`);
  }
}

if (problems.length > 0) {
  fail(`dist manifest check failed:\n  ${problems.join('\n  ')}`);
}

process.stdout.write(`dist manifest ok (${actual.size} files)\n`);
