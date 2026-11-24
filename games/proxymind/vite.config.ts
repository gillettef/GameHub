import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'prototype',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  // 온라인 대전: npm run server(8105)의 WebSocket 으로 넘긴다. 다른 게임과 겹치지 않게 고정 포트
  server: { port: 5195, strictPort: true, proxy: { '/ws': { target: 'ws://localhost:8105', ws: true } } },
  test: {
    root: '.',
    environment: 'node',
    include: ['prototype/**/*.test.ts'],
  },
});
