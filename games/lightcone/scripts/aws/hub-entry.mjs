// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc").
// 온라인 대전(/ws, /health)은 npm run build 가 묶은 server-dist/app.cjs, 정적 파일(dist)은 허브가 서빙한다.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export async function mount() {
  const app = createRequire(import.meta.url)('../../server-dist/app.cjs').createApp()
  return { staticRoot: fileURLToPath(new URL('../../dist', import.meta.url)), handle: app.handle, upgrade: app.upgrade, close: app.close }
}
