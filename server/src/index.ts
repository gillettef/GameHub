import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const SWEEP_MS = 30 * 60 * 1000;

const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 300);

// 배포 모드: 빌드된 클라이언트(client/dist)가 있으면 같은 프로세스가 프론트도 서빙한다.
// STATIC_DIR 로 다른 위치를 지정할 수 있고, 개발 중(Vite 가 따로 뜸)에는 dist 가 없어도 상관없다.
const STATIC_DIR = process.env.STATIC_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
const staticDir = existsSync(STATIC_DIR) ? STATIC_DIR : undefined;

const { server, rooms } = createApp(undefined, { botDelayMs: BOT_DELAY_MS, staticDir });
setInterval(() => rooms.sweep(), SWEEP_MS).unref();

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT} (ws: /ws)${staticDir ? ` static=${staticDir}` : ' (no static dir; Vite dev server serves the client)'}`);
});
