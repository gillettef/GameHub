/**
 * AI 성향 자가대전 최적화(좌표 탐색). 기준 AI(balanced)와 3인전을 반복해 후보의 승률을 올린다.
 *   npx tsx scripts/tune-ai.ts [--set satPerVp=6,...] [--iters 40] [--target balanced]
 */
import { AI_PROFILES, CFG, newGame, rankings, type AiProfile } from '../src/game/engine';
import type { StaffKey } from '../src/game/types';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.indexOf('--' + k) >= 0 ? args[args.indexOf('--' + k) + 1] : d);
for (const kv of opt('set', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (k in CFG.hireCosts) CFG.hireCosts[k as StaffKey] = v.split('/').map(Number);
  else (CFG as unknown as Record<string, number>)[k] = Number(v);
}
const ITERS = Number(opt('iters', '40'));
const G = 500;
const baseline: AiProfile = JSON.parse(JSON.stringify(AI_PROFILES[opt('target', 'balanced')]));
AI_PROFILES.ref = baseline;

type Vec = { buyScale: number; buyMin: number; hm: number; hg: number; he: number; hc: number; hr: number; hireRatio: number; reserve: number };
const toProfile = (v: Vec): AiProfile => ({
  label: 'cand', buyScale: v.buyScale, buyMin: v.buyMin, hire: { marketer: v.hm, guide: v.hg, engineer: v.he, cleaner: v.hc, researcher: v.hr }, hireRatio: v.hireRatio, reserve: v.reserve,
});
let cur: Vec = { buyScale: baseline.buyScale, buyMin: baseline.buyMin, hm: baseline.hire.marketer, hg: baseline.hire.guide, he: baseline.hire.engineer, hc: baseline.hire.cleaner, hr: baseline.hire.researcher, hireRatio: baseline.hireRatio, reserve: baseline.reserve };

function winRate(v: Vec): number {
  AI_PROFILES.cand = toProfile(v);
  let w = 0;
  for (let i = 0; i < G; i++) {
    const seat = i % 3; // 후보의 좌석 회전
    const profiles = ['ref', 'ref', 'ref'];
    profiles[seat] = 'cand';
    const s = newGame({ humans: 0, aiCount: 3, seed: i * 7717 + 5, profiles });
    if (rankings(s)[0].id === seat) w++;
  }
  return w / G;
}

let best = winRate(cur);
console.log(`시작 승률 ${(best * 100).toFixed(1)}% (기대 33.3%) — 후보=기준과 동일`);
const keys = Object.keys(cur) as (keyof Vec)[];
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let it = 0; it < ITERS; it++) {
  const k = keys[Math.floor(rnd() * keys.length)];
  const factor = rnd() < 0.5 ? 0.6 : 1.5;
  const cand = { ...cur, [k]: k === 'buyMin' || k === 'reserve' ? Math.max(0, Math.round((cur[k] + (rnd() < 0.5 ? -1.5 : 1.5)) * 2) / 2) : +(cur[k] * factor).toFixed(2) };
  const r = winRate(cand);
  if (r > best + 0.015) {
    best = r;
    cur = cand;
    console.log(`it${it} ${k} → ${cand[k]}  승률 ${(r * 100).toFixed(1)}%`);
  }
}
console.log('\n최종 후보:', JSON.stringify(cur), `승률 ${(best * 100).toFixed(1)}%`);
