import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite runs this file in Node; declare the one env lookup instead of adding @types/node for it.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.AGORA_API_URL ?? 'http://localhost:3000', changeOrigin: true } },
  },
});
