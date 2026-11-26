import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const ART = fileURLToPath(new URL('../../art', import.meta.url));
const [out, w, ...names] = process.argv.slice(2);
const html = `<html><body style="margin:0;background:#fff;display:flex;flex-wrap:wrap;gap:8px;padding:8px">${names
  .map((n) => `<div style="width:${w}px">${readFileSync(`${ART}/${n}.svg`, 'utf8')}</div>`)
  .join('')}</body></html>`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
