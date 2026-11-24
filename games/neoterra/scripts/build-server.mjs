// 서버를 server-dist/server.cjs 한 파일로 번들한다
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
