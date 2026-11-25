import { defineGameConfig } from '@gamehub/config/vite'

export default defineGameConfig({
  // 개발 포트: 다른 서비스와 겹치지 않게 고른 고정값. 온라인 방 서버(/ws)는 공통 설정이 같은 포트에 붙인다
  // Cloudflare 퀵 터널(/dev)로 들어오는 외부 친구 접속 허용
  server: { port: 25358, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
  // 카드 일러스트는 JS 에 인라인하지 않고 파일로 둔다(지연 로딩)
  build: { assetsInlineLimit: (file: string) => (file.includes('/assets/art/') ? false : undefined) },
})
