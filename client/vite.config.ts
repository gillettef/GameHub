import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // 같은 네트워크(와이파이)의 휴대폰·다른 PC에서 http://<이 PC IP>:5173 으로 접속할 수 있게 모든 주소에 연다
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:3101',
      '/socket.io': { target: 'http://127.0.0.1:3101', ws: true },
    },
  },
});
