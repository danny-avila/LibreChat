import { defineConfig } from 'vite'
import { externalizeDeps } from 'vite-plugin-externalize-deps'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: './index.ts',
      fileName: 'index',
    },
    rollupOptions: {
      external: [/^node:.*$/],
      output: [
        {
          esModule: true,
          exports: 'named',
          format: 'es',
        },
        {
          exports: 'named',
          format: 'cjs',
          inlineDynamicImports: true,
          interop: 'auto',
        },
      ],
    },
    sourcemap: true,
    target: 'esnext',
  },
  plugins: [
    externalizeDeps(),
  ],
})
