/**
 * 지표 집계와 5개 평가지표 점수표 (2025·2026 코리아보드게임즈 공모전 심사평에서 뽑은 기준, notes/Contest.md).
 * 시뮬레이션으로 잴 수 있는 것은 수치로, 잴 수 없는 것(독창성)은 체크리스트로 매긴다.
 */
import type { LabRules } from './engine.js';
import type { GameOut } from './play.js';
import { bestKomi } from './komi.js';

export interface Summary {
  P: number;
  n: number;
  seatWin: number[];
  seatDev: number;
  meanScore: number;
  meanLand: number;
  meanGoal: number;
  marginMedian: number;
  marginRatio: number;
  closeRate: number;
  leadChanges: number;
  comeback: number;
  flipsPerTurn: number;
  flipTurnRate: number;
  lastRoundFlips: number;
  discardRate: number;
  equalPlays: boolean;
  maxCubes: number;
  maxStack: number;
  cubeOpsPerTurn: number;
  decN: number;
  decSpread: number;
  decGap: number;
  decClose: number;
  speciesWin: Record<string, number>;
  speciesSpread: number;
  greedyVsRandom: number;
  lookVsGreedy: number;
  archShare: Record<string, number>;
  archEntropy: number;
  goalShare: number;
  winnerSpeciesEntropy: number;
  minutes: number;
  turnsPerPlayer: number;
  tieRate: number;
  /** 덤을 다시 고른 결과 (LAB_KOMI=1) */
  komiBest?: { komi: number[]; rates: number[]; dev: number };
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] as number;
};
function entropy(counts: number[]): number {
  const tot = counts.reduce((a, b) => a + b, 0);
  if (!tot || counts.length < 2) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) h -= (c / tot) * Math.log(c / tot);
  return h / Math.log(counts.length);
}

export function summarize(rules: LabRules, P: number, res: (GameOut & { scenario: string })[]): Summary {
  const self = res.filter((r) => r.scenario === 'self');
  let komiBest: Summary['komiBest'];
  if (process.env.LAB_KOMI) {
    const komi = rules.komi[P] ?? new Array(P).fill(0);
    komiBest = bestKomi(self.map((r) => ({ scores: r.scores.map((v, i) => v - (komi[i] ?? 0)), land: r.land, plantsOnLand: r.plantsOnLand })), 4);
  }
  const seatWins = new Array(P).fill(0);
  for (const r of self) seatWins[r.winner]++;
  const seatWin = seatWins.map((w) => w / self.length);
  const seatDev = Math.max(...seatWin.map((w) => Math.abs(w - 1 / P))) * 100;

  const margins: number[] = [];
  const ratios: number[] = [];
  let close = 0;
  let ties = 0;
  let leadChanges = 0;
  let comeback = 0;
  for (const r of self) {
    const s = [...r.scores].sort((a, b) => b - a);
    const m = (s[0] as number) - (s[1] as number);
    margins.push(m);
    ratios.push(m / Math.max(1, s[0] as number));
    if (m <= 3) close++;
    if (m === 0) {
      const top = r.scores.map((v, i) => (v === s[0] ? i : -1)).filter((i) => i >= 0);
      const bestLand = Math.max(...top.map((i) => r.land[i] as number));
      const tops = top.filter((i) => r.land[i] === bestLand);
      const mostPlants = Math.max(...tops.map((i) => r.plantsOnLand[i] as number));
      if (tops.filter((i) => r.plantsOnLand[i] === mostPlants).length > 1) ties++;
    }
    let lead = -1;
    for (const h of r.history) {
      const mx = Math.max(...h);
      const leaders = h.map((v, i) => (v === mx ? i : -1)).filter((i) => i >= 0);
      const L = leaders.length === 1 ? (leaders[0] as number) : lead;
      if (lead >= 0 && L !== lead) leadChanges++;
      lead = L;
    }
    const k = Math.floor((r.history.length * 2) / 3) - 1;
    const h = r.history[Math.max(0, k)];
    if (h) {
      const mx = Math.max(...h);
      if (h[r.winner] !== mx) comeback++;
    }
  }

  // 식물: 심은 장수 가중 승률
  const spW: Record<string, number> = {};
  const spN: Record<string, number> = {};
  const winnerTop: Record<string, number> = {};
  for (const r of self) {
    r.planted.forEach((pl, seat) => {
      for (const [id, k] of Object.entries(pl)) {
        spN[id] = (spN[id] ?? 0) + k;
        if (seat === r.winner) spW[id] = (spW[id] ?? 0) + k;
      }
    });
    const wp = r.planted[r.winner] ?? {};
    const top = Object.entries(wp).sort((a, b) => b[1] - a[1])[0];
    if (top) winnerTop[top[0]] = (winnerTop[top[0]] ?? 0) + 1;
  }
  const speciesWin: Record<string, number> = {};
  for (const id of Object.keys(spN)) if ((spN[id] ?? 0) >= 30) speciesWin[id] = (spW[id] ?? 0) / (spN[id] as number);
  const sv = Object.values(speciesWin);
  const speciesSpread = sv.length ? (Math.max(...sv) - Math.min(...sv)) * 100 : 0;

  const gr = res.filter((r) => r.scenario === 'gr');
  const greedyVsRandom = gr.length ? gr.filter((r) => r.bots[r.winner] === 'greedy').length / gr.length : 0;
  const lg = res.filter((r) => r.scenario === 'lg');
  const lookVsGreedy = lg.length ? lg.filter((r) => r.bots[r.winner] === 'lookahead').length / lg.length : 0;

  const arch = res.filter((r) => r.scenario === 'arch');
  const app: Record<string, number> = {};
  const win: Record<string, number> = {};
  for (const r of arch) {
    r.bots.forEach((b) => (app[b] = (app[b] ?? 0) + 1));
    const b = r.bots[r.winner] as string;
    win[b] = (win[b] ?? 0) + 1;
  }
  const archShare: Record<string, number> = {};
  for (const b of Object.keys(app)) archShare[b] = (win[b] ?? 0) / (app[b] as number) / (1 / P);
  const archEntropy = entropy(Object.keys(app).map((b) => win[b] ?? 0));

  const turns = mean(self.map((r) => r.turns));
  const cubeOps = mean(self.map((r) => r.cubeOps / Math.max(1, r.turns)));
  const decs = self.flatMap((r) => r.decisions);
  // 예상 시간: 차례당 (생각 15초 + 큐브 한 개 2초 + 가져오기 6초) + 끝 점수 세기(칸 12개당 1분)
  const cells = P === 2 ? 49 : P === 3 ? 91 : 105;
  const minutes = (turns * (15 + 2 * cubeOps + 6)) / 60 + cells / 12 / 1 + 2;

  return {
    P,
    n: self.length,
    seatWin,
    seatDev,
    meanScore: mean(self.flatMap((r) => r.scores)),
    meanLand: mean(self.flatMap((r) => r.land)),
    meanGoal: mean(self.flatMap((r) => r.goalPts)),
    marginMedian: median(margins),
    marginRatio: median(ratios),
    closeRate: close / Math.max(1, self.length),
    leadChanges: leadChanges / Math.max(1, self.length),
    comeback: comeback / Math.max(1, self.length),
    flipsPerTurn: mean(self.map((r) => r.flips / Math.max(1, r.turns))),
    flipTurnRate: mean(self.map((r) => r.flipTurns / Math.max(1, r.turns))),
    lastRoundFlips: mean(self.map((r) => r.lastRoundFlips)),
    discardRate: mean(self.map((r) => r.discards / Math.max(1, r.turns))),
    equalPlays: self.every((r) => r.plays.every((p) => p === r.plays[0])),
    maxCubes: Math.max(...self.flatMap((r) => r.maxCubes)),
    maxStack: Math.max(...self.map((r) => r.maxStack)),
    cubeOpsPerTurn: cubeOps,
    decN: mean(decs.map((d) => d.n)),
    decSpread: mean(decs.map((d) => d.spread)),
    decGap: mean(decs.map((d) => d.gap)),
    decClose: mean(decs.map((d) => d.close)),
    speciesWin,
    speciesSpread,
    greedyVsRandom,
    lookVsGreedy,
    archShare,
    archEntropy,
    goalShare: mean(self.map((r) => (r.goalPts[r.winner] as number) / Math.max(1, r.scores[r.winner] as number))),
    winnerSpeciesEntropy: entropy(Object.values(winnerTop).concat(new Array(Math.max(0, (rules.gardenSize[P] ?? 6) - Object.keys(winnerTop).length)).fill(0))),
    minutes,
    turnsPerPlayer: turns / P,
    tieRate: ties / Math.max(1, self.length),
    komiBest,
  };
}

/** x 가 bad 이면 1점, good 이면 5점, 사이는 직선. good < bad 여도 된다 */
export function lin(x: number, bad: number, good: number): number {
  const t = (x - bad) / (good - bad);
  return 1 + 4 * Math.max(0, Math.min(1, t));
}
/** 구간 [lo, hi] 안이면 5점, 밖으로 width 만큼 벗어나면 1점 */
function band(x: number, lo: number, hi: number, width: number): number {
  if (x >= lo && x <= hi) return 5;
  const d = x < lo ? lo - x : x - hi;
  return Math.max(1, 5 - (4 * d) / width);
}

/** 규칙 짐: 플레이어가 외워야 하는 규칙 단위 수 (카드에 그림으로 다 적히는 뿌리 모양은 0.25) */
export function ruleLoad(rules: LabRules, Ps: number[] = [2, 3, 4]): { units: number; parts: Record<string, number> } {
  const parts: Record<string, number> = {
    '준비(보드·목표·식물)': 1.5,
    '가져오기': 1,
    '심을 칸': rules.plantOn === 'adjacent' ? 1.5 : 1,
    '뿌리 놓기·회전': rules.rotate ? 1.25 : 1,
    '칸 주인': rules.mode === 'tug' ? 1 : 1.25,
    '끝·점수': 1,
    '목표 3장': 1,
  };
  if (rules.flow === 'round') parts['라운드 두 단계'] = 1;
  if (rules.noCell === 'entrance') parts['심을 칸 없을 때'] = 0.5;
  else parts['버리기'] = 0.5;
  if (rules.cap) parts['한 칸 큐브 상한'] = 0.5;
  if (rules.supply && Object.values(rules.supply).some((v) => v > 0)) parts['뿌리 공급 한정(모자라면 옮기기)'] = 0.75;
  // 평가하는 인원의 규칙서에 들어가는 덤만 센다 (2026-10-16 사용자 지시: 2·3인 기준)
  const k = Ps.some((P) => (rules.komi[P] ?? []).some((x) => x !== 0));
  if (k) parts['순서 보너스'] = 0.5;
  if (rules.fertileBonus) parts['기름진 땅'] = 0.5;
  // 식물 능력: 뿌리 모양 외의 문장 하나당 0.5 (한 판에 쓰는 식물 비율 반영)
  const abil = rules.species.filter((s) => s.ability).length;
  parts['식물 능력 문장'] = 0.5 * abil * Math.min(1, (rules.gardenSize[3] ?? 6) / rules.species.length);
  for (const h of rules.extraRules ?? []) parts[h] = 0.75;
  return { units: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

export function originality(rules: LabRules): { score: number; parts: Record<string, number> } {
  // 기준선: 육각 영역 다수결 + 카드 고르기 = 흔하다 (엘 그란데, 킹덤 빌더, 캐스캐디아 등) → 2.5
  const parts: Record<string, number> = { '육각 영역 다수결 기본': 2.5 };
  if (rules.mode === 'tug') parts['뿌리 줄다리기(한 칸 한 색, 1:1로 밀어내기)'] = 1.0;
  parts['식물은 주인이 없다(땅 주인 것)'] = 0.5;
  if (rules.rotate) parts['뿌리 모양 회전'] = 0.25;
  for (const h of rules.hooks ?? []) parts[h] = 0.5;
  const score = Math.min(5, Object.values(parts).reduce((a, b) => a + b, 0));
  return { score, parts };
}

export function rubric(rules: LabRules, sums: Summary[]) {
  const per = (f: (s: Summary) => number) => mean(sums.map(f));
  const fair = (s: Summary) => 1 / s.P;

  const load = ruleLoad(rules, sums.map((x) => x.P));
  const complexity = {
    '규칙 짐': lin(load.units, 16, 10),
    '차례당 큐브 손작업': per((s) => lin(s.cubeOpsPerTurn, 10, 4)),
    '예상 시간': per((s) => lin(s.minutes / (s.P === 2 ? 20 : s.P === 3 ? 30 : 40), 1.8, 1.0)),
    '전략 깊이(탐욕>무작위)': per((s) => lin((s.greedyVsRandom - fair(s)) / (1 - fair(s)), 0.4, 0.9)),
    '전략 깊이(앞보기>탐욕)': per((s) => lin((s.lookVsGreedy - fair(s)) / (1 - fair(s)), 0.0, 0.25)),
    '부품 부담(1인 큐브)': per((s) => lin(s.maxCubes, 90, 40)),
  };
  const fun = {
    '접전(1·2등 차 비율)': per((s) => lin(s.marginRatio, 0.25, 0.06)),
    '선두 교체': per((s) => lin(s.leadChanges, 0.5, 3)),
    '역전': per((s) => lin(s.comeback, 0.1, 0.35)),
    '상호작용(뒤집는 수 비율)': per((s) => lin(s.flipTurnRate, 0.1, 0.5)),
    '결정의 무게(최선−중앙)': per((s) => lin(s.decSpread, 0.5, 3)),
    '고민거리(1점 안 후보)': per((s) => band(s.decClose, 2, 8, 4)),
  };
  const balance = {
    '자리 승률': per((s) => lin(s.seatDev, 12, s.P === 2 ? 2.5 : 3)),
    '식물 승률 폭': per((s) => lin(s.speciesSpread / (100 * fair(s)), 0.6, 0.15)),
    '전략 독식 없음': per((s) => lin(Math.max(...Object.values(s.archShare)), 2.0, 1.25)),
    '전략 고사 없음': per((s) => lin(Math.min(...Object.values(s.archShare)), 0.3, 0.75)),
    '규칙 허점(버림·동점·심기 수)': per((s) => Math.min(lin(s.discardRate, 0.05, 0.005), lin(s.tieRate, 0.12, 0.03), s.equalPlays ? 5 : 1)),
  };
  const replay = {
    '이기는 전략 다양성': per((s) => lin(s.archEntropy, 0.5, 0.9)),
    '목표 비중': per((s) => band(s.goalShare, 0.2, 0.4, 0.2)),
    '이긴 식물 다양성': per((s) => lin(s.winnerSpeciesEntropy, 0.5, 0.85)),
    '판 구성 가짓수': lin(Math.log10(setupCombos(rules)), 3, 6),
  };
  const orig = originality(rules);
  const avg = (o: Record<string, number>) => mean(Object.values(o));
  const scores = {
    originality: orig.score,
    complexity: avg(complexity),
    fun: avg(fun),
    balance: avg(balance),
    replay: avg(replay),
  };
  const vals = Object.values(scores);
  return {
    ...scores,
    mean: mean(vals),
    min: Math.min(...vals),
    detail: { 독창성: orig.parts, 복잡성: complexity, 재미: fun, 밸런스: balance, 리플레이성: replay, 규칙짐: { 합계: load.units, ...load.parts } },
  };
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}
export function setupCombos(rules: LabRules): number {
  const goals = choose(rules.goals.length, rules.goalCount);
  const sp = choose(rules.species.length, rules.gardenSize[3] ?? 6);
  const tiles = Math.pow(6, 7) * 5040; // 2인 기준 조각 순서·회전 (대략)
  return goals * sp * Math.min(tiles, 1e4);
}
