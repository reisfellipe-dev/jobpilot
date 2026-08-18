import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { apiDevServer } from './vite-api-dev';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), apiDevServer()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    host: true,
  },

  build: {
    target: 'es2022',
    sourcemap: false,
  },
}));