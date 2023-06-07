import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: 'localhost',
    port: 3090,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3080',
        changeOrigin: true
      },
      '/oauth': {
        target: 'http://localhost:3080',
        changeOrigin: true
      }
    }
  },
  // All other env variables are filtered out
  envPrefix: ['VITE_', 'SCRIPT_', 'DOMAIN_', 'ALLOW_'],
  plugins: [react(), sourcemapExclude({ excludeNodeModules: true })],
  publicDir: './public',
  build: {
    sourcemap: true,
    outDir: './dist',
    rollupOptions: {
      external: ['uuid'],
      output: {
        manualChunks: (id) => {
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
    name: 'sourcemap-exclude',
    transform(code: string, id: string) {
      if (opts?.excludeNodeModules && id.includes('node_modules')) {
        return {
          code,
          // https://github.com/rollup/rollup/blob/master/docs/plugin-development/index.md#source-code-transformations
          map: { mappings: '' }
        };
      }
    }
  };
}

function htmlPlugin(env: ReturnType<typeof loadEnv>) {
  return {
    name: 'html-transform',
    transformIndexHtml: {
      enforce: 'pre' as const,
      transform: (html: string): string => html.replace(/%(.*?)%/g, (match, p1) => env[p1] ?? match)
    }
  };
}
