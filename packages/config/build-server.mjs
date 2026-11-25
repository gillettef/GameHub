#!/usr/bin/env node
// 게임 폴더에서 실행: server/app.ts 를 ws 까지 담은 server-dist/app.cjs 한 파일로 묶는다(운영 서버에서 설치하지 않는다).
import { build } from 'esbuild'

await build({
  entryPoints: ['server/app.ts'],
  outfile: 'server-dist/app.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
})
console.log('server-dist/app.cjs 빌드 완료')
