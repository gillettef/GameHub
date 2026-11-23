// EC2 systemd(proxymind) 진입점. 실제 서버(정적 dist + 온라인 대전 WebSocket /ws)는
// npm run build 가 prototype/server/index.ts 를 묶은 server-dist/server.cjs 이다 (의존성 설치 없이 실행).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

process.env.DIST_DIR ??= fileURLToPath(new URL('../../dist', import.meta.url));
createRequire(import.meta.url)('../../server-dist/server.cjs');
