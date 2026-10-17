import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // /dev 의 Cloudflare 빠른 터널(*.trycloudflare.com)로 들어온 요청을 받는다(Vite 는 모르는 Host 를 막는다)
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://127.0.0.1:3101',
      '/socket.io': { target: 'http://127.0.0.1:3101', ws: true },
    },
  },
});
