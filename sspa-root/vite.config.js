import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  base: '',
  server: {
    host: 'localhost',
    port: 3091,
    strictPort: false,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
    fs: {
      // Allow serving files from the client dist directory
      allow: ['..', '../client/dist'],
    },
  },
  plugins: [
    nodePolyfills(),
  ],
  build: {
    outDir: './dist',
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['http://localhost:3090/src/main-spa.jsx', 'http://localhost:3090/dist/librechat.es.js']
  },
});