import path from 'node:path';
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/admin/capabilities.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  dts: { oxc: true },
  outDir: 'dist',
  sourcemap: true,
  // Externalize all third-party deps (consumers provide the peers); bundle only `dotenv`
  // so the package stays self-contained for its env-loading side effect, matching the
  // prior Rollup build. `neverBundle` is the 0.22 replacement for the deprecated `external`.
  deps: {
    neverBundle: (id) =>
      id !== 'dotenv' &&
      !id.startsWith('dotenv/') &&
      !id.startsWith('.') &&
      !id.startsWith('~') &&
      !path.isAbsolute(id),
    // dotenv is bundled on purpose, so silence the "detected dependencies in bundle" hint.
    onlyBundle: false,
  },
});
