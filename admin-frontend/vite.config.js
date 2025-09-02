import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // 1) read .env.* or process-env
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:3080';   // backend URL

  return {
    base: '/admin/',
    plugins: [react()],

    // 2) this block makes all /admin/* and /api/* calls hit your backend
    server: {
      proxy: {
        // API & admin-API calls → backend
        '/api':   { target, changeOrigin: true },

        // explicit admin-plugin endpoints
        '/admin/config': { target, changeOrigin: true },
        '/admin/users':  { target, changeOrigin: true },
        '/admin/health': { target, changeOrigin: true },
        // add more endpoints here as they appear
      },
    },

    build: { outDir: 'dist', emptyOutDir: true },

    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
      dedupe: ['react', 'react-dom'],
    },
  };
}); 