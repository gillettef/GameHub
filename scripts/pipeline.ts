/**
 * 설정 1개당: ① 기준 AI를 자가대전으로 재최적화 → ② 핵심 지표 측정. (설정마다 AI를 새로 맞춰야 비교가 공정)
 *   npx tsx scripts/pipeline.ts "baseVisitors=3" "baseVisitors=3,slots=7" ...
 */
import { AI_PROFILES, CFG, newGame, probe, rankings, type AiProfile } from '../src/game/engine';
import type { StaffKey } from '../src/game/types';

const ITERS = 60;
const G = 400; // 최적화 평가 판 수
const N = 800; // 지표 측정 판 수
const base = JSON.stringify({ ...CFG, roundsByPlayers: CFG.roundsByPlayers, hireCosts: CFG.hireCosts });
const baseAi = JSON.stringify(AI_PROFILES.balanced);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

function applySet(set: string) {
  Object.assign(CFG, JSON.parse(base));
  CFG.hireCost = (k: StaffKey, l: number) => CFG.hireCosts[k][l] ?? 99;
  for (const kv of set.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (k in CFG.hireCosts) CFG.hireCosts[k as StaffKey] = v.split('/').map(Number);
    else (CFG as unknown as Record<string, number>)[k] = Number(v);
  }
  AI_PROFILES.balanced = JSON.parse(baseAi);
}

type Vec = { buyScale: number; buyMin: number; hm: number; hg: number; he: number; hc: number; hr: number; hireRatio: number; reserve: number };
const toP = (v: Vec): AiProfile => ({ label: 'c', buyScale: v.buyScale, buyMin: v.buyMin, hire: { marketer: v.hm, guide: v.hg, engineer: v.he, cleaner: v.hc, researcher: v.hr }, hireRatio: v.hireRatio, reserve: v.reserve });
const toV = (p: AiProfile): Vec => ({ buyScale: p.buyScale, buyMin: p.buyMin, hm: p.hire.marketer, hg: p.hire.guide, he: p.hire.engineer, hc: p.hire.cleaner, hr: p.hire.researcher, hireRatio: p.hireRatio, reserve: p.reserve });

function optimizeAi() {
  AI_PROFILES.ref = JSON.parse(JSON.stringify(AI_PROFILES.balanced));
  let cur = toV(AI_PROFILES.ref);
  const win = (v: Vec) => {
    AI_PROFILES.cand = toP(v);
    let w = 0;
    for (let i = 0; i < G; i++) {
      const seat = i % 3;
      const pr = ['ref', 'ref', 'ref'];
      pr[seat] = 'cand';
      if (rankings(newGame({ humans: 0, aiCount: 3, seed: i * 7717 + 5, profiles: pr }))[0].id === seat) w++;
    }
    return w / G;
  };
  let best = win(cur);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const keys = Object.keys(cur) as (keyof Vec)[];
  for (let round = 0; round < 3; round++) {
    let improved = false;
    for (let it = 0; it < ITERS; it++) {
      const k = keys[Math.floor(rnd() * keys.length)];
      const nv = k === 'buyMin' || k === 'reserve' ? Math.max(0, cur[k] + (rnd() < 0.5 ? -1.5 : 1.5)) : +(cur[k] * (rnd() < 0.5 ? 0.6 : 1.6)).toFixed(2);
      const cand = { ...cur, [k]: nv };
      const r = win(cand);
      if (r > best + 0.02) {
        best = r;
        cur = cand;
        improved = true;
      }
    }
    // 개선된 값을 새 기준으로 삼아 반복 (자가대전 수렴)
    AI_PROFILES.ref = toP(cur);
    best = win(cur);
    if (!improved) break;
  }
  AI_PROFILES.balanced = { ...toP(cur), label: '균형' };
  return cur;
}

function measure() {
  const res: Record<string, string> = {};
  // 좌석(1라운드 순서) 편차 3·4인
  const rms: number[] = [];
  for (const pl of [2, 3, 4]) {
    const w = Array(pl).fill(0);
    for (let i = 0; i < N; i++) {
      const s = newGame({ humans: 0, aiCount: pl, seed: i * 7919 + 1, profiles: Array(pl).fill('balanced') });
      w[(rankings(s)[0].id - s.startFirst + pl) % pl]++;
    }
    rms.push(Math.sqrt(w.reduce((a, x) => a + (x / N - 1 / pl) ** 2, 0) / pl) * 100);
  }
  res.seat = rms.map((x) => x.toFixed(1)).join('/');
  // 경제 (3인)
  const vp: number[] = [];
  const money: number[] = [];
  const fac: number[] = [];
  const buys: number[] = [];
  const staff: number[] = [];
  let snow = 0;
  let cur: number[][] = [];
  probe.roundEnd = (s) => cur.push(s.players.map((p) => p.vp));
  probe.buy = (_p, _i, _pr, r) => buys.push(r);
  for (let i = 0; i < N; i++) {
    cur = [];
    const s = newGame({ humans: 0, aiCount: 3, seed: i * 17 + 9, profiles: ['balanced', 'balanced', 'balanced'] });
    vp.push(...s.players.map((p) => p.vp));
    money.push(...s.players.map((p) => p.money));
    fac.push(...s.players.map((p) => p.facilities.filter(Boolean).length));
    staff.push(...s.players.map((p) => Object.values(p.staff).reduce((a, b) => a + b, 0)));
    const w = rankings(s)[0].id;
    const r4 = cur[3];
    const top = Math.max(...r4);
    const l = r4.map((v, id) => (v === top ? id : -1)).filter((x) => x >= 0);
    if (l.includes(w)) snow += 1 / l.length;
  }
  probe.roundEnd = probe.buy = undefined;
  res.vp = `${mean(vp).toFixed(0)}`;
  res.money = `$${mean(money).toFixed(0)}`;
  res.fac = `${mean(fac).toFixed(1)}`;
  res.staff = `${mean(staff).toFixed(1)}`;
  res.late = `${(buys.filter((r) => r > 4).length / (N * 3)).toFixed(1)}`;
  res.snow = `${((snow / N) * 100).toFixed(0)}%`;
  // 전략 변형
  const b = AI_PROFILES.balanced;
  const sc = (x: number) => ({ marketer: b.hire.marketer * x, guide: b.hire.guide * x, engineer: b.hire.engineer * x, cleaner: b.hire.cleaner * x, researcher: b.hire.researcher * x });
  const V: Record<string, AiProfile> = {
    '건설+': { ...b, buyScale: b.buyScale * 1.5, buyMin: Math.max(0, b.buyMin - 2.5) },
    '건설-': { ...b, buyScale: b.buyScale * 0.6, buyMin: b.buyMin + 3 },
    '인력+': { ...b, hire: sc(1.8), hireRatio: b.hireRatio * 0.6 },
    '인력-': { ...b, hire: sc(0.4), hireRatio: b.hireRatio * 2 },
    '마케팅': { ...b, hire: { ...b.hire, marketer: 20 } },
  };
  const out: string[] = [];
  for (const [name, prof] of Object.entries(V)) {
    AI_PROFILES.var = prof;
    let w = 0;
    const M = 600;
    for (let i = 0; i < M; i++) {
      const seat = i % 3;
      const pr = ['balanced', 'balanced', 'balanced'];
      pr[seat] = 'var';
      if (rankings(newGame({ humans: 0, aiCount: 3, seed: i * 7717 + 5, profiles: pr }))[0].id === seat) w++;
    }
    out.push(`${name}${((w / M) * 100).toFixed(0)}`);
  }
  res.variants = out.join(' ');
  // 인력 가치 (균형 vs 균형+해당 인력)
  const st: string[] = [];
  for (const k of ['marketer', 'guide', 'engineer', 'cleaner', 'researcher'] as StaffKey[]) {
    AI_PROFILES['b_' + k] = { ...AI_PROFILES.balanced, force: { [k]: 2 } };
    let w = 0;
    const M = 500;
    for (let i = 0; i < M; i++) {
      const order = i % 2 === 0 ? ['b_' + k, 'balanced'] : ['balanced', 'b_' + k];
      if (rankings(newGame({ humans: 0, aiCount: 2, seed: i * 613 + 11, profiles: order }))[0].id === order.indexOf('b_' + k)) w++;
    }
    st.push(`${k[0]}${((w / M) * 100).toFixed(0)}`);
  }
  res.staffPar = st.join(' ');
  return res;
}

console.log('설정 | 좌석RMS 2/3/4인 | VP | 잔액 | 시설 | 인력Lv | 후반건설 | 눈덩이R4 | 인력 가치(m g e c r) | 전략변형 승률(3인, 기대33)');
for (const set of process.argv.slice(2)) {
  applySet(set);
  const v = optimizeAi();
  const r = measure();
  console.log(`${set || '(기본)'} | ${r.seat} | ${r.vp} | ${r.money} | ${r.fac} | ${r.staff} | ${r.late} | ${r.snow} | ${r.staffPar} | ${r.variants}`);
  console.log(`   AI: buyScale ${v.buyScale} buyMin ${v.buyMin} hire m${v.hm} g${v.hg} e${v.he} c${v.hc} r${v.hr} ratio ${v.hireRatio}`);
}
