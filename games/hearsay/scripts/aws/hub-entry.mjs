// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬·예전 systemd)은 serve.mjs.
// /api/* 는 dist/server/rooms.mjs 가 처리하고, 정적 파일(dist)은 허브가 서빙한다. 서버 코드(server/, engine/)는 서빙하지 않는다.
import { fileURLToPath } from 'node:url';

export async function mount() {
  const { handleApi, shutdown } = await import(new URL('../../dist/server/rooms.mjs', import.meta.url));
  return {
    staticRoot: fileURLToPath(new URL('../../dist', import.meta.url)),
    staticDeny: ['server', 'engine'],
    handle: (req, res) => handleApi(req, res, new URL(req.url, 'http://x')),
    close: shutdown,
  };
}
