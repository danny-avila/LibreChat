import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: 'localhost',
    port: 3090,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'https://chatgpt-clone-client-4sa6.vercel.app',
        changeOrigin: true
      },
      '/auth': {
        target: 'https://chatgpt-clone-client-4sa6.vercel.app',
        changeOrigin: true
      },
      '/oauth': {
        target: 'http://localhost:3080',
        changeOrigin: true
      }
    }
  },
  plugins: [react(), sourcemapExclude({excludeNodeModules: true})],
  publicDir: './public',
  build: {
    sourcemap: true,
    outDir: './dist',
    rollupOptions: {
      output: {
        manualChunks: id => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      '~': path.join(__dirname, 'src/')
    }
  }
});

interface SourcemapExclude {
  excludeNodeModules?: boolean;
}
export function sourcemapExclude(opts?: SourcemapExclude): Plugin {
  return {
      name: "sourcemap-exclude",
      transform(code: string, id: string) {
          if (opts?.excludeNodeModules && id.includes("node_modules")) {
              return {
                  code,
                  // https://github.com/rollup/rollup/blob/master/docs/plugin-development/index.md#source-code-transformations
                  map: { mappings: "" },
              };
          }
      },
  };
}

