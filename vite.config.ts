import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // npm run share: Cloudflare 퀵 터널 주소로 들어오는 요청 허용
  preview: { allowedHosts: ['.trycloudflare.com'] },
  // 온라인 대전: npm run server(8091)의 WebSocket 으로 넘긴다
  server: { proxy: { '/ws': { target: 'ws://localhost:8091', ws: true } } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
