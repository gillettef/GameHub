/**
 * v2 설계 프로토타입 시뮬레이터 (엔진 반영 전 수치 탐색용).
 *   npx tsx scripts/proto-v2.ts --games 2000 --players 3 --seed 42 [--B 2 --G 3 --R 8 --clubs 6 --tie next|fail --route 0,1,1,1]
 */
import { PLAYERS, CLUBS, NEEDS, needsOf } from '../src/engine/data';
import { createRng, type Rng } from '../src/engine/rng';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : d;
};
const GAMES = Number(arg('games', '2000'));
const N = Number(arg('players', '3'));
const SEED = Number(arg('seed', '42'));
const B = Number(arg('B', '2'));
const G = Number(arg('G', '3'));
const R = Number(arg('R', '8'));
const NCLUBS = Number(arg('clubs', '6'));
const TIE = arg('tie', 'next');
const MARKET = Number(arg('market', String(N + 1)));
const ROUTE = arg('route', '').split(',').filter(Boolean).map(Number);
const DENY = Number(arg('deny', '1'));
const GUESS = arg('guess', 'smart'); // smart | none (상대가 추리하지 않음)
const EXPOSE = arg('expose', 'lose'); // lose: 한 명이라도 맞히면 비밀 구단 보너스 몰수 | keep
const ACCUSE = Number(arg('accuse', '0')); // >0: 종료 지목 대신 게임 중 고발 (1인당 횟수)
const ACCUSE_FROM = Number(arg('accuseFrom', '2'));
const CARRY = arg('carry', '1') === '1'; // 미계약 선수는 시장에 남고 빈자리만 채운다

type Ev = 'normal' | 'fw' | 'budget' | 'young' | 'big' | 'spotlight' | 'deadline';
const EVENTS: Ev[] = ['normal', 'fw', 'budget', 'young', 'big', 'spotlight'];

interface Agent {
  score: number;
  fees: number;
  hand: number[]; // 남은 요구 수수료 카드
  secret: number; // 비밀 구단 id
  route: number;
  tokens: number;
  exposed: boolean;
  accused: number[];
  bids: { club: number; fitLoss: number }[];
}
interface Bid {
  a: number;
  p: number;
  c: number;
  d: number;
  att: number;
}

// v2 프로토타입은 구단 요구 고정: 구단의 첫 요구 카드를 쓴다
const fit = (p: (typeof PLAYERS)[number], c: (typeof CLUBS)[number]) => {
  const n = NEEDS[needsOf(c.id)[0]!]!;
  return (p.pos === n.pos ? 2 : 0) + (p.trait === n.pref ? 1 : 0);
};
const budgetOf = (c: (typeof CLUBS)[number], ev: Ev) => c.budget - (ev === 'budget' ? 2 : 0);
const feeOf = (p: (typeof PLAYERS)[number], d: number, ev: Ev) =>
  p.base + d + (ev === 'fw' && p.pos === 'FW' ? 2 : 0) + (ev === 'young' && p.trait === '유망주' ? 2 : 0) + (ev === 'big' && p.cost >= 6 ? 2 : 0) + (ev === 'deadline' ? 2 : 0);
const clubBonus = (ev: Ev) => (ev === 'spotlight' ? 2 * B : B);

function rawEvidence(ag: Agent, clubs: number[]): Map<number, number> {
  const m = new Map<number, number>(clubs.map((c) => [c, 0]));
  for (const b of ag.bids) m.set(b.club, (m.get(b.club) ?? 0) + 1 + b.fitLoss);
  return m;
}

/** 상대가 c 구단의 비밀 대리인일 가능성 (공개된 제안 기록으로 추정) */
function suspicion(ag: Agent, clubs: number[]): Map<number, number> {
  const m = new Map<number, number>(clubs.map((c) => [c, 0.5]));
  for (const b of ag.bids) m.set(b.club, (m.get(b.club) ?? 0) + 1 + b.fitLoss);
  const tot = [...m.values()].reduce((a, b) => a + b, 0);
  for (const [k, v] of m) m.set(k, v / tot);
  return m;
}

function guess(ag: Agent, clubs: number[], rng: Rng): number {
  if (GUESS === 'none') return clubs[rng.int(clubs.length)]!;
  const e = rawEvidence(ag, clubs);
  const order = [...clubs].sort((a, b) => e.get(b)! - e.get(a)! || rng.next() - 0.5);
  // top: 가장 많이 쓴 구단 / second: 두 번째 (미끼를 의심) / mix: 반반
  const second = GUESS === 'second' || (GUESS === 'mix' && rng.next() < 0.5);
  return second ? order[1]! : order[0]!;
}

const stats = {
  seatWins: Array(N).fill(0) as number[],
  routeWins: new Map<number, { seats: number; wins: number; score: number; det: number; tries: number; bonus: number }>(),
  scores: [] as number[],
  gap: [] as number[],
  contested: 0,
  bids: 0,
  ties: 0,
  deals: 0,
  detected: 0,
  detectTries: 0,
  clubBonusTot: 0,
  guessTot: 0,
  feeTot: 0,
  ownRoute: 0,
  ownRouteDeals: 0,
  winnerChangedByHidden: 0,
  demandUse: [0, 0, 0, 0, 0],
  demandWin: [0, 0, 0, 0, 0],
  tieCancelSteal: 0,
  pass: 0,
  roundFee: new Map<Ev, { n: number; fee: number }>(),
  acc: 0,
  accHit: 0,
  accRound: 0,
};

function play(seed: number, routes: number[]) {
  const rng = createRng(seed);
  const clubs = rng.shuffle(CLUBS.map((c) => c.id)).slice(0, NCLUBS);
  const secrets = rng.shuffle(clubs).slice(0, N);
  const agents: Agent[] = routes.map((route, i) => ({ score: 0, fees: 0, hand: [1, 2, 3, 4], secret: secrets[i]!, route, tokens: ACCUSE, exposed: false, accused: [], bids: [] }));
  const deck = rng.shuffle(PLAYERS.map((p) => p.id));
  const under = new Map<number, number>(clubs.map((c) => [c, 0])); // 구단 아래 계약 수 (보너스 가중)
  const evDeck = rng.shuffle([...EVENTS, ...EVENTS]).slice(0, R - 1);
  evDeck.push('deadline');

  let market: number[] = [];
  for (let r = 0; r < R; r++) {
    const ev = evDeck[r]!;
    market = CARRY ? [...market, ...deck.splice(0, MARKET - market.length)] : deck.splice(0, MARKET);
    const leader = agents.reduce((m, a, i) => (a.score > agents[m]!.score ? i : m), 0);
    const bids: Bid[] = [];
    const accusations: { a: number; t: number; c: number }[] = [];
    agents.forEach((ag, i) => {
      const lastOfCycle = ag.hand.length === 1;
      const opts: { v: number; b: Bid }[] = [];
      const sus = agents.map((o, k) => (k === i ? null : suspicion(o, clubs)));
      for (const pid of market) {
        const p = PLAYERS[pid]!;
        const reach = clubs.filter((c) => budgetOf(CLUBS[c]!, ev) >= p.cost);
        if (!reach.length) continue;
        const bestFit = Math.max(...reach.map((c) => fit(p, CLUBS[c]!)));
        // 상대가 낼 법한 최고 매력도: 최적 구단 + 상대들이 가진 가장 낮은 카드
        const oppMin = Math.min(...agents.filter((_, k) => k !== i).map((o) => Math.min(...o.hand)));
        const threat = bestFit - (oppMin + 1.5) / 1 + (N - 2) * 0.4;
        for (const c of reach) {
          const f = fit(p, CLUBS[c]!);
          for (const d of ag.hand) {
            const att = f - d;
            const win = Math.min(0.95, Math.max(0.03, 0.5 + 0.18 * (att - threat)));
            let v = feeOf(p, d, ev) * win;
            if (ag.exposed) {
              // 들킨 뒤에는 비밀 구단 가치 없음
            } else if (ag.route >= 0) {
              if (c === ag.secret) v += ag.route * clubBonus(ev) * win;
            } else {
              // 위장형: 공개 기록에서 내 비밀 구단이 '가장 의심스러운 구단'이 되지 않는 선에서만 밀어 준다
              const ev0 = rawEvidence(ag, clubs);
              const add = 1 + (bestFit - f);
              const maxOther = Math.max(...clubs.filter((k) => k !== ag.secret).map((k) => ev0.get(k)!));
              if (c === ag.secret) {
                if (ev0.get(c)! + add < maxOther) v += -ag.route * clubBonus(ev) * win;
                else v -= 0.8 * B * (under.get(ag.secret)! + 1);
              } else if (ev0.get(c)! >= maxOther) v += 0.3; // 미끼 구단을 계속 1위로 유지
            }
            // 상대 비밀 구단으로 보내면 그 상대에게 보너스
            if (DENY) for (let k = 0; k < N; k++) if (k !== i && !agents[k]!.exposed) v -= DENY * clubBonus(ev) * win * (sus[k]!.get(c) ?? 0) * (k === leader ? 1.3 : 0.7);
            if (!lastOfCycle) v -= 0.55 * d; // 높은 카드를 아끼는 비용
            opts.push({ v, b: { a: i, p: pid, c, d, att } });
          }
        }
      }
      if (!opts.length) {
        stats.pass++;
        return;
      }
      opts.sort((x, y) => y.v - x.v);
      // 선수별 최선 상위 N+1 중 가중 선택 (똑같은 수 몰림 방지)
      const seen = new Set<number>();
      const top = opts.filter((o) => !seen.has(o.b.p) && seen.add(o.b.p)).slice(0, 3);
      const w = top.map((o) => Math.max(0.05, o.v) ** 2);
      let x = rng.next() * w.reduce((a, b) => a + b, 0);
      let pick = top[0]!;
      for (let k = 0; k < top.length; k++) {
        x -= w[k]!;
        if (x <= 0) {
          pick = top[k]!;
          break;
        }
      }
      if (ACCUSE && ag.tokens > 0 && r + 1 >= ACCUSE_FROM) {
        let best: { v: number; t: number; c: number } | null = null;
        agents.forEach((o, k) => {
          if (k === i || o.exposed || ag.accused.includes(k)) return;
          const e = rawEvidence(o, clubs);
          const order = [...clubs].filter((c) => c !== ag.secret).sort((x, y) => e.get(y)! - e.get(x)!);
          const tot = order.reduce((s2, c) => s2 + e.get(c)! + 0.5, 0);
          const pick2 = GUESS === 'second' || (GUESS === 'mix' && rng.next() < 0.5) ? order[1]! : order[0]!;
          const pr = (e.get(pick2)! + 0.5) / tot;
          const lead = o.score >= Math.max(...agents.map((x) => x.score)) ? 1 : 0.6;
          const v = pr * (G + B * (under.get(pick2)! + 1.5) * lead);
          if (!best || v > best.v) best = { v, t: k, c: pick2 };
        });
        const b2 = best as { v: number; t: number; c: number } | null;
        if (b2 && b2.v > pick.v) {
          accusations.push({ a: i, t: b2.t, c: b2.c });
          return;
        }
      }
      bids.push(pick.b);
    });
    for (const ac of accusations) {
      const ag = agents[ac.a]!;
      ag.tokens--;
      ag.accused.push(ac.t);
      stats.detectTries++;
      if (agents[ac.t]!.secret === ac.c) {
        ag.score += G;
        stats.guessTot += G;
        stats.detected++;
        stats.accHit++;
        agents[ac.t]!.exposed = true;
      }
      stats.acc++;
      stats.accRound += r + 1;
    }

    // 공개·정산
    for (const b of bids) {
      const ag = agents[b.a]!;
      const p = PLAYERS[b.p]!;
      const reach = clubs.filter((c) => budgetOf(CLUBS[c]!, ev) >= p.cost);
      ag.bids.push({ club: b.c, fitLoss: Math.max(...reach.map((c) => fit(p, CLUBS[c]!))) - fit(p, CLUBS[b.c]!) });
      ag.hand.splice(ag.hand.indexOf(b.d), 1);
      if (!ag.hand.length) ag.hand = [1, 2, 3, 4];
      stats.demandUse[b.d]!++;
      if (b.c === ag.secret) stats.ownRoute++;
      stats.bids++;
    }
    const byP = new Map<number, Bid[]>();
    for (const b of bids) byP.set(b.p, [...(byP.get(b.p) ?? []), b]);
    let roundFee = 0;
    for (const group of byP.values()) {
      if (group.length > 1) stats.contested += group.length;
      const sorted = [...group].sort((x, y) => y.att - x.att);
      let i = 0;
      let winner: Bid | null = null;
      while (i < sorted.length) {
        const tier = sorted.filter((b) => b.att === sorted[i]!.att);
        if (tier.length === 1) {
          winner = tier[0]!;
          if (i > 0) stats.tieCancelSteal++;
          break;
        }
        stats.ties++;
        if (TIE === 'fail') break;
        i += tier.length;
      }
      if (!winner) continue;
      market = market.filter((id) => id !== winner!.p);
      const p = PLAYERS[winner.p]!;
      const fee = feeOf(p, winner.d, ev);
      agents[winner.a]!.score += fee;
      agents[winner.a]!.fees += fee;
      roundFee += fee;
      stats.deals++;
      stats.demandWin[winner.d]!++;
      under.set(winner.c, under.get(winner.c)! + clubBonus(ev) / B);
      if (winner.c === agents[winner.a]!.secret) stats.ownRouteDeals++;
    }
    const rf = stats.roundFee.get(ev) ?? { n: 0, fee: 0 };
    rf.n++;
    rf.fee += roundFee;
    stats.roundFee.set(ev, rf);
  }

  // 종료: 비밀 구단 보너스 + 지목
  const visible = agents.map((a) => a.score);
  const visWin = Math.max(...visible);
  const exposed = agents.map(() => false);
  const detBy = agents.map(() => 0);
  const bonusOf = agents.map(() => 0);
  if (ACCUSE) agents.forEach((ag, i) => {
    if (ag.exposed) {
      exposed[i] = true;
      detBy[i]!++;
    }
  });
  if (!ACCUSE) agents.forEach((ag, i) => {
    agents.forEach((o, k) => {
      if (k === i) return;
      stats.detectTries++;
      if (guess(o, clubs, rng) === o.secret) {
        ag.score += G;
        stats.guessTot += G;
        stats.detected++;
        exposed[k] = true;
        detBy[k]!++;
      }
    });
  });
  agents.forEach((ag, i) => {
    const bonus = EXPOSE === 'lose' && exposed[i] ? 0 : under.get(ag.secret)! * B;
    ag.score += bonus;
    bonusOf[i] = bonus;
    stats.clubBonusTot += bonus;
  });
  const final = agents.map((a) => a.score);
  const top = Math.max(...final);
  const winners = final.flatMap((s, i) => (s === top ? [i] : []));
  if (!winners.some((w) => visible[w] === visWin)) stats.winnerChangedByHidden++;
  for (const w of winners) stats.seatWins[w]! += 1 / winners.length;
  routes.forEach((rt, i) => {
    const s = stats.routeWins.get(rt) ?? { seats: 0, wins: 0, score: 0, det: 0, tries: 0, bonus: 0 };
    s.det += detBy[i]!;
    s.tries += N - 1;
    s.bonus += bonusOf[i]!;
    s.seats++;
    s.score += final[i]!;
    if (winners.includes(i)) s.wins += 1 / winners.length;
    stats.routeWins.set(rt, s);
  });
  stats.scores.push(...final);
  const sorted = [...final].sort((a, b) => b - a);
  stats.gap.push(sorted[0]! - sorted[1]!);
  stats.feeTot += agents.reduce((s, a) => s + a.fees, 0);
}

const seedRng = createRng(SEED);
for (let g = 0; g < GAMES; g++) {
  const base = ROUTE.length ? ROUTE : Array(N).fill(1);
  const rot = g % N;
  const routes = base.map((_, i) => base[(i + rot) % N]!);
  play(seedRng.int(2 ** 31), routes);
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (a: number, b: number) => `${r1((100 * a) / b)}%`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`v2 proto N=${N} games=${GAMES} B=${B} G=${G} R=${R} clubs=${NCLUBS} market=${MARKET} tie=${TIE} deny=${DENY} guess=${GUESS}`);
console.log(`자리 승률: ${stats.seatWins.map((w) => pct(w, GAMES)).join(' / ')}`);
console.log(`평균 점수 ${r1(mean(stats.scores))}, 1·2위 격차 평균 ${r1(mean(stats.gap))}, 동점 우승 판 ${pct(stats.gap.filter((g) => g === 0).length, GAMES)}`);
console.log(`라운드당 계약 ${r1(stats.deals / GAMES / R)}건, 경쟁 제안 비율 ${pct(stats.contested, stats.bids)}, 동률 상쇄 그룹 ${r1(stats.ties / GAMES)}/판, 패스 ${pct(stats.pass, GAMES * R * N)}`);
console.log(`자기 비밀 구단 제안 ${pct(stats.ownRoute, stats.bids)}, 그중 계약 ${stats.ownRouteDeals}`);
console.log(`비밀 구단 보너스 평균 ${r1(stats.clubBonusTot / GAMES / N)}, 지목 적중률 ${pct(stats.detected, stats.detectTries)}, 지목 점수 평균 ${r1(stats.guessTot / GAMES / N)}, 수수료 평균 ${r1(stats.feeTot / GAMES / N)}`);
if (ACCUSE) console.log(`고발 ${r1(stats.acc / GAMES)}회/판, 적중 ${pct(stats.accHit, stats.acc)}, 평균 라운드 ${r1(stats.accRound / Math.max(1, stats.acc))}`);
console.log(`숨은 점수로 우승자가 바뀐 판 ${pct(stats.winnerChangedByHidden, GAMES)}`);
console.log(`요구 카드 사용/계약: ${[1, 2, 3, 4].map((d) => `${d}:${stats.demandUse[d]}/${pct(stats.demandWin[d]!, stats.demandUse[d]!)}`).join(' ')}`);
console.log(`이벤트별 라운드 수수료: ${[...stats.roundFee].map(([k, v]) => `${k} ${r1(v.fee / v.n)}`).join(' · ')}`);
if (ROUTE.length) for (const [rt, s] of [...stats.routeWins].sort((a, b) => a[0] - b[0])) console.log(`  route=${rt}: 1인당 승률 ${pct(s.wins, s.seats)}, 평균 ${r1(s.score / s.seats)}, 노출률 ${pct(s.det, s.tries)}, 구단 보너스 ${r1(s.bonus / s.seats)}`);
