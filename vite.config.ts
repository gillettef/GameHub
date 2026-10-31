/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 포트: 다른 서비스와 겹치지 않게 고른 무작위 고정값(운영과 무관)
    port: 25358,
    strictPort: true,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:23641', ws: true },
    },
  },
  // 카드 일러스트는 JS 에 인라인하지 않고 파일로 둔다(지연 로딩)
  build: { outDir: 'dist', sourcemap: false, assetsInlineLimit: (file: string) => (file.includes('/assets/art/') ? false : undefined) },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'tests/**/*.test.ts'] },
});
