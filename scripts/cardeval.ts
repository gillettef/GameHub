/**
 * 시설 카드 한계 가치 측정 (AI와 무관).
 * 같은 공원·같은 관객에서 "이 시설이 있을 때 vs 빈 부지"를 짝지어 비교한다.
 *   npx tsx scripts/cardeval.ts [--base 3] [--visitors 3] [--trials 600] [--lambda 3] [--set satPerVp=6]
 * Δ$ = 라운드당 순수익 변화(유지비·예상 수리/청소비 포함), ΔVP = 라운드당 만족도→VP 변화.
 * 가치 = Δ$ + λ·ΔVP, 회수 = 건설비 ÷ 가치(라운드). 회수가 짧을수록 효율적.
 */
import { CFG, drawVisitor, newGame, operatePlayer } from '../src/game/engine';
import { FACILITIES } from '../src/game/data/facilities';
import type { StaffKey } from '../src/game/types';

const a = process.argv.slice(2);
const opt = (k: string, d: string) => (a.indexOf('--' + k) >= 0 ? a[a.indexOf('--' + k) + 1] : d);
for (const kv of opt('set', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (k in CFG.hireCosts) CFG.hireCosts[k as StaffKey] = v.split('/').map(Number);
  else (CFG as unknown as Record<string, number>)[k] = Number(v);
}
const BASE = Number(opt('base', '3'));
const VIS = Number(opt('visitors', '3'));
const T = Number(opt('trials', '600'));
const LAMBDA = Number(opt('lambda', '3'));

const s = newGame({ aiCount: 1, seed: 1 }); // 사람 대기 상태의 빈 상태를 빌려 쓴다
s.event = { id: 0, name: '평범한 날', desc: '', icon: 'sun' };
const p = s.players[0];

function round(base: number[], extra: number | null, seed: number) {
  p.facilities = Array(CFG.slots).fill(null);
  base.forEach((id, i) => (p.facilities[i] = { id, broken: false }));
  if (extra !== null) p.facilities[base.length] = { id: extra, broken: false };
  p.staff = { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 };
  p.money = 100;
  p.vp = 0;
  p.satPool = 0;
  p.trash = 0;
  p.fee = 2;
  s.rng = seed;
  p.visitors = Array.from({ length: VIS }, () => drawVisitor(s));
  s.rng = seed + 1;
  const r = operatePlayer(s, p);
  const net = r.feeIncome + r.income - r.upkeep - r.broken.length * CFG.repairCost - r.trashAdded * CFG.cleanCost;
  return { net, vp: r.sat / CFG.satPerVp };
}

const ids = FACILITIES.map((c) => c.id);
const rows = FACILITIES.map((c) => {
  let dn = 0;
  let dv = 0;
  for (let t = 0; t < T; t++) {
    const seed = t * 977 + 13;
    // 기준 공원: 결정적 의사난수로 c를 제외한 BASE장
    const pool = ids.filter((x) => x !== c.id);
    const base: number[] = [];
    let z = seed;
    while (base.length < BASE) {
      z = (z * 1664525 + 1013904223) >>> 0;
      const pick = pool[z % pool.length];
      if (!base.includes(pick)) base.push(pick);
    }
    const w = round(base, c.id, seed);
    const o = round(base, null, seed);
    dn += w.net - o.net;
    dv += w.vp - o.vp;
  }
  dn /= T;
  dv /= T;
  const value = dn + LAMBDA * dv;
  return { c, dn, dv, value, payback: value > 0 ? c.cost / value : 99 };
});

const vals = rows.map((r) => r.value / Math.max(1, r.c.cost));
const m = vals.reduce((x, y) => x + y, 0) / vals.length;
const sd = Math.sqrt(vals.reduce((x, y) => x + (y - m) ** 2, 0) / vals.length);
console.log(`# 시설 한계 가치 (기준 공원 ${BASE}곳 · 관객 ${VIS}명 · 입장료 $2 · λ=${LAMBDA} · satPerVp=${CFG.satPerVp})`);
{
  // 비용 구간별 평균 가치/회수
  const tiers: [string, (c: number) => boolean][] = [['비용 1-2', (c) => c <= 2], ['비용 3-4', (c) => c >= 3 && c <= 4], ['비용 5-6', (c) => c >= 5 && c <= 6], ['비용 7+', (c) => c >= 7]];
  console.log(tiers.map(([n, f]) => { const r = rows.filter((x) => f(x.c.cost)); return `${n}: 가치/R ${(r.reduce((s2, x) => s2 + x.value, 0) / r.length).toFixed(2)} 회수 ${(r.reduce((s2, x) => s2 + x.c.cost / Math.max(0.1, x.value), 0) / r.length).toFixed(1)}R`; }).join(' | '));
  const cs = rows.map((r) => r.c.cost);
  const vs2 = rows.map((r) => r.value);
  const mc = cs.reduce((x, y) => x + y, 0) / cs.length, mv = vs2.reduce((x, y) => x + y, 0) / vs2.length;
  const cov = cs.reduce((acc, c, i) => acc + (c - mc) * (vs2[i] - mv), 0);
  const corr = cov / Math.sqrt(cs.reduce((x, c) => x + (c - mc) ** 2, 0) * vs2.reduce((x, v) => x + (v - mv) ** 2, 0));
  console.log(`비용-가치 상관계수 ${corr.toFixed(2)} (양수·높을수록 비싼 시설이 실제로 더 가치 있음)`);
}
console.log('id 시설명        유형    비용 유지 |  Δ$/R   ΔVP/R  가치/R | 회수(R)  효율z');
for (const r of [...rows].sort((x, y) => y.value / y.c.cost - x.value / x.c.cost)) {
  const z = (r.value / Math.max(1, r.c.cost) - m) / sd;
  const flag = z > 1.5 ? ' ▲과강' : z < -1.5 ? ' ▼과약' : '';
  console.log(
    `${String(r.c.id).padStart(2)} ${r.c.name.padEnd(10, '　')} ${r.c.type.padEnd(5, '　')} ${String(r.c.cost).padStart(3)} ${String(r.c.upkeep).padStart(3)} | ${r.dn.toFixed(2).padStart(5)} ${r.dv.toFixed(2).padStart(6)} ${r.value.toFixed(2).padStart(7)} | ${r.payback >= 99 ? '  -' : r.payback.toFixed(1).padStart(5)}  ${z.toFixed(1).padStart(5)}${flag}`,
  );
}
