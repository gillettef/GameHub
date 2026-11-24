// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬·테스트)은 serve.mjs.
// rooms.mjs 는 dist/engine 을 불러오므로 dist 가 있어야 한다(CI 가 빌드해 함께 올린다).
import { fileURLToPath } from 'node:url';
import { handleApi, shutdown } from './api.mjs';

export async function mount() {
  return {
    staticRoot: fileURLToPath(new URL('../../dist', import.meta.url)),
    async handle(req, res) {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) return false;
      await handleApi(req, res, url);
      return true;
    },
    close: shutdown,
  };
}
