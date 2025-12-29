import react from '@vitejs/plugin-react';
// @ts-ignore
import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
const backendPort = process.env.BACKEND_PORT && Number(process.env.BACKEND_PORT) || 3080;
const backendURL = process.env.HOST ? `http://${process.env.HOST}:${backendPort}` : `http://localhost:${backendPort}`;

export default defineConfig(({ command }) => ({
  base: '',
  server: {
    allowedHosts: process.env.VITE_ALLOWED_HOSTS && process.env.VITE_ALLOWED_HOSTS.split(',') || [],
    host: process.env.HOST || 'localhost',
    port: process.env.PORT && Number(process.env.PORT) || 3090,
    strictPort: false,
    proxy: {
      '/api': {
        target: backendURL,
        changeOrigin: true,
      },
      '/oauth': {
        target: backendURL,
        changeOrigin: true,
      },
    },
  },
  // Set the directory where environment variables are loaded from and restrict prefixes
  envDir: '../',
  envPrefix: ['VITE_', 'SCRIPT_', 'DOMAIN_', 'ALLOW_'],
  plugins: [
    react(),
    nodePolyfills(),
    VitePWA({
      injectRegister: 'auto', // 'auto' | 'manual' | 'disabled'
      registerType: 'autoUpdate', // 'prompt' | 'autoUpdate'
      devOptions: {
        enabled: false, // disable service worker registration in development mode
      },
      useCredentials: true,
      includeManifestIcons: false,
      workbox: {
        globPatterns: [
          '**/*.{js,css,html}',
          'assets/favicon*.png',
          'assets/icon-*.png',
          'assets/apple-touch-icon*.png',
          'assets/maskable-icon.png',
          'manifest.webmanifest',
        ],
        globIgnores: ['images/**/*', '**/*.map', 'index.html'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/oauth/, /^\/api/],
      },
      includeAssets: [],
      manifest: {
        name: 'LibreChat',
        short_name: 'LibreChat',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#009688',
        icons: [
          {
            src: 'assets/favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
          },
          {
            src: 'assets/favicon-16x16.png',
            sizes: '16x16',
            type: 'image/png',
          },
          {
            src: 'assets/apple-touch-icon-180x180.png',
            sizes: '180x180',
            type: 'image/png',
          },
          {
            src: 'assets/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'assets/maskable-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    sourcemapExclude({ excludeNodeModules: true }),
    compression({
      threshold: 10240,
    }),
  ],
  publicDir: command === 'serve' ? './public' : false,
  build: {
    sourcemap: process.env.NODE_ENV === 'development',
    outDir: './dist',
    minify: 'terser',
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      output: {
        manualChunks(id: string) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('node_modules')) {
            // High-impact chunking for large libraries

            // IMPORTANT: mermaid and ALL its dependencies must be in the same chunk
            // to avoid initialization order issues. This includes chevrotain, langium,
            // dagre-d3-es, and their nested lodash-es dependencies.
            if (
              normalizedId.includes('mermaid') ||
              normalizedId.includes('dagre-d3-es') ||
              normalizedId.includes('chevrotain') ||
              normalizedId.includes('langium') ||
              normalizedId.includes('lodash-es')
            ) {
              return 'mermaid';
            }

            if (normalizedId.includes('@codesandbox/sandpack')) {
              return 'sandpack';
            }
            if (normalizedId.includes('react-virtualized')) {
              return 'virtualization';
            }
            if (normalizedId.includes('i18next') || normalizedId.includes('react-i18next')) {
              return 'i18n';
            }
            // Only regular lodash (not lodash-es which goes to mermaid chunk)
            if (normalizedId.includes('/lodash/')) {
              return 'utilities';
            }
            if (normalizedId.includes('date-fns')) {
              return 'date-utils';
            }
            if (normalizedId.includes('@dicebear')) {
              return 'avatars';
            }
            if (normalizedId.includes('react-dnd') || normalizedId.includes('react-flip-toolkit')) {
              return 'react-interactions';
            }
            if (normalizedId.includes('react-hook-form')) {
              return 'forms';
            }
            if (normalizedId.includes('react-router-dom')) {
              return 'routing';
            }
            if (
              normalizedId.includes('qrcode.react') ||
              normalizedId.includes('@marsidev/react-turnstile')
            ) {
              return 'security-ui';
            }

            if (normalizedId.includes('@codemirror/view')) {
              return 'codemirror-view';
            }
            if (normalizedId.includes('@codemirror/state')) {
              return 'codemirror-state';
            }
            if (normalizedId.includes('@codemirror/language')) {
              return 'codemirror-language';
            }
            if (normalizedId.includes('@codemirror')) {
              return 'codemirror-core';
            }

            if (
              normalizedId.includes('react-markdown') ||
              normalizedId.includes('remark-') ||
              normalizedId.includes('rehype-')
            ) {
              return 'markdown-processing';
            }
            if (normalizedId.includes('monaco-editor') || normalizedId.includes('@monaco-editor')) {
              return 'code-editor';
            }
            if (normalizedId.includes('react-window') || normalizedId.includes('react-virtual')) {
              return 'virtualization';
            }
            if (
              normalizedId.includes('zod') ||
              normalizedId.includes('yup') ||
              normalizedId.includes('joi')
            ) {
              return 'validation';
            }
            if (
              normalizedId.includes('axios') ||
              normalizedId.includes('ky') ||
              normalizedId.includes('fetch')
            ) {
              return 'http-client';
            }
            if (
              normalizedId.includes('react-spring') ||
              normalizedId.includes('react-transition-group')
            ) {
              return 'animations';
            }
            if (normalizedId.includes('react-select') || normalizedId.includes('downshift')) {
              return 'advanced-inputs';
            }
            if (normalizedId.includes('heic-to')) {
              return 'heic-converter';
            }

            // Existing chunks
            if (normalizedId.includes('@radix-ui')) {
              return 'radix-ui';
            }
            if (normalizedId.includes('framer-motion')) {
              return 'framer-motion';
            }
            if (normalizedId.includes('node_modules/highlight.js')) {
              return 'markdown_highlight';
            }
            if (normalizedId.includes('katex') || normalizedId.includes('node_modules/katex')) {
              return 'math-katex';
            }
            if (normalizedId.includes('node_modules/hast-util-raw')) {
              return 'markdown_large';
            }
            if (normalizedId.includes('@tanstack')) {
              return 'tanstack-vendor';
            }
            if (normalizedId.includes('@headlessui')) {
              return 'headlessui';
            }

            // Everything else falls into a generic vendor chunk.
            return 'vendor';
          }
          // Create a separate chunk for all locale files under src/locales.
          if (normalizedId.includes('/src/locales/')) {
            return 'locales';
          }
          // Let Rollup decide automatically for any other files.
          return null;
        },
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.[0] && /\.(woff|woff2|eot|ttf|otf)$/.test(assetInfo.names[0])) {
            return 'assets/fonts/[name][extname]';
          }
          return 'assets/[name].[hash][extname]';
        },
      },
      /**
       * Ignore "use client" warning since we are not using SSR
       * @see {@link https://github.com/TanStack/query/pull/5161#issuecomment-1477389761 Preserve 'use client' directives TanStack/query#5161}
       */
      onwarn(warning, warn) {
        if (warning.message.includes('Error when using sourcemap')) {
          return;
        }
        warn(warning);
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      '~': path.join(__dirname, 'src/'),
      $fonts: path.resolve(__dirname, 'public/fonts'),
      'micromark-extension-math': 'micromark-extension-llm-math',
    },
  },
}));

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
