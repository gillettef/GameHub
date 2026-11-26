/**
 * 한 판 진행 + 지표 수집 (워커와 본 프로세스가 같이 쓴다).
 */
import { evalBalanced, makeBot } from './bots.js';
import { Game, mulberry32, type LabRules } from './engine.js';

export interface GameOut {
  P: number;
  bots: string[];
  winner: number;
  scores: number[];
  land: number[];
  goalPts: number[];
  goals: string[];
  species: string[];
  /** 라운드 끝 점수 기록 */
  history: number[][];
  turns: number;
  flips: number;
  flipTurns: number;
  claims: number;
  discards: number;
  plays: number[];
  /** 자리별 심은 식물 id 개수 */
  planted: Record<string, number>[];
  maxCubes: number[];
  maxStack: number;
  /** 결정 지표 (instrument 일 때) */
  decisions: { n: number; gap: number; spread: number; close: number }[];
  /** 큐브 놓기·걷기 동작 수 (오프라인 손 작업) */
  cubeOps: number;
  lastRoundFlips: number;
  /** 내 땅 위 식물 수 (동점 깨기: 많을수록 이긴다) */
  plantsOnLand: number[];
  /** 행동 고르기: 행동별 횟수 */
  actionCount: Record<'place' | 'move' | 'gather' | 'call', number>;
  choreCount: Record<string, number>;
  sameAsLast: number;
}

export function playGame(rules: LabRules, P: number, seed: number, botNames: string[], instrument = false): GameOut {
  const g = new Game(rules, P, seed);
  const bots = botNames.map(makeBot);
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const planted: Record<string, number>[] = Array.from({ length: P }, () => ({}));
  const maxCubes = new Array(P).fill(0);
  let maxStack = 0;
  let cubeOps = 0;
  const decisions: GameOut['decisions'] = [];
  let guard = 0;
  const totalTurnsEstimate = (rules.gardenSize[P] ?? 6) * (rules.copies[P] ?? 4);
  let lastRoundFlips = 0;
  while (!g.over && guard++ < 2000) {
    const s = g.current;
    if (g.needs() === 'draft') {
      const bot = bots[s] as ReturnType<typeof makeBot>;
      g.doDraft(bot.draft ? bot.draft(g, s, rand) : 0);
      continue;
    }
    if (g.needs() === 'take') {
      const bot = bots[s] as ReturnType<typeof makeBot>;
      if (rules.actions && bot.action) {
        const before = g.inf.map((a) => a.slice());
        const look3 = rules.chores?.peekMode === 'look3' && g.choreOf[s] === 'peek';
        if (look3) g.peekOpen();
        const act = bot.action(g, s, rand);
        if (act.kind === 'place') {
          g.doTake(act.take);
          if (look3) g.peekClose();
          else if (rules.chores && g.choreOf[s] === 'peek') g.takeExtra();
        } else {
          if (look3) g.peekClose();
          g.doAction(act);
          for (let p = 0; p < P; p++) {
            const A = before[p] as Int16Array;
            const B = g.inf[p] as Int16Array;
            for (let c = 0; c < g.geo.n; c++) {
              cubeOps += Math.abs((B[c] as number) - (A[c] as number));
              if ((B[c] as number) > maxStack) maxStack = B[c] as number;
            }
          }
        }
        continue;
      }
      g.doTake(bot.take(g, s, rand));
      continue;
    }
    if (instrument && g.turns % 2 === 0) {
      const ms = g.moves(s);
      if (ms.length > 1) {
        // 같은 (카드, 칸) 의 회전·씨앗 중 최선만 남겨 "서로 다른 자리" 단위로 본다
        const byPlace = new Map<string, number>();
        for (const m of ms) {
          const v = m.cell >= 0 ? g.tryMove(s, m, () => evalBalanced(g, s)) : -99;
          const k = `${g.hands[s]![m.hand]}:${m.cell}`;
          byPlace.set(k, Math.max(byPlace.get(k) ?? -Infinity, v));
        }
        const vals = [...byPlace.values()].sort((a, b) => b - a);
        const best = vals[0] as number;
        const med = vals[Math.floor(vals.length / 2)] as number;
        if (vals.length > 1) decisions.push({ n: vals.length, gap: best - (vals[1] as number), spread: best - med, close: vals.filter((v) => v >= best - 1).length });
      }
    }
    const before = g.inf.map((a) => a.slice());
    const m = (bots[s] as ReturnType<typeof makeBot>).plant(g, s, rand);
    const sp = m.hand >= 0 && m.cell >= 0 ? (g.hands[s]![m.hand] as number) : -1;
    g.doPlant(m);
    for (let p = 0; p < P; p++) {
      const A = before[p] as Int16Array;
      const B = g.inf[p] as Int16Array;
      for (let c = 0; c < g.geo.n; c++) {
        cubeOps += Math.abs((B[c] as number) - (A[c] as number));
        if ((B[c] as number) > maxStack) maxStack = B[c] as number;
      }
    }
    if (sp >= 0) {
      const id = g.rules.species[sp]!.id;
      planted[s]![id] = (planted[s]![id] ?? 0) + 1;
    }
    const cb = g.cubesOnBoard();
    cb.forEach((v, p) => (maxCubes[p] = Math.max(maxCubes[p], v)));
    const rec = g.records[g.records.length - 1]!;
    if (g.turns > totalTurnsEstimate - P) lastRoundFlips += rec.flips;
  }
  const recs = g.records;
  return {
    P,
    bots: botNames,
    winner: g.winner(),
    scores: g.scores(),
    land: g.land(),
    goalPts: g.goalScores(),
    goals: g.goals.map((x) => x.id),
    species: g.speciesIds.map((i) => g.rules.species[i]!.id),
    history: g.history,
    turns: g.turns,
    flips: recs.reduce((a, r) => a + r.flips, 0),
    flipTurns: recs.filter((r) => r.flips > 0).length,
    claims: recs.reduce((a, r) => a + r.claims, 0),
    discards: recs.filter((r) => r.discard).length,
    plays: g.plays,
    planted,
    maxCubes,
    maxStack,
    decisions,
    cubeOps,
    lastRoundFlips,
    plantsOnLand: g.plantsOnLand(),
    actionCount: { ...g.actionCount },
    choreCount: { ...g.choreCount },
    sameAsLast: g.sameAsLast,
  };
}
