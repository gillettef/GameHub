// 의존성 없는 빌드: 웹 파일과 엔진을 dist/ 로 복사하고, 룰북을 모바일용 HTML 로 변환한다.
// (scripts/aws/serve.mjs 가 dist 를 서빙하고 dist/src/rooms.js 로 온라인 방을 연다)
import { rmSync, mkdirSync, cpSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { markdownToHtml } from './md.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
rmSync(dist, { recursive: true, force: true });
mkdirSync(`${dist}/src`, { recursive: true });
cpSync(`${root}prototype/web`, dist, { recursive: true });
for (const f of ['cards.js', 'engine.js', 'bots.js', 'view.js', 'rooms.js']) {
  copyFileSync(`${root}prototype/src/${f}`, `${dist}/src/${f}`);
}

// 룰북: 원문(txt)과 읽기용 HTML
const md = readFileSync(`${root}rules/rulebook.md`, 'utf8');
copyFileSync(`${root}rules/rulebook.md`, `${dist}/rulebook.txt`);
const { html, toc } = markdownToHtml(md);
const page = readFileSync(`${root}prototype/web-rulebook.html`, 'utf8')
  .replace('<!--TOC-->', toc.map((t) => `<a href="#${t.id}">${t.text.replace(/</g, '&lt;')}</a>`).join(''))
  .replace('<!--BODY-->', html);
writeFileSync(`${dist}/rulebook.html`, page);
console.log('빌드 완료: dist/');
