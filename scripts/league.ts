/**
 * AI 플레이테스터 리그: 성향이 다른 AI(페르소나)를 대진시켜 평가 기준(docs/evaluation-rubric.md)의
 * ①·③·④ AI 리그 항목을 판정한다.
 *   npx tsx scripts/league.ts [--games 600] [--seed 42] [--players 2,3,4]
 */
import { AI_MODEL, PERSONAS, RULES, TOTAL_ROUNDS, createGame, createRng, finishGame, nextRound, resolveRound, winners } from '../src/core';
import type { GameState, PersonaKey } from '../src/core';

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
const want = (k: string) => ONLY.has(k);
const rng = createRng(SEED);
// --persona save=0,greed=0.3 처럼 균형형(앱의 '보통') 조정값 실험
for (const kv of arg('persona', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (PERSONAS.balanced as unknown as Record<string, number>)[k!] = Number(v);
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

const THINKERS: PersonaKey[] = ['balanced', 'greedy', 'cautious', 'blatant', 'stealth', 'ignore', 'deducer', 'spoiler'];
const POOL: PersonaKey[] = ['random', ...THINKERS];
/** 합리적 전략: 무작위·노골형(위장 없이 밀어 줌)·퇴화 전략 제외 */
const RATIONAL: PersonaKey[] = ['balanced', 'greedy', 'cautious', 'stealth', 'ignore', 'deducer', 'spoiler'];

interface GameOut {
  seats: PersonaKey[];
  win: number[];
  /** 7라운드 시작 전 공개 점수 1위들 */
  leaderBefore7: number[];
  /** 6라운드 시작 전 공개 점수 단독 1위 (없으면 -1) */
  leaderBefore6: number;
  hiddenChanged: boolean;
  roundFees: number[];
  club: number[];
  exposed: boolean[];
}

function play(seats: PersonaKey[]): GameOut {
  let s: GameState = createGame(
    seats.map((p, i) => ({ name: `${p}${i}`, kind: 'ai' as const, persona: p })),
    rng.int(2 ** 31),
  );
  let leaderBefore7: number[] = [];
  let leaderBefore6 = -1;
  const roundFees: number[] = [];
  while (s.phase !== 'guess') {
    if (s.round === 7) {
      const top = Math.max(...s.agents.map((a) => a.score));
      leaderBefore7 = s.agents.flatMap((a, i) => (a.score === top ? [i] : []));
    }
    if (s.round === 6) {
      const top = Math.max(...s.agents.map((a) => a.score));
      const ls = s.agents.flatMap((a, i) => (a.score === top ? [i] : []));
      leaderBefore6 = ls.length === 1 ? ls[0]! : -1;
    }
    s = resolveRound(s, {});
    roundFees.push(s.results.at(-1)!.entries.reduce((x, e) => x + (e.fee ?? 0), 0));
    s = nextRound(s);
  }
  s = finishGame(s, {});
  const ws = winners(s);
  const vis = s.agents.map((a) => a.score);
  const visTop = Math.max(...vis);
  return { seats, win: s.agents.map((_, i) => (ws.includes(i) ? 1 / ws.length : 0)), leaderBefore7, leaderBefore6, hiddenChanged: !ws.some((w) => vis[w] === visTop), roundFees, club: s.agents.map((a) => a.final!.clubPoints), exposed: s.agents.map((a) => a.final!.exposed) };
}

const shuffle = <T>(xs: T[]) => rng.shuffle(xs);
/** 좌석을 매판 섞어 좌석 편향을 상쇄하면서, 페르소나별 1석당 승률을 잰다 */
function series(make: () => PersonaKey[], games: number) {
  const per = new Map<PersonaKey, { seats: number; wins: number }>();
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
  const rate = (p: PersonaKey) => {
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

log(`# AI 플레이테스터 리그 (seed ${SEED}, 대진당 ${GAMES}판, 규칙 ${JSON.stringify(RULES)})`);
for (const N of COUNTS) {
  const fair = 1 / N;
  log(`\n## ${N}인 (공정값 ${pct(fair)})`);

  // 좌석 편향: 균형형만으로 (좌석 고정)
  if (want('seat')) {
  const seatWins = Array<number>(N).fill(0);
  const SEAT_GAMES = GAMES * 5;
  for (let g = 0; g < SEAT_GAMES; g++) play(Array(N).fill('balanced')).win.forEach((w, i) => (seatWins[i]! += w));
  const seatDev = Math.max(...seatWins.map((w) => Math.abs(w / SEAT_GAMES - fair)));
  log(`- ${mark(seatDev <= 0.02)} ③-1 좌석 편향 (${SEAT_GAMES}판): ${seatWins.map((w) => pct(w / SEAT_GAMES)).join(' / ')} (최대 편차 ${pct(seatDev)})`);
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
    const mixed: PersonaKey[] = ['balanced', 'greedy', 'cautious', 'deducer', 'stealth'];
    const sr = series(() => [...shuffle(mixed).slice(0, N - 1), 'random'], GAMES);
    const thinkers = mixed.filter((p) => !Number.isNaN(sr.rate(p)));
    const seatsWins = sr.outs.reduce((a, o) => a + o.seats.reduce((x, p, i) => x + (p === 'random' ? 0 : o.win[i]!), 0), 0) / (sr.outs.length * (N - 1));
    skillOk &&= seatsWins > sr.rate('random');
    skill.push(`서로 다른 생각형 ${N - 1}명: 1석당 ${pct(seatsWins)} vs 무작위 ${pct(sr.rate('random'))} (${thinkers.length}종 섞음)`);
    const clones = series(() => [...Array(N - 1).fill('balanced'), 'random'], GAMES);
    skill.push(`참고: 똑같은 균형형 ${N - 1}명 ${pct(clones.rate('balanced'))} vs 무작위 ${pct(clones.rate('random'))}`);
  }
  log(`- ${mark(skillOk)} ③-3 실력 보상: ${skill.join(' / ')}`);
  }

  // 킹메이킹: 방해형 1 + 균형형 N-1 vs 균형형 N. 6라운드 시작 때 단독 선두의 우승률
  const without = series(() => Array(N).fill('balanced'), want('king') || want('core') ? GAMES : 0);
  if (want('king')) {
  const leadWin = (outs: GameOut[]) => {
    const xs = outs.filter((o) => o.leaderBefore6 >= 0 && o.seats[o.leaderBefore6] !== 'spoiler');
    return xs.reduce((a, o) => a + o.win[o.leaderBefore6]!, 0) / Math.max(1, xs.length);
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

  // ① 핵심 장치가 결정을 바꾸는가
  if (want('core')) {
  const ign = series(() => ['ignore', ...shuffle(RATIONAL.filter((p) => p !== 'ignore')).slice(0, N - 1)], GAMES).rate('ignore');
  const hidden = league.outs.filter((o) => o.hiddenChanged).length / league.outs.length;
  const diag = without.outs;
  const clubAvg = diag.reduce((a, o) => a + o.club.reduce((x, y) => x + y, 0), 0) / (diag.length * N);
  const expRate = diag.reduce((a, o) => a + o.exposed.filter(Boolean).length, 0) / (diag.length * N);
  log(`  - 참고: 균형형끼리 비밀 구단 보너스 평균 ${Math.round(clubAvg * 10) / 10}억, 노출률 ${pct(expRate)}`);
  log(`- ${mark(ign <= 0.8 * fair)} ①-a 비밀 구단 무시형 승률 ${pct(ign)} (기준 ≤ ${pct(0.8 * fair)})`);
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
  const flip = league.outs.filter((o) => !o.leaderBefore7.some((l) => o.win[l]! > 0)).length / league.outs.length;
  log(`- ${mark(flip >= 0.25)} ④-c 마지막 2라운드에서 1위가 바뀐 판 ${pct(flip)}`);
  }
}
