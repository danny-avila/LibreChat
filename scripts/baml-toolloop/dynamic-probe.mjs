// Spike: the v0 dynamic-types API vs. the v1 equivalent.
//
//   npx tsc -p baml_ts/tsconfig.json && node scripts/baml-toolloop/dynamic-probe.mjs
//
// docs.boundaryml.com/guide/baml-advanced/dynamic-types documents the **v0**
// mechanism: `@@dynamic` as a class suffix, `new TypeBuilder()` from
// `baml_client/type_builder`, and a `{ tb }` call option.
//
// None of those spellings exist in v1. That does NOT mean runtime types were
// removed — v1 replaced the builder OBJECT with generics + `$types`. See
// `runtime-union-probe.mjs`, which is the authoritative probe for the
// capability. This file only pins that the v0 *spellings* no longer apply, so
// nobody wastes an afternoon porting v0 snippets.
//
// Offline — no API key, no network.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as bridge from '@boundaryml/baml-bridge';
import { toolloop } from '../../baml_ts/dist/index.js';

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../baml_ts/baml_sdk');

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push(`ok    ${name}`);
  } catch (error) {
    checks.push(`FAIL  ${name}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
};

// ── v0 spellings: gone ─────────────────────────────────────────────────────
check('D1 no `TypeBuilder` export on the bridge (v0 spelling)', () => {
  assert.deepEqual(Object.keys(bridge).filter((k) => /typebuilder/i.test(k)), []);
});

check('D1b no `type_builder` module in the generated SDK (v0 spelling)', () => {
  assert.deepEqual(Object.keys(toolloop).filter((k) => /type_?builder/i.test(k)), []);
});

check('D1c the generated signature has no `tb` option (v0 spelling)', () => {
  const src = readFileSync(resolve(sdkRoot, 'toolloop/index.ts'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('export const SelectDynTool ='));
  assert.ok(line);
  assert.doesNotMatch(line, /\btb\b/);
});

check('D1d passing a v0-style `{ tb }` is rejected loudly, not ignored', () => {
  assert.throws(
    () => toolloop['SelectDynTool$parse']('{"tool":"weather"}', { tb: {} }),
    /unknown optional argument "tb"/,
  );
});

// ── v1 spellings: present ──────────────────────────────────────────────────
check('D2 the bridge DOES export the runtime type vocabulary', () => {
  // `Never` and `lowerTypeToWireTy` are the `BamlType` machinery that `$types`
  // bindings are expressed in — this is the TypeBuilder successor.
  assert.equal(typeof bridge.lowerTypeToWireTy, 'function');
  assert.ok('Never' in bridge);
});

check('D2b codegen emits a generic binding contract for a generic function', () => {
  const src = readFileSync(resolve(sdkRoot, 'toolloop/index.ts'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('export const SelectToolGeneric ='));
  assert.ok(line, 'SelectToolGeneric not found');
  assert.match(line, /\{ typeParams: \["T"\] \}/);
});

check('D2c $types actually binds that type var at runtime', () => {
  const w = toolloop['SelectToolGeneric$parse'](
    '{"city":"Boston","time_of_day":"2026-08-09T13:00:00Z"}',
    { $types: { T: toolloop.WeatherAPI } },
  );
  assert.equal(w.city, 'Boston');
});

// ── v1 `dynamic` keyword: exists, but scoped to a test's type_builder block ─
check('D3 `dynamic` is a prefix inside a test `type_builder` block, not a suffix', () => {
  const src = readFileSync(resolve(sdkRoot, '../../baml_src/ns_toolloop/dynamic.baml'), 'utf8');
  assert.match(src, /type_builder \{/);
  assert.match(src, /dynamic class/);
});

for (const line of checks) console.log(line);
const failed = checks.filter((c) => c.startsWith('FAIL')).length;
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed}/${checks.length} v0-vs-v1 dynamic-type checks`);
