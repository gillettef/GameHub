import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** dist/의 모든 파일을 서비스 워커 프리캐시 목록에 넣고, 내용 해시로 캐시 이름을 정한다. */
function swManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sw-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
          d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
        );
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);

      const swPath = join(outDir, 'sw.js');
      const src = readFileSync(swPath, 'utf8');
      const out = src
        .replace(/^const CACHE = .*$/m, `const CACHE = 'election-mancala-${version}';`)
        .replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};`);
      if (out === src) throw new Error('sw.js에서 CACHE/PRECACHE 줄을 찾지 못했습니다');
      writeFileSync(swPath, out);
    },
  };
}

/** 로컬 온라인 대결 서버(npm run dev:server, server/index.ts) — 운영에서는 같은 서버가 dist 도 서빙한다 */
const apiProxy = { '/api': { target: 'http://localhost:38637', ws: true } };

export default defineConfig({
  base: './',
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: { target: 'es2022' },
  worker: { format: 'es' },
  plugins: [swManifest()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
