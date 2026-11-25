import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** 개발 서버에 게임의 온라인 방 서버(server/app.ts 의 createApp)를 붙인다. `vite` 하나로 화면과 서버가 함께 뜬다 */
function roomServer() {
  return {
    name: 'gamehub-room-server',
    apply: 'serve',
    configureServer(server) {
      let app
      const load = () => (app ??= server.ssrLoadModule('/server/app.ts').then((m) => m.createApp()))
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') return // Vite HMR 소켓은 건드리지 않는다
        load().then(
          (a) => a.upgrade(req, socket, head),
          (err) => {
            console.error(err)
            socket.destroy()
          },
        )
      })
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/health') return next()
        load().then((a) => a.handle(req, res), next)
      })
    },
  }
}

/** 게임 공통 Vite 설정. base 는 상대경로(허브가 /<slug>/ 아래에서 서빙한다) */
export function defineGameConfig(overrides = {}) {
  const { plugins = [], ...rest } = overrides
  return defineConfig({
    base: './',
    plugins: [react(), tailwindcss(), roomServer(), ...plugins],
    ...rest,
  })
}
