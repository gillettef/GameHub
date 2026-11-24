// 웹 시뮬레이터 빌드: prototype/web 과 prototype/src 를 dist/ 로 복사한다(의존성 없음).
import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const dist = fileURLToPath(new URL('dist', root));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(fileURLToPath(new URL('prototype/web', root)), dist, { recursive: true });
await cp(fileURLToPath(new URL('prototype/src', root)), `${dist}/src`, { recursive: true });
// 서버(Node)가 dist/src/*.js 를 ES 모듈로 읽도록 표시한다
await writeFile(`${dist}/src/package.json`, JSON.stringify({ type: 'module' }));
console.log('dist/ 빌드 완료');
