/**
 * 밸런스 측정 하네스.
 *   npx tsx scripts/balance.ts [--n 1500] [--exp mirror,profiles,snowball,economy,staff] [--set satPerVp=5,startMoney=12,rounds3=9]
 * 룰 상수(CFG)를 --set 으로 덮어써서 비교한다. 결과는 표로 출력.
 */
import { AI_PROFILES, CFG, newGame, probe, rankings } from '../src/game/engine';
import type { GameState, StaffKey } from '../src/game/types';
import { FACILITY_BY_ID } from '../src/game/data/facilities';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(opt('n', '1500'));
const EXPS = opt('exp', 'mirror,profiles,snowball,economy,staff,variants').split(',');
const SET = opt('set', '');
for (const kv of SET.split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  const m = /^rounds(\d)$/.exec(k);
  if (m) CFG.roundsByPlayers[Number(m[1])] = Number(v);
  else if (k in CFG.hireCosts) CFG.hireCosts[k as StaffKey] = v.split('/').map(Number); // 예: marketer=6/8/10
  else (CFG as unknown as Record<string, number>)[k] = Number(v);
}

/* 재현 가능한 난수 (프로필 배정용) */
let seed = 12345;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const shuffle = <T,>(a: T[]) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const pct = (x: number) => (x * 100).toFixed(0).padStart(3) + '%';
const f1 = (x: number) => x.toFixed(1);

function play(players: number, profiles: string[], s0: number): GameState {
  return newGame({ humans: 0, aiCount: players, seed: s0, profiles });
}

console.log(`# 밸런스 리포트 (n=${N}${SET ? ', set ' + SET : ''})`);
console.log(`CFG: satPerVp=${CFG.satPerVp} startMoney=${CFG.startMoney} incomeDiv=${CFG.incomeDiv} breakBase=${CFG.breakBase} trash=${CFG.trashChance} hire=${Object.entries(CFG.hireCosts).map(([k, v]) => k[0] + ':' + v.join('/')).join(' ')} order=${CFG.catchUpOrder ? 'catchup' : 'rotate'} seatBonus=${CFG.seatBonus} rowExtra=${CFG.rowExtra} rounds=${JSON.stringify(CFG.roundsByPlayers)}/${CFG.rounds}\n`);

/* ───── 1. 거울 대전: 같은 AI끼리 → 좌석·선 플레이어 편향, VP 규모 ───── */
if (EXPS.includes('mirror')) {
  console.log('## 거울 대전 (balanced ×N)');
  for (const pl of [2, 3, 4]) {
    const wins = Array(pl).fill(0);
    const vps: number[] = [];
    const money: number[] = [];
    const gaps: number[] = [];
    let rounds = 0;
    for (let i = 0; i < N; i++) {
      const s = play(pl, Array(pl).fill('balanced'), i * 7919 + 1);
      const r = rankings(s);
      wins[(r[0].id - s.startFirst + pl) % pl]++; // 1라운드 순서 기준
      vps.push(...s.players.map((p) => p.vp));
      money.push(...s.players.map((p) => p.money));
      gaps.push(r[0].vp - r[1].vp);
      rounds = s.maxRounds;
    }
    const exp = 1 / pl;
    const worst = Math.max(...wins.map((w) => Math.abs(w / N - exp)));
    console.log(
      `${pl}인 ${rounds}R | 평균VP ${f1(mean(vps))} (σ${f1(std(vps))}) 잔액 $${f1(mean(money))} 1-2위 격차 ${f1(mean(gaps))} | 좌석 승률 ${wins.map((w) => pct(w / N)).join(' ')} (기대 ${pct(exp)}, 최대편차 ${(worst * 100).toFixed(1)}%p)`,
    );
  }
  console.log();
}

/* ───── 2. 전략 라운드로빈: 한 전략이 압도하는가 ───── */
if (EXPS.includes('profiles')) {
  const names = ['balanced', 'builder', 'staff', 'audience', 'frugal'];
  for (const pl of [2, 3]) {
    const win: Record<string, number> = {};
    const games: Record<string, number> = {};
    const vp: Record<string, number[]> = {};
    for (const k of names) ((win[k] = 0), (games[k] = 0), (vp[k] = []));
    for (let i = 0; i < N * 2; i++) {
      const pick = shuffle(names).slice(0, pl);
      const s = play(pl, pick, i * 104729 + 3);
      const r = rankings(s);
      pick.forEach((k, idx) => {
        games[k]++;
        vp[k].push(s.players[idx].vp);
      });
      win[pick[r[0].id]]++;
    }
    console.log(`## 전략 라운드로빈 (${pl}인, 기대 승률 ${pct(1 / pl)})`);
    for (const k of names) console.log(`${AI_PROFILES[k].label.padEnd(6)} 승률 ${pct(win[k] / games[k])} 평균VP ${f1(mean(vp[k]))}`);
    console.log();
  }
}

/* ───── 3. 눈덩이: 라운드별 선두가 최종 승리하는 비율 ───── */
if (EXPS.includes('snowball')) {
  const pl = 3;
  const hist: number[][][] = [];
  let cur: number[][] = [];
  probe.roundEnd = (s) => cur.push(s.players.map((p) => p.vp));
  const hit: number[] = [];
  const tot: number[] = [];
  for (let i = 0; i < N; i++) {
    cur = [];
    const s = play(pl, Array(pl).fill('balanced'), i * 31 + 5);
    const w = rankings(s)[0].id;
    cur.forEach((vps, r) => {
      const top = Math.max(...vps);
      const leaders = vps.map((v, id) => (v === top ? id : -1)).filter((x) => x >= 0);
      tot[r] = (tot[r] ?? 0) + 1;
      hit[r] = (hit[r] ?? 0) + (leaders.includes(w) ? 1 / leaders.length : 0);
    });
    hist.push(cur);
  }
  probe.roundEnd = undefined;
  console.log(`## 눈덩이 (3인, 라운드별 선두가 최종 우승할 확률 — 기대 ${pct(1 / pl)}, 높을수록 역전 불가)`);
  console.log(hit.map((h, r) => `R${r + 1} ${pct(h / tot[r])}`).join('  '));
  const avgByRound = hist[0].map((_, r) => mean(hist.map((h) => mean(h[r]))));
  console.log('평균 VP 추이: ' + avgByRound.map((v, r) => `R${r + 1} ${f1(v)}`).join('  '));
  console.log();
}

/* ───── 4. 경제: 파산·잔액·시설 수·정체 ───── */
if (EXPS.includes('economy')) {
  const pl = 3;
  let debt = 0;
  const gamesWithDebt = new Set<number>();
  let gi = 0;
  probe.debt = () => gamesWithDebt.add(gi);
  const buyRound: number[] = [];
  const hireRound: number[] = [];
  const staff: Record<string, number> = { marketer: 0, guide: 0, engineer: 0, cleaner: 0, researcher: 0 };
  probe.buy = (_p, _id, _price, r) => buyRound.push(r);
  probe.hire = (_p, k, r) => (hireRound.push(r), staff[k]++);
  const fac: number[] = [];
  const money: number[] = [];
  const vp: number[] = [];
  const zeroVp: number[] = [];
  for (let i = 0; i < N; i++) {
    gi = i;
    const s = play(pl, Array(pl).fill('balanced'), i * 17 + 9);
    for (const p of s.players) {
      fac.push(p.facilities.filter(Boolean).length);
      money.push(p.money);
      vp.push(p.vp);
      zeroVp.push(p.vp <= 5 ? 1 : 0);
    }
  }
  debt = gamesWithDebt.size;
  probe.debt = probe.buy = probe.hire = undefined;
  const R = CFG.roundsByPlayers[pl] ?? CFG.rounds;
  const buysPerRound = Array.from({ length: R }, (_, r) => buyRound.filter((x) => x === r + 1).length / (N * pl));
  console.log('## 경제 (3인 balanced)');
  console.log(`적자(VP 감점) 발생 게임 ${pct(debt / N)} | 최종 시설 평균 ${f1(mean(fac))}/${CFG.slots} | 최종 잔액 평균 $${f1(mean(money))} | VP 평균 ${f1(mean(vp))} (σ${f1(std(vp))}) | VP≤5 ${pct(mean(zeroVp))}`);
  console.log('라운드별 건설 횟수/플레이어: ' + buysPerRound.map((b, r) => `R${r + 1} ${b.toFixed(2)}`).join('  '));
  console.log('고용 횟수/플레이어: ' + Object.entries(staff).map(([k, v]) => `${k} ${(v / (N * pl)).toFixed(2)}`).join('  '));
  console.log();
}

/* ───── 5. 인력 가치: "균형 AI + 해당 인력 우선 고용" vs "균형 AI" (2인) ───── */
if (EXPS.includes('staff')) {
  console.log('## 인력 가치 (2인: 균형 AI가 해당 인력 Lv2를 (시설 2개 후) 우선 고용 vs 균형 AI, 기대 50%)');
  for (const k of ['marketer', 'guide', 'engineer', 'cleaner', 'researcher']) {
    let w = 0;
    let vd = 0;
    const M = Math.max(600, Math.floor(N));
    for (let i = 0; i < M; i++) {
      const order = i % 2 === 0 ? ['b_' + k, 'balanced'] : ['balanced', 'b_' + k];
      const s = play(2, order, i * 613 + 11);
      const mine = s.players[order.indexOf('b_' + k)];
      const other = s.players[order.indexOf('balanced')];
      if (rankings(s)[0].id === mine.id) w++;
      vd += mine.vp - other.vp;
    }
    console.log(`${k.padEnd(10)} 승률 ${pct(w / M)}  평균 VP차 ${(vd / M >= 0 ? '+' : '') + f1(vd / M)}`);
  }
  console.log();
}

/* ───── 6. 전략 변형: 균형 AI를 한 방향으로 치우치게 한 변형 vs 균형 AI 2명 (3인) ───── */
if (EXPS.includes('variants')) {
  const b = AI_PROFILES.balanced;
  const sc = (x: number) => ({ marketer: b.hire.marketer * x, guide: b.hire.guide * x, engineer: b.hire.engineer * x, cleaner: b.hire.cleaner * x, researcher: b.hire.researcher * x });
  const V: Record<string, typeof b> = {
    '시설 많이(공격적 건설)': { ...b, buyScale: 1.0, buyMin: 1.5 },
    '시설 적게(신중)': { ...b, buyScale: 0.4, buyMin: 7 },
    '인력 많이': { ...b, hire: sc(1.8), hireRatio: 0.4 },
    '인력 적게': { ...b, hire: sc(0.4), hireRatio: 1.2 },
    '마케팅 올인': { ...b, hire: { ...b.hire, marketer: 20 } },
    '안내·연구 위주': { ...b, hire: { ...b.hire, marketer: 2, guide: 10, researcher: 9 } },
    '정비 위주(엔지니어·미화)': { ...b, hire: { ...b.hire, engineer: 8, cleaner: 8 } },
    '현금 비축': { ...b, reserve: 6 },
  };
  console.log('## 전략 변형 (3인: 변형 1 + 균형 AI 2, 기대 33%, 변형이 33%±8 안이면 "대안으로 성립")');
  for (const [name, prof] of Object.entries(V)) {
    AI_PROFILES.var = prof;
    let w = 0;
    let vp = 0;
    const M = Math.max(600, N);
    for (let i = 0; i < M; i++) {
      const seat = i % 3;
      const profiles = ['balanced', 'balanced', 'balanced'];
      profiles[seat] = 'var';
      const s = play(3, profiles, i * 7717 + 5);
      if (rankings(s)[0].id === seat) w++;
      vp += s.players[seat].vp;
    }
    console.log(`${name.padEnd(16)} 승률 ${pct(w / M)}  평균VP ${f1(vp / M)}`);
  }
  console.log();
}

/* ───── 시설 사용 현황 (참고) ───── */
if (EXPS.includes('cards')) {
  const buys: Record<number, number> = {};
  const inc: Record<number, number> = {};
  const sat: Record<number, number> = {};
  const vis: Record<number, number> = {};
  probe.buy = (_p, id) => (buys[id] = (buys[id] ?? 0) + 1);
  probe.visit = (_p, id, i, s) => ((inc[id] = (inc[id] ?? 0) + i), (sat[id] = (sat[id] ?? 0) + s), (vis[id] = (vis[id] ?? 0) + 1));
  for (let i = 0; i < N; i++) play(3, ['balanced', 'balanced', 'balanced'], i * 3 + 1);
  probe.buy = probe.visit = undefined;
  console.log('## 시설별 구매 수 / 방문당 수익·만족도 (balanced 3인)');
  const rows = Object.keys(buys).map(Number).sort((a, b) => buys[b] - buys[a]);
  for (const id of rows.slice(0, 50)) {
    const c = FACILITY_BY_ID[id];
    console.log(`${String(id).padStart(2)} ${c.name.padEnd(10, '　')} ${c.type.padEnd(5, '　')} 비용${String(c.cost).padStart(2)} 유지${c.upkeep} 구매 ${String(buys[id]).padStart(5)} 방문당 $${f1(inc[id] / vis[id])} ★${f1(sat[id] / vis[id])}`);
  }
}
