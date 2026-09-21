// 카드 넘침 점검: Vite 로 client/card-audit.html 을 띄우고 헤드리스 브라우저(Edge/Chrome)로 열어 결과(JSON)를 읽어 출력한다.
// 사용: node scripts/card-audit.mjs [mobile] [only=sponsor] [shot.png] — 카드 밖으로 나가거나 잘리는 것이 있으면 종료 코드 1 (말줄임은 참고용)
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

// 동기 실행(execFileSync)은 같은 프로세스의 Vite 서버까지 멈춰 세우므로 쓰지 않는다
const run = promisify(execFile);
const clientDir = fileURLToPath(new URL('../client', import.meta.url));
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);
if (!browser) throw new Error('Edge/Chrome 을 찾지 못했습니다');

const mobile = process.argv.includes('mobile');
const shot = process.argv.find((a) => a.endsWith('.png'));
const server = await createServer({ root: clientDir, configFile: `${clientDir}/vite.config.ts`, server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const only = process.argv.find((a) => a.startsWith('only='));
const url = `http://localhost:${server.config.server.port}/card-audit.html?${[mobile && 'mobile', only].filter(Boolean).join('&')}`;
try {
  const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=20000'];
  // 첫 요청은 Vite 가 모듈을 변환하느라 늦어 빈 페이지가 찍힐 수 있어 몇 번 다시 시도한다
  let m = null;
  for (let attempt = 0; attempt < 4 && !m?.[1]; attempt++) {
    const { stdout: dom } = await run(browser, [...common, '--window-size=1500,1000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 120000 });
    m = dom.match(/<pre id="audit"[^>]*>([\s\S]*?)<\/pre>/);
  }
  if (!m?.[1]) throw new Error('점검 결과를 읽지 못했습니다 (페이지가 그려지지 않음)');
  if (shot) await run(browser, [...common, `--window-size=1500,${only ? 2600 : 12000}`, `--screenshot=${shot}`, url], { timeout: 120000 });
  const findings = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  const hard = findings.filter((f) => f.kind !== 'clamped');
  for (const f of findings) console.log(`${f.kind.padEnd(8)} ${f.card} — ${f.where} (+${f.by}px)`);
  console.log(`\n${mobile ? '모바일용' : 'PC용'}: 카드 밖/잘림 ${hard.length}건, 말줄임 ${findings.length - hard.length}건`);
  process.exitCode = hard.length > 0 ? 1 : 0;
} finally {
  await server.close();
}
