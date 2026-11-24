import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 게임 허브가 /tesseract/ 접두어 아래로 프록시해도 에셋을 찾도록 상대 경로로 빌드한다
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    passWithNoTests: true,
  },
})
