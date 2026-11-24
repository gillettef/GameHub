// 웹 시뮬레이터 빌드: prototype/(index.html, style.css, src/) 와 제출용 규칙서를 dist/ 로 복사한다. 의존성 없음.
import { cp, mkdir, rm, copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const f of ['index.html', 'style.css', 'favicon.svg', 'manifest.webmanifest', 'apple-touch-icon.png']) await copyFile(join(ROOT, 'prototype', f), join(DIST, f));
await cp(join(ROOT, 'prototype', 'src'), join(DIST, 'src'), { recursive: true });
const rules = join(ROOT, 'submission', 'LASTGRAIN_규칙서.html');
try { await access(rules); await copyFile(rules, join(DIST, 'rules.html')); } catch { console.warn('규칙서 HTML이 없어 rules.html을 건너뜀'); }
console.log('dist 빌드 완료');
