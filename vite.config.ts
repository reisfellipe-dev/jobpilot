import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { apiDevServer } from './vite-api-dev';

export default defineConfig(({ mode }) => {
  /*
   * As funções de API leem `process.env` (como na Vercel). O Vite, por padrão,
   * só expõe variáveis com prefixo VITE_ e apenas para o cliente. Aqui as demais
   * são carregadas de .env/.env.local para o processo, sem sobrescrever o que já
   * existir no ambiente real.
   */
  const fileEnv = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(fileEnv)) {
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
      host: true, // permite abrir do celular na mesma rede
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('pdfjs-dist')) return 'pdf';
              if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) {
                return 'react-vendor';
              }
              if (id.includes('@supabase')) return 'supabase';
              return 'vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
