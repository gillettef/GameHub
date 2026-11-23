// 의존성 없는 빌드: 웹 파일과 엔진을 dist/ 로 복사한다. (scripts/aws/serve.mjs 가 dist 를 서빙)
import { rmSync, mkdirSync, cpSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
rmSync(dist, { recursive: true, force: true });
mkdirSync(`${dist}/src`, { recursive: true });
cpSync(`${root}prototype/web`, dist, { recursive: true });
for (const f of ['cards.js', 'engine.js', 'bots.js']) copyFileSync(`${root}prototype/src/${f}`, `${dist}/src/${f}`);
copyFileSync(`${root}rules/rulebook.md`, `${dist}/rulebook.txt`);
console.log('빌드 완료: dist/');
