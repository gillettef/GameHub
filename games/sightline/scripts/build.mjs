// 빌드: web/ 과 src/engine/ 을 dist/ 로 복사한다. 번들러 없이 ES 모듈을 그대로 쓴다.
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'web'), dist, { recursive: true });
await cp(join(root, 'src', 'engine'), join(dist, 'engine'), { recursive: true });
await cp(join(root, 'rules', 'rulebook.md'), join(dist, 'rulebook.md'));
// 캐시 무효화용 빌드 번호
const stamp = Date.now().toString(36);
const html = join(dist, 'index.html');
await writeFile(html, (await readFile(html, 'utf8')).replaceAll('__BUILD__', stamp));
console.log('build ok', stamp);
