// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬·예전 systemd)은 serve.mjs.
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

export async function mount() {
  const root = fileURLToPath(new URL('../../dist', import.meta.url));
  const app = await createApp({ root });
  // dist/src 는 브라우저가 쓰는 엔진이 있어 막지 않는다. 같은 폴더의 서버 방 로직(rooms.js)도 공개되지만 비밀 값은 없다
  return { staticRoot: root, handle: app.handle, close: app.close };
}
