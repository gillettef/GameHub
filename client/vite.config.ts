import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
      '/health': 'http://localhost:3001',
      '/api': 'http://localhost:3001',
    },
  },
});
