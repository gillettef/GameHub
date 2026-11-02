// 서버를 server-dist/server.cjs 한 파일로 번들한다(ws 포함 — 운영 서버에 npm install 불필요)
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'server-dist/server.cjs',
  logLevel: 'info',
});
