import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "localhost",
    port: 3090,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://localhost:3080",
        changeOrigin: true,
      }
    }
  },
  plugins: [react()],
  build: {
    sourcemap: true,
    outDir: "./public",
  },
  resolve: {
    alias: {
      "~": path.join(__dirname, "src/"),
    },
  },
  define: {
    // global: {},
    // process: {
    //   env: {
    //     VITE_APP_API: process?.env.VITE_APP_API || 'production',
    //   },
    // },
  },
});

// module.exports = {
//   plugins: [require("tailwindcss")],
// };