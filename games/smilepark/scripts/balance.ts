/**
 * 밸런스 측정 하네스 (v1).
 *   npx tsx scripts/balance.ts [--n 1000] [--exp mirror,profiles,cards,staff] [--set shopIncome=2,favBonus=3]
 * --set 은 CFG(engine.ts) 또는 PRINT(data/cards.ts) 키를 덮어쓴다. PRINT 를 바꾸면 카드 인쇄값을 다시 계산한다.
 */
import { AI_PROFILES, CFG, newGame, probe, rankings, winners } from '../src/engine/engine';
import { CARDS, CARD_BY_ID, PRINT, printCard } from '../src/engine/data/cards';
import { FACILITIES } from '../src/engine/data/facilities';
import type { GameState, StaffKey } from '../src/engine/types';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.indexOf('--' + k) >= 0 ? args[args.indexOf('--' + k) + 1] : d);
const N = Number(opt('n', '1000'));
const EXPS = opt('exp', 'mirror,profiles,cards,staff').split(',');
const SET = opt('set', '');
for (const kv of SET.split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (k === 'hireCosts') CFG.hireCosts = v.split('/').map(Number);
  else if (k === 'capTiers') PRINT.capTiers = v.split('/').map((x) => x.split(':').map(Number) as [number, number]); // 예: 7:4/3:3
  else if (k in PRINT) (PRINT as unknown as Record<string, number>)[k] = Number(v);
  else if (k in CFG) (CFG as unknown as Record<string, number>)[k] = Number(v);
  else throw new Error('알 수 없는 키 ' + k);
}
// PRINT 변경을 카드 인쇄값에 반영
FACILITIES.forEach((c, i) => {
  CARDS[i] = printCard(c);
  CARD_BY_ID[c.id] = CARDS[i];
});

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
const pct = (x: number) => (x * 100).toFixed(0).padStart(3) + '%';
const f1 = (x: number) => x.toFixed(1);
const play = (pl: number, profiles: string[], s0: number): GameState => newGame({ humans: 0, aiCount: pl, seed: s0, profiles });

console.log(`# 밸런스 리포트 (n=${N}${SET ? ', set ' + SET : ''})\n`);

if (EXPS.includes('mirror')) {
  console.log('## 거울 대전 (balanced ×N) — 좌석(1라운드 순서) 승률, 점수 규모');
  for (const pl of [2, 3, 4, 5]) {
    const wins = Array(pl).fill(0);
    const vps: number[] = [];
    const money: number[] = [];
    const gaps: number[] = [];
    for (let i = 0; i < N; i++) {
      const s = play(pl, Array(pl).fill('balanced'), i * 7919 + 1);
      const r = rankings(s);
      const w = winners(s);
      for (const p of w) wins[(p.id - s.startFirst + pl) % pl] += 1 / w.length;
      vps.push(...s.players.map((p) => p.vp));
      money.push(...s.players.map((p) => p.money));
      gaps.push(r[0].vp - r[1].vp);
    }
    const exp = 1 / pl;
    const worst = Math.max(...wins.map((w) => Math.abs(w / N - exp)));
    console.log(`${pl}인 | 평균 ${f1(mean(vps))} (σ${f1(std(vps))}) 잔액 $${f1(mean(money))} 1-2위 격차 ${f1(mean(gaps))} | 좌석 ${wins.map((w) => pct(w / N)).join(' ')} (최대편차 ${(worst * 100).toFixed(1)}%p)`);
  }
  console.log();
}

if (EXPS.includes('profiles')) {
  console.log('## 성향 혼합 3인전 — 성향별 승률 (기대 33%)');
  const names = Object.keys(AI_PROFILES);
  const games: Record<string, number> = {};
  const wonBy: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const prof = [0, 1, 2].map(() => names[Math.floor(rnd() * names.length)]);
    const s = play(3, prof, i * 104729 + 3);
    const w = winners(s);
    s.players.forEach((p) => (games[p.ai!] = (games[p.ai!] ?? 0) + 1));
    for (const p of w) wonBy[p.ai!] = (wonBy[p.ai!] ?? 0) + 1 / w.length;
  }
  for (const k of names) console.log(`${AI_PROFILES[k].label.padEnd(6)} ${pct((wonBy[k] ?? 0) / (games[k] || 1))} (${games[k] ?? 0}명)`);
  console.log();
}

if (EXPS.includes('cards') || EXPS.includes('staff')) {
  // 3인 거울 대전: 카드를 산 플레이어의 승률(기대 33%)과 구매 빈도
  const bought: Record<number, { n: number; win: number }> = {};
  const hires: Record<string, { n: number; win: number }> = {};
  let cur: Set<number>[] = [];
  let curHire: Set<string>[] = [];
  probe.buy = (p, id) => cur[p.id].add(id);
  probe.hire = (p, k: StaffKey) => curHire[p.id].add(k + p.staff[k]);
  for (let i = 0; i < N; i++) {
    cur = [new Set(), new Set(), new Set()];
    curHire = [new Set(), new Set(), new Set()];
    const s = play(3, ['balanced', 'balanced', 'balanced'], i * 31337 + 5);
    const w = new Set(winners(s).map((p) => p.id));
    s.players.forEach((p) => {
      for (const id of cur[p.id]) {
        const b = (bought[id] ??= { n: 0, win: 0 });
        b.n++;
        if (w.has(p.id)) b.win += 1 / w.size;
      }
      for (const k of curHire[p.id]) {
        const b = (hires[k] ??= { n: 0, win: 0 });
        b.n++;
        if (w.has(p.id)) b.win += 1 / w.size;
      }
    });
  }
  probe.buy = undefined;
  probe.hire = undefined;
  if (EXPS.includes('cards')) {
    console.log('## 카드별 구매율(판당)·구매자 승률 (3인 거울, 기대 33%)');
    const rows = CARDS.map((c) => ({ c, n: bought[c.id]?.n ?? 0, w: (bought[c.id]?.win ?? 0) / (bought[c.id]?.n || 1) }));
    const live = rows.filter((r) => r.n > N * 0.05);
    console.log(`구매된 카드 ${live.length}/${rows.length}장 · 구매자 승률 σ ${(std(live.map((r) => r.w)) * 100).toFixed(1)}%p`);
    if (!args.includes('--brief')) for (const r of rows.sort((a, b) => b.w - a.w)) {
      const c = r.c;
      const stat = c.kind === 'ride' ? `정원${c.cap} ${c.target === 'all' ? '모두' : c.target === 'child' ? '어린이' : '성인'}★${c.sat}` : c.kind === 'shop' ? `그룹당$${c.income}` : '부대';
      console.log(`${String(c.id).padStart(2)} ${c.name.padEnd(10)} $${c.cost} 유지${c.upkeep} ${stat.padEnd(12)} | 구매 ${f1(r.n / N)} 승률 ${pct(r.w)}`);
    }
    console.log();
  }
  if (EXPS.includes('staff')) {
    console.log('## 인력 레벨별 고용률(판당)·고용자 승률');
    for (const [k, v] of Object.entries(hires).sort()) console.log(`${k.padEnd(12)} 고용 ${f1(v.n / N)} 승률 ${pct(v.win / v.n)}`);
  }
}
