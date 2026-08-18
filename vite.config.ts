import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { apiDevServer } from './vite-api-dev';

export default defineConfig(({ mode }) => {
  // Em produção a Vercel injeta as env vars diretamente no processo da
  // lambda. Em dev, `apiDevServer` roda a mesma api/index.ts dentro deste
  // processo Node do Vite — mas o Vite só expõe .env.local via
  // import.meta.env, nunca em process.env. Sem isto, api/_lib/env.ts (que lê
  // process.env) sempre enxergaria as variáveis como ausentes em dev, mesmo
  // com o .env.local preenchido.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
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
  };
});