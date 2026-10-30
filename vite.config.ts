/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8094', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'tests/**/*.test.ts'] },
});
