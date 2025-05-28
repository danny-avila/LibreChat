import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { compression } from 'vite-plugin-compression2';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { Plugin } from 'vite';

// Специальная конфигурация для продакшен сборки на Zeabur
export default defineConfig({
  // Set the directory where environment variables are loaded from and restrict prefixes
  envDir: '../',
  envPrefix: ['VITE_', 'SCRIPT_', 'DOMAIN_', 'ALLOW_'],
  plugins: [
    react(),
    nodePolyfills({
      // Минимальные полифиллы только для необходимых модулей
      include: ['util', 'process', 'buffer'],
      globals: {
        Buffer: false,
        global: false,
        process: false,
      },
    }) as any,
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      useCredentials: true,
      workbox: {
        globPatterns: ['**/*'],
        globIgnores: ['images/**/*', '**/*.map'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // Увеличиваем до 10MB для больших чанков
        navigateFallbackDenylist: [/^\/oauth/],
        // Исключаем очень большие файлы из кэширования
        dontCacheBustURLsMatching: /\.\w{8}\./,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 365 days
              }
            }
          }
        ]
      },
      includeAssets: ['**/*'],
      manifest: {
        name: 'AI Experts OS',
        short_name: 'AI Experts',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
    compression({
      algorithm: 'gzip',
      threshold: 1024,
      deleteOriginalAssets: false,
    }),
  ],
  publicDir: './public',
  build: {
    sourcemap: false, // Отключаем sourcemap для продакшена
    outDir: './dist',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      external: (id) => {
        // Исключаем проблемные модули
        if (id.includes('vm-browserify')) {
          return true;
        }
        return false;
      },
      output: {
        manualChunks: {
          // Критически важные чанки
          vendor: ['react', 'react-dom'],
          'radix-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'framer-motion': ['framer-motion'],
          'tanstack': ['@tanstack/react-query', '@tanstack/react-table'],
          'headlessui': ['@headlessui/react'],
          utils: ['lodash', 'date-fns', 'clsx'],
          virtualization: ['react-virtualized'],
          'markdown-processing': ['react-markdown', 'remark-gfm', 'rehype-highlight', 'rehype-katex'],
          'code-editor': ['@codesandbox/sandpack-react'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          'react-interactions': ['react-dnd', 'react-dnd-html5-backend', 'react-flip-toolkit'],
          forms: ['react-hook-form'],
          routing: ['react-router-dom'],
          animations: ['@react-spring/web', 'react-transition-group'],
          'ui-components': ['input-otp', 'react-textarea-autosize', 'rc-input-number'],
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
      onwarn(warning, warn) {
        // Игнорируем известные предупреждения
        if (warning.message.includes('Error when using sourcemap')) {
          return;
        }
        if (warning.message.includes('Module level directives cause errors when bundled') && 
            warning.message.includes('react-virtualized')) {
          return;
        }
        if (warning.message.includes('Use of eval') && 
            warning.message.includes('vm-browserify')) {
          return;
        }
        // Игнорируем предупреждения о большом размере чанков для известных библиотек
        if (warning.code === 'LARGE_BUNDLE' && warning.message.includes('chunk')) {
          return;
        }
        warn(warning);
      },
    },
    chunkSizeWarningLimit: 2000, // Увеличиваем лимит для больших чанков
  },
  resolve: {
    alias: {
      '~': path.join(__dirname, 'src/'),
      $fonts: '/fonts',
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react-virtualized'],
    exclude: ['vm-browserify'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
      target: 'es2020',
    }
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
