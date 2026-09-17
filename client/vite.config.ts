import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverSrc = fileURLToPath(new URL('../server/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@server': serverSrc },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
      '/health': 'http://localhost:3001',
      '/api': 'http://localhost:3001',
    },
  },
});
