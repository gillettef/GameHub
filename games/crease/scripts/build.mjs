// 웹 프로토타입 빌드: prototype/web 과 브라우저에서 쓰는 엔진 파일을 dist/ 로 복사한다 (의존성 없음)
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
if (existsSync('prototype/web')) cpSync('prototype/web', 'dist', { recursive: true });
for (const f of ['engine.js', 'bot.js', 'rules-config.js', 'sim.js']) cpSync(`prototype/${f}`, `dist/${f}`);
console.log('dist/ 빌드 완료');
