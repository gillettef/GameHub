// 의존성 없는 빌드: src/web → dist/, src/engine → dist/engine/, src/server → dist/server/
// 서버(scripts/aws/serve.mjs)는 dist/server/rooms.mjs 를 불러 /api 를 처리한다.
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(`${root}src/web`, dist, { recursive: true });
await cp(`${root}src/engine`, `${dist}/engine`, { recursive: true });
await cp(`${root}src/server`, `${dist}/server`, { recursive: true });
// 브라우저 캐시 무효화를 위해 index.html 의 자산 경로에 빌드 시각을 붙인다
const stamp = Date.now().toString(36);
const indexPath = `${dist}/index.html`;
const html = (await readFile(indexPath, 'utf8')).replaceAll('__BUILD__', stamp);
await writeFile(indexPath, html);
await writeFile(`${dist}/server/package.json`, JSON.stringify({ type: 'module' }));
await writeFile(`${dist}/engine/package.json`, JSON.stringify({ type: 'module' }));
console.log('build ok →', dist);
