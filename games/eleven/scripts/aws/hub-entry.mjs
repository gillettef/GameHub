// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬·예전 systemd)은 server/dist/index.js.
// server/dist/hub.js 는 ws 를 번들하지 않으므로(--packages=external) ~/eleven/node_modules 에서 찾는다(deploy-remote.sh 가 설치).
import { fileURLToPath } from 'node:url';

const BOT_DELAY_MS = 800; // 봇 기본 간격 (index.ts 기본값과 같다)
const BOT_WATCH_MS = 24000; // 경기 재생 보기 시간

export async function mount() {
  const { mountEleven } = await import('../../server/dist/hub.js');
  const game = mountEleven({ botDelayMs: BOT_DELAY_MS, botWatchMs: BOT_WATCH_MS });
  return { staticRoot: fileURLToPath(new URL('../../client/dist', import.meta.url)), ...game };
}
