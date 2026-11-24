/**
 * 온라인 대전 서버 (로드맵 8단계).
 *
 * 단독 서버(로컬 개발·예전 systemd): HTTP + WebSocket(/ws) 한 포트. 온라인 대전 로직은 app.ts.
 * `dist/`가 있으면 빌드된 클라이언트도 함께 내보낸다. 운영은 GameHub 허브 안에서 실행된다(scripts/aws/hub-entry.mjs).
 *
 * 실행: PORT=8787 npm run dev:server
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { createApp } from './app'

const PORT = Number(process.env.PORT ?? 8787)
/** 배포 번들(server-dist/server.cjs)은 DIST_DIR로 받는다 (scripts/aws/serve.mjs) */
const DIST = resolve(process.env.DIST_DIR ?? join(import.meta.dirname, '..', 'dist'))
const app = createApp()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (app.handle(req, res)) return
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('테서랙트 서버입니다. 클라이언트는 npm run dev(5173)로 여세요.')
    return
  }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

server.on('upgrade', (req, socket, head) => {
  if (!app.upgrade(req, socket, head)) socket.destroy()
})

server.listen(PORT, () => {
  console.log(`테서랙트 서버: http://localhost:${PORT} (WebSocket /ws)`)
})
