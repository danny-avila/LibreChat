import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/main.ts', 'src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node24',
  dts: false,
  outDir: 'dist',
  clean: true,
  deps: { alwaysBundle: [/.*/] },
});
