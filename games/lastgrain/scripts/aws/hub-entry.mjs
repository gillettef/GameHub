// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬·예전 systemd)은 serve.mjs.
// serve.mjs 를 import 해도 서버는 뜨지 않는다(직접 실행할 때만 listen).
import { fileURLToPath } from 'node:url';
import { createApp } from './serve.mjs';

export async function mount() {
  const app = await createApp();
  return { staticRoot: fileURLToPath(new URL('../../dist', import.meta.url)), handle: app.handle, close: app.close };
}
