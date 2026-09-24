import { defineConfig } from 'vite';

export default defineConfig({
  base: '/klima-admin/',
  envDir: '../../',
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
  server: {
    port: 3095,
    proxy: {
      '/api': {
        target: 'http://localhost:3080',
        changeOrigin: true,
      },
    },
  },
});
