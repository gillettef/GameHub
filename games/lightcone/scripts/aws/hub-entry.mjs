// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬·예전 systemd)은 serve.mjs.
// /api/rooms/* 는 온라인 대전 방 서비스(rooms.mjs), 나머지는 허브가 dist 를 정적으로 서빙한다.
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRoomService } from './rooms.mjs';

export async function mount() {
  const root = fileURLToPath(new URL('../../dist', import.meta.url));
  const engine = await import(pathToFileURL(join(root, 'src', 'engine.js')).href);
  const roomService = createRoomService(engine);
  return {
    staticRoot: root,
    async handle(req, res) {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) return false;
      await roomService.handle(req, res, url);
      return true;
    },
  };
}
