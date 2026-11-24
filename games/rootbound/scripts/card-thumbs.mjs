// 식물 카드 SVG 에서 그림 부분(가로 24~606, 세로 150~470)만 잘라 작은 카드 배경용 WebP 썸네일을 만든다.
// 손패·마켓·카드 탭은 이 썸네일을, 확대 모달만 원본 SVG 를 쓴다(필터가 든 원본을 작은 카드마다 래스터화하지 않으려고).
// 사용: node scripts/card-thumbs.mjs   (카드 SVG 를 바꾸면 다시 돌린다. Chrome 이 필요하다: CHROME=<경로>)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plantsDir = join(root, 'client/public/cards/plants');
const outDir = join(plantsDir, 'art');
const CROP = { x: 24, y: 150, width: 582, height: 320 }; // 좌우 테두리 선과 위 이름·아래 뿌리 그림을 뺀 그림 부분
const chromePath = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--allow-file-access-from-files', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'card-thumbs-'))}`, 'about:blank'], { stdio: 'ignore' });
try {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
    if (!page) await sleep(200);
  }
  if (!page) throw new Error('Chrome 디버깅 포트에 붙지 못했습니다');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) pending.get(d.id)(d.result), pending.delete(d.id);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 630, height: 880, deviceScaleFactor: 1, mobile: false });

  mkdirSync(outDir, { recursive: true });
  const ids = readdirSync(plantsDir).filter((f) => f.endsWith('.svg') && f !== 'back.svg').map((f) => f.slice(0, -4));
  for (const sp of ids) {
    await send('Page.navigate', { url: pathToFileURL(join(plantsDir, `${sp}.svg`)).href });
    await sleep(800);
    const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 80, clip: { ...CROP, scale: 1 } });
    writeFileSync(join(outDir, `${sp}.webp`), Buffer.from(shot.data, 'base64'));
    console.log(`art/${sp}.webp`);
  }
  ws.close();
} finally {
  chrome.kill();
}
process.exit(0);
