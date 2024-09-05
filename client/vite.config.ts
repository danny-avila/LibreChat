import path, { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, createLogger } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { Plugin } from 'vite';

const logger = createLogger();
const originalWarning = logger.warn;
logger.warn = (msg, options) => {
  /* Suppresses:
   [vite:css] Complex selectors in '.group:focus-within .dark\:group-focus-within\:text-gray-300:is(.dark *)' can not be transformed to an equivalent selector without ':is()'.
   */
  if (msg.includes('vite:css') && msg.includes('^^^^^^^')) {
    return;
  }
  /* Suppresses:
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
   */
  if (msg.includes('Use build.rollupOptions.output.manualChunks')) {
    return;
  }
  originalWarning(msg, options);
};

// https://vitejs.dev/config/
export default defineConfig({
  customLogger: logger,
  server: {
    fs: {
      cachedChecks: false,
    },
    host: 'localhost',
    port: 3090,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3080',
        changeOrigin: true,
      },
      '/oauth': {
        target: 'http://localhost:3080',
        changeOrigin: true,
      },
    },
  },
  // All other env variables are filtered out
  envDir: '../',
  envPrefix: ['VITE_', 'SCRIPT_', 'DOMAIN_', 'ALLOW_'],
  plugins: [
    react(),
    nodePolyfills(),
    VitePWA({
      injectRegister: 'auto', // 'auto' | 'manual' | 'disabled'
      registerType: 'prompt', // 'prompt' | 'auto' | 'disabled'
      devOptions: {
        enabled: false, // enable/disable registering SW in development mode
      },
      workbox: {
        cleanupOutdatedCaches: true, // Add this line to clean up outdated caches
        globPatterns: ['assets/**/*.{png,jpg,svg,ico}', '**/*.{js,css,html,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Intelewriter',
        short_name: 'Intelewriter',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#009688',
        icons: [
          {
            src: '/assets/favicon-32x32.ico',
            sizes: '32x32',
            type: 'image/x-icon',
          },
          {
            src: '/assets/favicon-16x16.png',
            sizes: '16x16',
            type: 'image/png',
          },
          {
            src: '/assets/maskable-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    sourcemapExclude({ excludeNodeModules: true }),
  ],
  publicDir: './public',
  build: {
    sourcemap: process.env.NODE_ENV === 'development',
    outDir: './dist',
    rollupOptions: {
      // external: ['uuid'],
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/highlight.js')) {
            return 'markdown_highlight';
          }
          if (id.includes('node_modules/hast-util-raw')) {
            return 'markdown_large';
          }
          if (id.includes('node_modules/katex')) {
            return 'markdown_large';
          }
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
      /**
       * Ignore "use client" waning since we are not using SSR
       * @see {@link https://github.com/TanStack/query/pull/5161#issuecomment-1477389761 Preserve 'use client' directives TanStack/query#5161}
       */
      onwarn(warning, warn) {
        if (
          // warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          warning.message.includes('Error when using sourcemap')
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  resolve: {
    alias: {
      '~': path.join(__dirname, 'src/'),
      $fonts: resolve('public/fonts'),
    },
  },
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
          map: { mappings: '' },
        };
      }
    },
  };
}
