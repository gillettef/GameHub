/**
 * 다른 네트워크(LTE 등)의 휴대폰에서 테스트하기 위한 임시 공개 주소.
 *   npm run share            # 빌드 → 게임 서버(정적 + 온라인 대전 WebSocket) → Cloudflare 퀵 터널
 *   npm run share -- --no-build
 * 계정 없이 https://<무작위>.trycloudflare.com 주소가 생기며, 이 명령을 끄면 주소도 사라진다.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Tunnel, bin, install } from 'cloudflared';
import qrcode from 'qrcode-terminal';

const PORT = 4173;
const skipBuild = process.argv.includes('--no-build');

if (!skipBuild) execSync('npm run build', { stdio: 'inherit' });

const server = spawn(process.execPath, ['scripts/aws/serve.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: String(PORT) } });
await new Promise((r) => setTimeout(r, 800));
console.log(`로컬 서버: http://127.0.0.1:${PORT}`);

if (!existsSync(bin)) {
  console.log('cloudflared 바이너리 설치 중...');
  await install(bin);
}

const tunnel = Tunnel.quick(`http://127.0.0.1:${PORT}`);
const url = await new Promise((resolve, reject) => {
  tunnel.once('url', resolve);
  tunnel.once('error', reject);
  tunnel.once('exit', (code) => reject(new Error(`cloudflared 종료 (code ${code})`)));
});

console.log(`\n📱 외부 접속 주소: ${url}\n   (연결이 안정되기까지 몇 초 걸릴 수 있습니다. Ctrl+C로 종료)\n`);
qrcode.generate(url, { small: true });

const shutdown = () => {
  tunnel.stop();
  server.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
