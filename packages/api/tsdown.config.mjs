import path from 'node:path';
import { defineConfig } from 'tsdown';

// The CommonJS root of `@librechat/api`.
//
// The telemetry entry is a thin shim (`src/telemetry.ts`) rather than the
// `src/telemetry/index.ts` barrel: oxc emits declarations flat into outDir keyed
// by source basename, so two `index.ts` entries would collide (index.d.cts +
// index2.d.cts). Distinct basenames yield stable `index.*` / `telemetry.*` output.
const cjsConfig = {
  entry: ['src/index.ts', 'src/telemetry.ts'],
  format: ['cjs'],
  platform: 'node',
  dts: { oxc: true },
  outDir: 'dist',
  sourcemap: true,
  // Warn on module cycles at build time; CI enforces via config/circular-deps.mjs.
  checks: { circularDependency: true },
  // Externalize every third-party dependency (consumers provide the peers) and bundle
  // only first-party code: relative imports and the `~/*` tsconfig alias (-> src).
  // `neverBundle` is the 0.22 replacement for the deprecated `external` option.
  deps: {
    neverBundle: (id) => !id.startsWith('.') && !id.startsWith('~') && !path.isAbsolute(id),
  },
};

// The BAML runtime, built as ESM in the SAME invocation but as SEPARATE configs.
//
// ESM has to be its own config rather than `format: ['cjs', 'esm']` on the one
// above: a combined config would emit an ESM twin of every CJS entry
// (`index.mjs`, `telemetry.mjs`) and a CJS twin of every ESM entry, and
// `worker.cjs` cannot exist at all — `@boundaryml/baml-bridge` publishes an
// `import` condition only.
//
// The facade and the worker then get ONE config each because
// `codeSplitting: false` is what keeps unnamed chunks out of the exact dist
// manifest, and rolldown rejects that option for a multi-input build. They share
// `src/baml/protocol.ts`, so a split build would emit a third, unnamed file. Two
// single-entry configs inline that module into each side instead — they run in
// different threads and share no state, so a duplicated copy of a few constants
// is the cheaper half of the trade.
//
// Declarations are off because nothing type-imports these files across the
// package boundary: the CJS side reaches the facade through `src/baml/loader.ts`,
// which owns the types it needs.
const esmEntry = (name, entry) => ({
  entry: { [name]: entry },
  format: ['esm'],
  platform: 'node',
  dts: false,
  outDir: 'dist',
  sourcemap: true,
  outputOptions: { codeSplitting: false },
  // The generated SDK is first-party and MUST be bundled into the worker graph:
  // it is not published, and resolving it at runtime would tie dist to a source
  // tree that Docker does not ship. Exactly one module stays external — the
  // native bridge, which cannot be bundled.
  deps: {
    neverBundle: (id) => id === '@boundaryml/baml-bridge',
  },
});

export default defineConfig([
  cjsConfig,
  esmEntry('baml/runtime', 'src/baml/runtime.mts'),
  esmEntry('baml/worker', 'src/baml/worker.mts'),
]);
