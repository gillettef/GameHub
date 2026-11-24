// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 서버 기능이 없는 클라이언트 전용 게임이라
// 정적 파일(dist)만 허브에 맡긴다. 단독 실행(로컬·예전 systemd)은 serve.mjs 가 그대로 맡는다.
import { fileURLToPath } from 'node:url';

export async function mount() {
  return { staticRoot: fileURLToPath(new URL('../../dist', import.meta.url)) };
}
