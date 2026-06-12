import { defineConfig } from 'tsdown';

// Mirror the prior Rollup `@rollup/plugin-replace` substitutions: only these three are
// baked at lib-build time. `import.meta.env.MODE` and `REACT_APP_*` are intentionally left
// intact so the consuming Vite app resolves them at app-build time.
const define = {
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  'process.env.VITE_ENABLE_LOGGER': JSON.stringify(process.env.VITE_ENABLE_LOGGER || 'false'),
  'process.env.VITE_LOGGER_FILTER': JSON.stringify(process.env.VITE_LOGGER_FILTER || ''),
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'browser',
  dts: { oxc: true },
  outDir: 'dist',
  sourcemap: true,
  // Force .mjs/.cjs (and .d.mts/.d.cts) regardless of package `type`, so the package can stay
  // CommonJS (jest.config.js / babel.config.js are CJS) while still shipping dual ESM/CJS.
  fixedExtension: true,
  define,
  // Extract all component CSS into a single `dist/style.css` (no import left in the JS, so the
  // CJS output stays valid CommonJS). Consumers import `@librechat/client/style.css` once.
  css: { inject: false },
  // Externalize every third-party import (consumers provide the peers + react/jsx-runtime);
  // bundle only relative, `~`-aliased, and absolute sources.
  deps: {
    neverBundle: (id) => !id.startsWith('.') && !id.startsWith('~') && !id.startsWith('/'),
    onlyBundle: false,
  },
});
