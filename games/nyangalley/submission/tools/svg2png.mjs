/**
 * figures/*.svg → out/*.png (기획안 docx 에 넣을 그림). 시스템 Chrome 으로 그린다.
 *   node submission/tools/svg2png.mjs cover table3 [폭 px=2200]
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const FIG = join(HERE, '..', 'figures');
const OUT = join(HERE, '..', 'out');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const width = Number(args.find((a) => /^\d+$/.test(a)) ?? 2200);
const names = args.filter((a) => !/^\d+$/.test(a));
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width, height: 800 } });
for (const n of names) {
  const svg = readFileSync(join(FIG, `${n}.svg`), 'utf8').replace(/width="[\d.]+" height="[\d.]+"/, `width="${width}"`);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.waitForTimeout(300);
  const el = await page.$('svg');
  await el.screenshot({ path: join(OUT, `${n}.png`) });
  console.log('png', n);
}
await browser.close();
