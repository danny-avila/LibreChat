import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/admin/capabilities.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  dts: { oxc: true },
  outDir: 'dist',
  sourcemap: true,
  // Externalize third-party deps (consumers provide the peers); bundle `dotenv` so the
  // package stays self-contained for its env-loading side effect, matching the prior Rollup build.
  external: (id) =>
    id !== 'dotenv' &&
    !id.startsWith('dotenv/') &&
    !id.startsWith('.') &&
    !id.startsWith('~') &&
    !id.startsWith('/'),
});
