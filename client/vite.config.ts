import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  server: {
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
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#009688',
        icons: [
          {
            src: '/assets/favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
          },
          {
            src: '/assets/favicon-16x16.png',
            sizes: '16x16',
            type: 'image/png',
          },
          {
            src: '/assets/apple-touch-icon-180x180.png',
            sizes: '180x180',
            type: 'image/png',
          },
          {
            src: '/assets/icon-192x192.png',
            sizes: '192x192',
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
          if (id.includes('node_modules')) {
            // High-impact chunking for large libraries
            if (id.includes('@codesandbox/sandpack')) {
              return 'sandpack';
            }
            if (id.includes('react-virtualized')) {
              return 'virtualization';
            }
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'i18n';
            }
            if (id.includes('lodash')) {
              return 'utilities';
            }
            if (id.includes('date-fns')) {
              return 'date-utils';
            }
            if (id.includes('@dicebear')) {
              return 'avatars';
            }
            if (id.includes('react-dnd') || id.includes('react-flip-toolkit')) {
              return 'react-interactions';
            }
            if (id.includes('react-hook-form')) {
              return 'forms';
            }
            if (id.includes('react-router-dom')) {
              return 'routing';
            }
            if (id.includes('qrcode.react') || id.includes('@marsidev/react-turnstile')) {
              return 'security-ui';
            }

            if (id.includes('@codemirror/view')) {
              return 'codemirror-view';
            }
            if (id.includes('@codemirror/state')) {
              return 'codemirror-state';
            }
            if (id.includes('@codemirror/language')) {
              return 'codemirror-language';
            }
            if (id.includes('@codemirror')) {
              return 'codemirror-core';
            }

            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) {
              return 'markdown-processing';
            }
            if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
              return 'code-editor';
            }
            if (id.includes('react-window') || id.includes('react-virtual')) {
              return 'virtualization';
            }
            if (id.includes('zod') || id.includes('yup') || id.includes('joi')) {
              return 'validation';
            }
            if (id.includes('axios') || id.includes('ky') || id.includes('fetch')) {
              return 'http-client';
            }
            if (id.includes('react-spring') || id.includes('react-transition-group')) {
              return 'animations';
            }
            if (id.includes('react-select') || id.includes('downshift')) {
              return 'advanced-inputs';
            }
            if (id.includes('heic-to')) {
              return 'heic-converter';
            }

            // Existing chunks
            if (id.includes('@radix-ui')) {
              return 'radix-ui';
            }
            if (id.includes('framer-motion')) {
              return 'framer-motion';
            }
            if (id.includes('node_modules/highlight.js')) {
              return 'markdown_highlight';
            }
            if (id.includes('katex') || id.includes('node_modules/katex')) {
              return 'math-katex';
            }
            if (id.includes('node_modules/hast-util-raw')) {
              return 'markdown_large';
            }
            if (id.includes('@tanstack')) {
              return 'tanstack-vendor';
            }
            if (id.includes('@headlessui')) {
              return 'headlessui';
            }

            // Everything else falls into a generic vendor chunk.
            return 'vendor';
          }
          // Create a separate chunk for all locale files under src/locales.
          if (id.includes(path.join('src', 'locales'))) {
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
