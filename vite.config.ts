import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // npm run share: Cloudflare 퀵 터널 주소로 들어오는 요청 허용
  preview: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
