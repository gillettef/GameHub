/**
 * AI 플레이테스터 리그: 성향이 다른 AI(페르소나)를 대진시켜 평가 기준(docs/evaluation-rubric.md)의
 * ①·③·④ AI 리그 항목을 판정한다.
 *   npx tsx scripts/league.ts [--games 600] [--seed 42] [--players 2,3,4]
 * v6 (5라운드 x 1·2차): 킹메이킹은 마지막 2라운드 시작(TOTAL_ROUNDS-1) 때의 단독 선두, ④-c는 마지막 2라운드 시작 때 1위 기준.
 * --only cards: 카드 운용 변형(아끼기·몰아 쓰기 등). 변형 자리은 AI_MODEL 을 그 자리 차례에만 바꿔 같은 AI로 둔다.
 */
import { AI_MODEL, PERSONAS, RULES, STAGES, TOTAL_ROUNDS, createGame, createRng, makeAiBid, nextRound, resolveRound, winners } from '../src/core';
import type { GameState, Persona, PersonaKey, RoundBid } from '../src/core';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const GAMES = Number(arg('games', '600'));
const SEED = Number(arg('seed', '42'));
const COUNTS = arg('players', '3,4').split(',').map(Number);
/** --only seat,league,skill,king,degen,core,var 로 일부만 */
const ONLY = new Set(arg('only', 'seat,league,skill,king,degen,core,var').split(','));
// 'cards'(카드 운용 변형)는 --only 로 지정할 때만
const want = (k: string) => ONLY.has(k);
const rng = createRng(SEED);
// --persona save=0,greed=0.3 처럼 균형형(앱의 '보통') 조정값 실험
for (const kv of arg('persona', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (PERSONAS.balanced as unknown as Record<string, number>)[k!] = Number(v);
}
// --all depth=3 처럼 무작위를 뺀 모든 페르소나에 같은 값 실험
for (const kv of arg('all', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  for (const ps of Object.values(PERSONAS)) if (ps.kind !== 'random') (ps as unknown as Record<string, number>)[k!] = Number(v);
}
// --model beta1=0.7 처럼 상대 예측 모델 실험
for (const kv of arg('model', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k! in AI_MODEL)) throw new Error(`unknown model ${k}`);
  (AI_MODEL as unknown as Record<string, number>)[k!] = Number(v);
}
// --rules clubBonus=3,minAttract=0 처럼 규칙 수치 실험 (null 은 'null')
for (const kv of arg('rules', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k! in RULES)) throw new Error(`unknown rule ${k}`);
  // 배열 값은 1/2/4/6 처럼 슬래시로
  (RULES as unknown as Record<string, unknown>)[k!] = v === 'null' ? null : v!.includes('/') ? v!.split('/').map(Number) : Number(v);
}

/**
 * --depths 1/4: 게임마다 페르소나별 상대 예측 모델(depth)을 이 중에서 무작위로 정한다.
 * 같은 모델 복제끼리는 같은 수로 몰려 고정 카드 전략에 공략당하고, 한 페르소나만 좋은 모델을 쓰면
 * 전략이 아니라 정보 품질로 지배하므로, 모델 수준을 고르게 섞어 전략 차이만 비교한다.
 */
const DEPTHS = arg('depths', '').split('/').filter(Boolean).map(Number) as Persona['depth'][];
const depthRng = createRng(SEED + 1);

/**
 * 카드 운용 변형: src 를 바꾸지 않고, 그 자리만 사람 자리으로 두고 스크립트가 makeAiBid 를 대신 부른다.
 * model 은 그 자리 차례에만 적용되는 AI_MODEL 값 (cardValue = 카드 기회비용, cardValue + deadlineBonus = 마지막 라운드 예약 비용).
 */
type VariantKey = 'hoard' | 'dump' | 'noscar' | 'lowdump' | 'lowhoard';
type Seat = PersonaKey | VariantKey;
const VARIANTS: Record<VariantKey, { name: string; base: PersonaKey; model: Partial<typeof AI_MODEL> }> = {
  hoard: { name: '카드 아끼기(cardValue 12)', base: 'balanced', model: { cardValue: 12 } },
  dump: { name: '몰아 쓰기(cardValue -5, 예약 없음)', base: 'balanced', model: { cardValue: -5 } },
  noscar: { name: '희소성 무시(cardValue 0, 예약만)', base: 'balanced', model: { cardValue: 0 } },
  lowdump: { name: '최저 카드 + 몰아 쓰기', base: 'low', model: { cardValue: -5 } },
  lowhoard: { name: '최저 카드 + 아끼기', base: 'low', model: { cardValue: 12 } },
};
const isVariant = (p: Seat): p is VariantKey => p in VARIANTS;
const nameOf = (p: Seat) => (isVariant(p) ? VARIANTS[p].name : PERSONAS[p].name);
const varRng = createRng(SEED + 2);
function withModel<T>(m: Partial<typeof AI_MODEL>, f: () => T): T {
  const saved = { ...AI_MODEL };
  Object.assign(AI_MODEL, m);
  try {
    return f();
  } finally {
    Object.assign(AI_MODEL, saved);
  }
}

const THINKERS: PersonaKey[] = ['balanced', 'greedy', 'cautious', 'focused', 'opportunist', 'ignore', 'blocker', 'spoiler'];
const POOL: PersonaKey[] = ['random', ...THINKERS];
/** 합리적 전략: 무작위·퇴화 전략 제외 */
const RATIONAL: PersonaKey[] = ['balanced', 'greedy', 'cautious', 'focused', 'opportunist', 'ignore', 'blocker', 'spoiler'];

interface GameOut {
  seats: Seat[];
  win: number[];
  /** 마지막 2라운드 시작 전(TOTAL_ROUNDS-1) 공개 점수 1위들 */
  leaderBeforeLast2: number[];
  /** 마지막 라운드 시작 전 공개 점수 1위들 */
  leaderBeforeLast: number[];
  /** 마지막 2라운드 시작 전 공개 점수 단독 1위 (없으면 -1) — 킹메이킹 */
  soleBeforeLast2: number;
  /** 자리별 라운드별 카드 사용 수 */
  cardsByRound: number[][];
  /** 자리별 공개된 카드 1~4 수 */
  demandUse: number[][];
  /** 자리별 카드 1~4 를 쓴 라운드 합 (평균 사용 라운드 계산용) */
  demandRound: number[][];
  hiddenChanged: boolean;
  roundFees: number[];
  /** 자리별 목표 보너스 */
  goal: number[];
}

function play(seats: Seat[]): GameOut {
  if (DEPTHS.length)
    for (const ps of Object.values(PERSONAS)) if (ps.kind !== 'random' && ps.kind !== 'pass') ps.depth = DEPTHS[depthRng.int(DEPTHS.length)]!;
  let s: GameState = createGame(
    seats.map((p, i) => (isVariant(p) ? { name: `${p}${i}`, kind: 'human' as const, persona: VARIANTS[p].base } : { name: `${p}${i}`, kind: 'ai' as const, persona: p })),
    rng.int(2 ** 31),
  );
  // createGame 은 사람 자리의 persona 를 버리므로 변형 자리에 다시 붙인다 (없으면 '무작위'로 둔다)
  s = { ...s, agents: s.agents.map((a, i) => (isVariant(seats[i]!) ? { ...a, persona: VARIANTS[seats[i] as VariantKey].base } : a)) };
  const leadersOf = (st: GameState) => {
    const top = Math.max(...st.agents.map((a) => a.score));
    return st.agents.flatMap((a, i) => (a.score === top ? [i] : []));
  };
  let leaderBeforeLast2: number[] = [];
  let leaderBeforeLast: number[] = [];
  let soleBeforeLast2 = -1;
  const roundFees: number[] = [];
  const cardsByRound = seats.map(() => Array<number>(TOTAL_ROUNDS).fill(0));
  const demandUse = seats.map(() => [0, 0, 0, 0]);
  const demandRound = seats.map(() => [0, 0, 0, 0]);
  while (s.phase !== 'done') {
    if (s.round === TOTAL_ROUNDS - 1) {
      leaderBeforeLast2 = leadersOf(s);
      soleBeforeLast2 = leaderBeforeLast2.length === 1 ? leaderBeforeLast2[0]! : -1;
    }
    if (s.round === TOTAL_ROUNDS) leaderBeforeLast = leadersOf(s);
    const subs: Record<number, RoundBid> = {};
    seats.forEach((p, i) => {
      if (isVariant(p)) subs[i] = withModel(VARIANTS[p].model, () => makeAiBid(s, i, varRng));
    });
    const before = s.agents.map((a) => a.hand.length);
    s = resolveRound(s, subs);
    const r = s.results.at(-1)!;
    s.agents.forEach((a, i) => (cardsByRound[i]![s.round - 1] = before[i]! - a.hand.length));
    // 공개된(소모된) 카드: 계약·패배·몸값 미달·협상 무산
    for (const e of r.entries) if (e.offer && (e.status !== 'invalid' || e.reason === 'signed' || e.reason === 'under-cost')) {
        demandUse[e.agent]![e.offer.demand - 1]!++;
        demandRound[e.agent]![e.offer.demand - 1]! += r.round;
      }
    roundFees.push(r.entries.reduce((x, e) => x + (e.fee ?? 0), 0));
    s = nextRound(s);
  }
  const ws = winners(s);
  const vis = s.agents.map((a) => a.score);
  const visTop = Math.max(...vis);
  return {
    seats,
    win: s.agents.map((_, i) => (ws.includes(i) ? 1 / ws.length : 0)),
    leaderBeforeLast2,
    leaderBeforeLast,
    soleBeforeLast2,
    cardsByRound,
    demandUse,
    demandRound,
    hiddenChanged: !ws.some((w) => vis[w] === visTop),
    roundFees,
    goal: s.agents.map((a) => a.final!.goalPoints),
  };
}

const shuffle = <T>(xs: T[]) => rng.shuffle(xs);
/** 자리을 매판 섞어 자리 편향을 상쇄하면서, 페르소나별 1인당 승률을 잰다 */
function series(make: () => Seat[], games: number) {
  const per = new Map<Seat, { seats: number; wins: number }>();
  const outs: GameOut[] = [];
  for (let g = 0; g < games; g++) {
    const o = play(shuffle(make()));
    outs.push(o);
    o.seats.forEach((p, i) => {
      const x = per.get(p) ?? { seats: 0, wins: 0 };
      x.seats++;
      x.wins += o.win[i]!;
      per.set(p, x);
    });
  }
  const rate = (p: Seat) => {
    const x = per.get(p);
    return x && x.seats ? x.wins / x.seats : NaN;
  };
  return { rate, outs };
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const mark = (ok: boolean) => (ok ? '✅' : '❌');
const report: string[] = [];
const log = (s: string) => {
  report.push(s);
  console.log(s);
};

log(`# AI 플레이테스터 리그 (seed ${SEED}, depth ${DEPTHS.join("/") || "페르소나 기본값"}, 대진당 ${GAMES}판, 규칙 ${JSON.stringify(RULES)})`);
for (const N of COUNTS) {
  const fair = 1 / N;
  log(`\n## ${N}인 (공정값 ${pct(fair)})`);

  // 자리 편향: 균형형만으로 (자리 고정)
  if (want('seat')) {
  const seatWins = Array<number>(N).fill(0);
  const SEAT_GAMES = GAMES * 5;
  for (let g = 0; g < SEAT_GAMES; g++) play(Array(N).fill('balanced')).win.forEach((w, i) => (seatWins[i]! += w));
  const seatDev = Math.max(...seatWins.map((w) => Math.abs(w / SEAT_GAMES - fair)));
  log(`- ${mark(seatDev <= 0.02)} ③-1 자리 편향 (${SEAT_GAMES}판): ${seatWins.map((w) => pct(w / SEAT_GAMES)).join(' / ')} (최대 편차 ${pct(seatDev)})`);
  }

  // 리그: 매판 풀에서 N종을 무작위로 뽑아 대진 (④·①-b 통계에도 사용)
  const league = series(() => shuffle(POOL).slice(0, N), want('league') || want('core') || want('var') ? GAMES * 3 : 0);
  if (want('league')) {
    // 지배 전략 검사는 합리적 전략끼리 (무작위·노골형처럼 일부러 약한 전략을 섞으면 '잘 두는 AI'가 이길 뿐이다)
    const fairPool = series(() => shuffle(RATIONAL).slice(0, N), GAMES * 3);
    const rates = RATIONAL.map((p) => ({ p, r: fairPool.rate(p) })).sort((a, b) => b.r - a.r);
    const topRatio = rates[0]!.r / fair;
    log(`- ${mark(topRatio <= 1.5)} ③-2 지배 페르소나 없음 (합리적 전략 ${RATIONAL.length}종): 최고 ${PERSONAS[rates[0]!.p].name} ${pct(rates[0]!.r)} (공정값의 ${Math.round(topRatio * 100) / 100}배)`);
    log(`  - 합리적 전략 리그: ${rates.map((x) => `${PERSONAS[x.p].name} ${pct(x.r)}`).join(' · ')}`);
    const all = POOL.map((p) => ({ p, r: league.rate(p) })).sort((a, b) => b.r - a.r);
    log(`  - 참고 전체 리그(약한 전략 포함): ${all.map((x) => `${PERSONAS[x.p].name} ${pct(x.r)}`).join(' · ')}`);
  }

  // 실력 보상
  if (want('skill')) {
  const skill: string[] = [];
  let skillOk = true;
  {
    const sr = series(() => ['balanced', ...Array(N - 1).fill('random')], GAMES);
    skillOk &&= sr.rate('balanced') > sr.rate('random');
    skill.push(`균형형 1명: ${pct(sr.rate('balanced'))} vs 무작위 ${pct(sr.rate('random'))}`);
  }
  if (N > 2) {
    // 사람은 서로 다르게 판단하므로 서로 다른 생각형 N-1명 + 무작위 1명으로 잰다
    const mixed: PersonaKey[] = ['balanced', 'greedy', 'cautious', 'blocker', 'focused'];
    const sr = series(() => [...shuffle(mixed).slice(0, N - 1), 'random'], GAMES);
    const thinkers = mixed.filter((p) => !Number.isNaN(sr.rate(p)));
    const seatsWins = sr.outs.reduce((a, o) => a + o.seats.reduce((x, p, i) => x + (p === 'random' ? 0 : o.win[i]!), 0), 0) / (sr.outs.length * (N - 1));
    skillOk &&= seatsWins > sr.rate('random');
    skill.push(`서로 다른 생각형 ${N - 1}명: 1인당 ${pct(seatsWins)} vs 무작위 ${pct(sr.rate('random'))} (${thinkers.length}종 섞음)`);
    const clones = series(() => [...Array(N - 1).fill('balanced'), 'random'], GAMES);
    skill.push(`참고: 똑같은 균형형 ${N - 1}명 ${pct(clones.rate('balanced'))} vs 무작위 ${pct(clones.rate('random'))}`);
  }
  log(`- ${mark(skillOk)} ③-3 실력 보상: ${skill.join(' / ')}`);
  }

  // 킹메이킹: 방해형 1 + 합리적 N-1 vs 합리적 N. 마지막 2라운드 시작 때 단독 선두의 우승률
  const without = series(() => Array(N).fill('balanced'), want('king') || want('core') ? GAMES : 0);
  if (want('king')) {
  const leadWin = (outs: GameOut[]) => {
    const xs = outs.filter((o) => o.soleBeforeLast2 >= 0 && o.seats[o.soleBeforeLast2] !== 'spoiler');
    return xs.reduce((a, o) => a + o.win[o.soleBeforeLast2]!, 0) / Math.max(1, xs.length);
  };
  const withSp = series(() => ['spoiler', ...shuffle(RATIONAL.filter((p) => p !== 'spoiler')).slice(0, N - 1)], GAMES);
  const withoutSp = series(() => shuffle(RATIONAL.filter((p) => p !== 'spoiler')).slice(0, N), GAMES);
  const drop = leadWin(withoutSp.outs) - leadWin(withSp.outs);
  const spRate = withSp.rate('spoiler');
  // 2인에서는 제3자가 없어 킹메이킹이 성립하지 않는다 (방해 = 정상적인 견제)
  log(`- ${N === 2 ? '➖' : mark(spRate <= fair && drop <= 0.1)} ③-4 킹메이킹${N === 2 ? ' (2인 해당 없음)' : ''}: 방해형 승률 ${pct(spRate)}, 선두 우승률 ${pct(leadWin(withoutSp.outs))} → ${pct(leadWin(withSp.outs))} (하락 ${pct(drop)})`);
  }

  // 퇴화 전략
  if (want('degen')) {
  // 상대는 서로 다른 합리적 전략 (같은 AI 복제만 상대하면 그 습관을 공략하는 고정 전략이 이길 수 있다)
  const degen = (['pass', 'low', 'high'] as PersonaKey[]).map((p) => ({ p, r: series(() => [p, ...shuffle(RATIONAL).slice(0, N - 1)], GAMES).rate(p) }));
  const degenClone = (['low', 'high'] as PersonaKey[]).map((p) => ({ p, r: series(() => [p, ...Array(N - 1).fill('balanced')], GAMES).rate(p) }));
  log(`- ${mark(degen.every((d) => d.r < fair))} ③-5 퇴화 전략 없음: ${degen.map((d) => `${PERSONAS[d.p].name} ${pct(d.r)}`).join(' · ')} (참고: 균형형 복제 상대 ${degenClone.map((d) => `${PERSONAS[d.p].name} ${pct(d.r)}`).join(' · ')})`);
  }

  // 카드 운용 변형 (v6 카드 소진): 변형 1명 + 서로 다른 합리적 전략
  if (want('cards')) {
    const vs: Seat[] = ['hoard', 'dump', 'noscar', 'lowdump', 'lowhoard', 'low', 'high', 'balanced'];
    for (const p of vs) {
      const sr = series(() => [p, ...shuffle(RATIONAL).slice(0, N - 1)], GAMES);
      let rounds = Array<number>(TOTAL_ROUNDS).fill(0);
      const use = [0, 0, 0, 0];
      const when = [0, 0, 0, 0];
      let n = 0;
      for (const o of sr.outs) {
        const i = o.seats.indexOf(p);
        rounds = rounds.map((x, r) => x + o.cardsByRound[i]![r]!);
        o.demandUse[i]!.forEach((u, d) => (use[d]! += u));
        o.demandRound[i]!.forEach((u, d) => (when[d]! += u));
        n++;
      }
      const r2 = (x: number) => Math.round(x * 100) / 100;
      log(`  - ${mark(sr.rate(p) < fair)} 카드 변형 ${nameOf(p)}: ${pct(sr.rate(p))} · 라운드별 카드 ${rounds.map((x) => r2(x / n)).join('/')} · 카드 1/2/3/4 평균 사용 라운드 ${when.map((w, d) => r2(w / Math.max(1, use[d]!))).join('/')} · 1인당 사용 ${r2(use.reduce((a, b) => a + b, 0) / n)}장`);
    }
  }

  // ① 핵심 장치가 결정을 바꾸는가
  if (want('core')) {
  const ign = series(() => ['ignore', ...shuffle(RATIONAL.filter((p) => p !== 'ignore')).slice(0, N - 1)], GAMES).rate('ignore');
  const hidden = league.outs.filter((o) => o.hiddenChanged).length / league.outs.length;
  const diag = without.outs;
  const goalAvg = diag.reduce((a, o) => a + o.goal.reduce((x, y) => x + y, 0), 0) / (diag.length * N);
  const doneRate = diag.reduce((a, o) => a + o.goal.filter((x) => x > 0).length, 0) / (diag.length * N);
  log(`  - 참고: 균형형끼리 목표 보너스 평균 ${Math.round(goalAvg * 10) / 10}억, 목표 달성률 ${pct(doneRate)}`);
  log(`- ${mark(ign <= 0.8 * fair)} ①-a 목표 무시형 승률 ${pct(ign)} (기준 ≤ ${pct(0.8 * fair)})`);
  log(`- ${mark(hidden >= 0.15)} ①-b 숨은 점수로 우승자가 바뀐 판 ${pct(hidden)}`);
  }

  // ④ 상대 구성에 따라 1위가 바뀌는가: 무작위 대진 묶음별 1위
  if (want('var')) {
  const tops = new Set<PersonaKey>();
  const think = THINKERS.filter((p) => p !== 'spoiler');
  for (let m = 0; m < 12; m++) {
    const set = shuffle(think).slice(0, Math.min(N + 1, think.length));
    const sr = series(() => shuffle(set).slice(0, N), Math.max(200, Math.floor(GAMES / 2)));
    tops.add(set.reduce((a, b) => (sr.rate(b) > sr.rate(a) ? b : a)));
  }
  log(`- ${mark(tops.size >= 3)} ④-a 대진에 따라 1위가 바뀜: ${tops.size}종 (${[...tops].map((p) => PERSONAS[p].name).join(', ')})`);
  const fees = league.outs.map((o) => o.roundFees);
  const avg = fees.flat().reduce((a, b) => a + b, 0) / (fees.length * TOTAL_ROUNDS);
  const last = fees.reduce((a, f) => a + f[TOTAL_ROUNDS - 1]!, 0) / fees.length;
  log(`- ${mark(last / avg >= 1.4)} ④-b 마지막 라운드 수수료 ${Math.round(last * 10) / 10} / 평균 ${Math.round(avg * 10) / 10} = ${Math.round((last / avg) * 100) / 100}배`);
  const flip = league.outs.filter((o) => !o.leaderBeforeLast2.some((l) => o.win[l]! > 0)).length / league.outs.length;
  const flip1 = league.outs.filter((o) => !o.leaderBeforeLast.some((l) => o.win[l]! > 0)).length / league.outs.length;
  log(`- ${mark(flip >= 0.25)} ④-c 마지막 2라운드에서 1위가 바뀐 판 ${pct(flip)} (참고: 마지막 1라운드(협상 ${STAGES}회)만 ${pct(flip1)})`);
  }
}
