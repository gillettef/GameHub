// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc", scripts/aws/hub-entry.mjs 가 부른다).
// 단독 실행(로컬·예전 systemd)은 index.ts. 정적 파일(client/dist)은 허브가 서빙하고, 여기서는 API·WebSocket·방 정리만 맡는다.
import { createHandlers } from './app';

const SWEEP_MS = 30 * 60 * 1000;

export function mountEleven(options: { botDelayMs?: number; botWatchMs?: number } = {}) {
  const h = createHandlers(undefined, options);
  const sweep = setInterval(() => h.rooms.sweep(), SWEEP_MS);
  sweep.unref();
  return {
    handle: h.handle,
    upgrade: h.upgrade,
    close() {
      clearInterval(sweep);
      h.close();
    },
  };
}
