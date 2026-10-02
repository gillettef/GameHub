/**
 * 경제/VP 규모 스윕: 설정 조합마다 핵심 지표 한 줄 요약.
 *   npx tsx scripts/econ.ts "incomeDiv=2" "incomeDiv=3,satPerVp=6" ...   (인자 하나가 한 설정)
 */
import { AI_PROFILES, CFG, newGame, probe, rankings } from '../src/game/engine';
import type { StaffKey } from '../src/game/types';

const N = 700;
const base = JSON.stringify({ ...CFG, hireCosts: CFG.hireCosts, roundsByPlayers: CFG.roundsByPlayers });
const apply = (set: string) => {
  Object.assign(CFG, JSON.parse(base));
  CFG.hireCost = (k: StaffKey, l: number) => CFG.hireCosts[k][l] ?? 99;
  for (const kv of set.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (k in CFG.hireCosts) CFG.hireCosts[k as StaffKey] = v.split('/').map(Number);
    else (CFG as unknown as Record<string, number>)[k] = Number(v);
  }
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
let seed = 99;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const names = ['balanced', 'builder', 'staff', 'audience', 'frugal'];

console.log('설정 | VP평균(σ) | 잔액 | 적자게임 | 건설/인 R1-4 · R5-8 | 눈덩이R4 | 전략승률(3인) 균형/건설/인력/관객/절약 | 4인좌석RMS');
for (const set of process.argv.slice(2)) {
  apply(set);
  // 3인 거울: 경제 지표
  const vp: number[] = [];
  const money: number[] = [];
  let debtGames = 0;
  let gi = -1;
  const hit = new Set<number>();
  probe.debt = () => hit.add(gi);
  const builds: number[] = [];
  probe.buy = (_p, _i, _pr, r) => builds.push(r);
  let cur: number[][] = [];
  probe.roundEnd = (s) => cur.push(s.players.map((p) => p.vp));
  let snow = 0;
  for (let i = 0; i < N; i++) {
    gi = i;
    cur = [];
    const s = newGame({ humans: 0, aiCount: 3, seed: i * 17 + 9, profiles: ['balanced', 'balanced', 'balanced'] });
    vp.push(...s.players.map((p) => p.vp));
    money.push(...s.players.map((p) => p.money));
    const w = rankings(s)[0].id;
    const r4 = cur[3];
    if (r4) {
      const top = Math.max(...r4);
      const l = r4.map((v, id) => (v === top ? id : -1)).filter((x) => x >= 0);
      if (l.includes(w)) snow += 1 / l.length;
    }
  }
  debtGames = hit.size;
  probe.debt = probe.buy = probe.roundEnd = undefined;
  const R = CFG.rounds;
  const early = builds.filter((r) => r <= 4).length / (N * 3);
  const late = builds.filter((r) => r > 4 && r <= R).length / (N * 3);
  // 전략 라운드로빈 (3인)
  const win: Record<string, number> = {};
  const gm: Record<string, number> = {};
  names.forEach((k) => ((win[k] = 0), (gm[k] = 0)));
  for (let i = 0; i < N * 2; i++) {
    const pick = [...names].sort(() => rnd() - 0.5).slice(0, 3);
    const s = newGame({ humans: 0, aiCount: 3, seed: i * 104729 + 3, profiles: pick });
    pick.forEach((k) => gm[k]++);
    win[pick[rankings(s)[0].id]]++;
  }
  // 4인 좌석 RMS
  const w4 = [0, 0, 0, 0];
  for (let i = 0; i < N; i++) w4[rankings(newGame({ humans: 0, aiCount: 4, seed: i * 7919 + 1, profiles: Array(4).fill('balanced') }))[0].id]++;
  const rms = Math.sqrt(w4.reduce((a, x) => a + (x / N - 0.25) ** 2, 0) / 4) * 100;
  console.log(
    `${set || '(기본)'} | ${mean(vp).toFixed(1)}(${std(vp).toFixed(1)}) | $${mean(money).toFixed(1)} | ${((debtGames / N) * 100).toFixed(0)}% | ${early.toFixed(1)} · ${late.toFixed(1)} | ${((snow / N) * 100).toFixed(0)}% | ${names.map((k) => ((win[k] / gm[k]) * 100).toFixed(0)).join('/')} | ${rms.toFixed(1)}`,
  );
}
void AI_PROFILES;
