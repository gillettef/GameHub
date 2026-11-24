import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverSrc = fileURLToPath(new URL('../server/src', import.meta.url));

export default defineConfig({
  // 서버 루트(:3001/)와 허브 접두어(/eleven/) 아래 양쪽에서 돌도록 상대 경로로 빌드한다.
  // 클라이언트 라우터가 없고(초대는 ?code=) 문서는 항상 앱 루트에 있으므로 상대 base 로 충분하다
  base: './',
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
