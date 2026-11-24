import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 서버 루트(:8080/)와 허브 접두어(/magicacademy/) 아래 양쪽에서 돌도록 상대 경로로 빌드한다.
  // 클라이언트 라우터가 없어 문서는 항상 앱 루트에 있으므로 상대 base 로 충분하다
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
