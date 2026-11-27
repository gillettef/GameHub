/**
 * 실험실 엔진(lab/engine.ts) 과 정본 엔진(src/engine) 이 같은 수에서 같은 결과를 내는지 대조한다.
 *   npx tsx tools/lab/parity.ts [판수=30] [변형=o1r20]
 * 2026-11-27 정본이 v8 「행동 하나」(실험실 o1r20)가 되어 기본은 o1r20 대조(runOne)다. v7 「골목 일과」(c5) 대조 코드는 지웠다(git 기록).
 * 행동 하나가 아닌 변형(v5·v6)은 정본 흐름과 달라 더는 맞지 않는다(run 코드는 기록으로 남긴다).
 * 실험실 판의 보드·목표·식물·카드 순서를 정본 상태에 그대로 옮기고, 실험실 봇의 수를 양쪽에 둔 뒤
 * 매 수마다 칸별 큐브·점수·차례·라운드 선을 비교한다.
 */
import { applyAction, createInitialState, createPlayer, entranceRoots, joinPlayer, startGame, computeScores, rotateSpot } from '../../src/engine/index.js';
import { getSpecies } from '../../src/engine/data/species.js';
import type { Action, Board, Cell, GameState, GoalId, SpeciesId } from '../../src/engine/types.js';
import { makeBot } from './bots.js';
import { FERTILE, Game, POND, ROCK, mulberry32 } from './engine.js';
import { VARIANTS } from './registry.js';

const TERRAIN: Record<number, Cell['terrain']> = { 0: 'empty', [POND]: 'pond', [ROCK]: 'rock', [FERTILE]: 'fertile' };

function toEngine(g: Game): GameState {
  let s = createInitialState('parity', 1);
  for (let i = 0; i < g.P; i++) s = joinPlayer(s, createPlayer(`p${i}`, `P${i}`, 'ai')).state;
  s = startGame(s);
  const cells: Cell[] = [];
  for (let c = 0; c < g.geo.n; c++) cells.push({ q: g.geo.q[c] as number, r: g.geo.r[c] as number, terrain: TERRAIN[g.geo.terrain[c] as number]!, tile: g.geo.tile[c] as number });
  const board: Board = { cells, entrances: g.geo.entrances.map((c) => ({ q: g.geo.q[c] as number, r: g.geo.r[c] as number })), tileCount: g.geo.tileCount };
  const sp = (i: number) => g.rules.species[i]!.id as SpeciesId;
  s = {
    ...s,
    board,
    goals: g.goals.map((x) => x.id as GoalId),
    species: g.speciesIds.map(sp),
    market: g.market.map(sp),
    pile: [...g.bag].reverse().map(sp),
    players: s.players.map((p) => ({ ...p, hand: g.hands[p.seat]!.map(sp), isReady: true })),
    rootSeat: new Array(cells.length).fill(-1),
    rootCount: new Array(cells.length).fill(0),
    plants: [],
  };
  s = { ...s, ...entranceRoots(s) };
  // 공개 단계 확인은 AI 라 이미 끝났고 startGame 이 1라운드를 열었다. 보드를 바꿨으니 차례를 다시 맞춘다
  return { ...s, phase: 'playing', round: 1, roundStart: 0, currentPlayerId: 'p0', stage: 'act' };
}

function rotationOf(g: Game, spIdx: number, rotIdx: number): number {
  const target = (g.rotCache[spIdx] as [number, number, number][][])[rotIdx]!;
  const key = (a: { dq: number; dr: number; n: number }[]) =>
    a
      .map((x) => `${x.dq},${x.dr},${x.n}`)
      .sort()
      .join(';');
  const want = key(target.map(([dq, dr, n]) => ({ dq, dr, n })));
  const roots = getSpecies(g.rules.species[spIdx]!.id as SpeciesId).roots;
  for (let k = 0; k < 6; k++) if (key(roots.map((x) => rotateSpot(x, k))) === want) return k;
  throw new Error('회전을 찾지 못함');
}

/** 칸별 큐브와 점수 비교 */
function compareCubes(g: Game, s: GameState, where: string): void {
  const idxOf = new Map(s.board!.cells.map((c, i) => [`${c.q},${c.r}`, i]));
  for (let c = 0; c < g.geo.n; c++) {
    const e = idxOf.get(`${g.geo.q[c]},${g.geo.r[c]}`)!;
    const labSeat = g.color[c] as number;
    const labN = labSeat >= 0 ? ((g.inf[labSeat] as Int16Array)[c] as number) : 0;
    const engSeat = (s.rootCount[e] ?? 0) > 0 ? (s.rootSeat[e] as number) : -1;
    const engN = s.rootCount[e] ?? 0;
    if (labSeat !== engSeat || labN !== engN) throw new Error(`${where}: 칸 (${g.geo.q[c]},${g.geo.r[c]}) 실험실 ${labSeat}×${labN} / 정본 ${engSeat}×${engN}`);
  }
  const ls = g.scores();
  const es = computeScores(s);
  s.players.forEach((p) => {
    if (ls[p.seat] !== es[p.id]!.total) throw new Error(`${where}: 점수 자리${p.seat} 실험실 ${ls[p.seat]} / 정본 ${es[p.id]!.total}`);
  });
}

/** v5·v6 대조(옛 흐름, 지금 정본과는 맞지 않는다): 큐브·점수 + 차례·단계·라운드 선 */
function compare(g: Game, s: GameState, where: string): void {
  compareCubes(g, s, where);
  if (!g.over) {
    if (s.phase !== 'playing') throw new Error(`${where}: 정본이 먼저 끝남`);
    if (s.currentPlayerId !== `p${g.current}`) throw new Error(`${where}: 차례 실험실 ${g.current} / 정본 ${s.currentPlayerId}`);
    if ((s.stage as string) !== g.stage) throw new Error(`${where}: 단계 실험실 ${g.stage} / 정본 ${s.stage}`);
    if (s.roundStart !== g.roundStart) throw new Error(`${where}: 라운드 선 실험실 ${g.roundStart} / 정본 ${s.roundStart}`);
  } else if (s.phase !== 'finished') throw new Error(`${where}: 실험실만 끝남`);
}

function run(games: number, name: string): void {
  const rules = VARIANTS[name]!;
  let moves = 0;
  for (let i = 0; i < games; i++) {
    const P = 2 + (i % 3);
    const g = new Game(rules, P, 4242 + i);
    let s = toEngine(g);
    compare(g, s, `판 ${i} 시작`);
    const bots = Array.from({ length: P }, (_, k) => makeBot(k % 2 ? 'human' : 'greedy'));
    const rand = mulberry32(99 + i);
    let guard = 0;
    while (!g.over && guard++ < 500) {
      const seat = g.current;
      const pid = `p${seat}`;
      if (g.needs() === 'take') {
        const t = bots[seat]!.take(g, seat, rand);
        const idx = t === -1 && g.rules.blindDraw && g.bag.length ? -1 : Math.max(0, Math.min(g.market.length - 1, t));
        g.doTake(idx);
        const r = applyAction(s, { type: 'TAKE', playerId: pid, take: idx === -1 ? 'pile' : idx });
        if (r.error) throw new Error(`판 ${i} 가져오기 거부: ${r.error}`);
        s = r.state;
      } else {
        const m = bots[seat]!.plant(g, seat, rand);
        if (m.cell >= 0) {
          const spIdx = g.hands[seat]![m.hand] as number;
          const species = g.rules.species[spIdx]!.id as SpeciesId;
          const rotation = rotationOf(g, spIdx, m.rot);
          const pos = { q: g.geo.q[m.cell] as number, r: g.geo.r[m.cell] as number };
          const seed = m.extra >= 0 ? { q: g.geo.q[m.extra] as number, r: g.geo.r[m.extra] as number } : undefined;
          g.doPlant(m);
          const r = applyAction(s, { type: 'PLANT', playerId: pid, species, pos, rotation: rotation as 0, ...(seed ? { seed } : {}) });
          if (r.error) throw new Error(`판 ${i} 심기 거부: ${r.error} (${species} ${pos.q},${pos.r})`);
          s = r.state;
        } else {
          const spIdx = g.hands[seat]![Math.max(0, m.hand)] as number;
          g.doPlant(m);
          const r = applyAction(s, { type: 'DISCARD', playerId: pid, species: g.rules.species[spIdx]!.id as SpeciesId });
          if (r.error) throw new Error(`판 ${i} 버리기 거부: ${r.error}`);
          s = r.state;
        }
        moves++;
      }
      compare(g, s, `판 ${i} 수 ${g.turns}`);
    }
    const lw = g.winner();
    const ew = s.result?.ranking[0];
    if (ew !== `p${lw}`) throw new Error(`판 ${i}: 승자 실험실 ${lw} / 정본 ${ew}`);
  }
  console.log(`일치: ${games}판 ${moves}수 (실험실 = 정본)`);
}

// ---------------------------------------------------------------------------
// v8 「행동 하나」 대조 (실험실 o1r20 ↔ 정본). npx tsx tools/lab/parity.ts [판수] o1r20
// ---------------------------------------------------------------------------

/**
 * 실험실 봇의 행동(take2 · plant · call · pass)을 정본 행동으로 옮겨 양쪽에 둔다.
 * 정본은 할 수 있는 게 없는 사람을 스스로 건너뛰므로(기록 pass), 실험실의 pass 는 정본에 두지 않는다.
 * 큐브·점수는 매 수 비교하고, 차례·라운드 선은 실험실이 행동 고르기 단계이고 라운드가 같을 때 비교한다.
 */
function runOne(games: number, name: string): void {
  const rules = VARIANTS[name]!;
  if (!rules.one) throw new Error(`${name} 은 「행동 하나」 변형이 아닙니다`);
  const max = rules.one.handMax;
  let moves = 0;
  let passes = 0;
  for (let i = 0; i < games; i++) {
    const P = 2 + (i % 3);
    const g = new Game(rules, P, 4242 + i);
    let s = toEngine(g);
    const sp = (x: number) => g.rules.species[x]!.id as SpeciesId;
    const at = (c: number) => ({ q: g.geo.q[c] as number, r: g.geo.r[c] as number });
    compareOne(g, s, `판 ${i} 시작`);
    const bots = Array.from({ length: P }, (_, k) => makeBot(k % 2 ? 'human' : 'greedy'));
    const rand = mulberry32(99 + i);
    let guard = 0;
    while (!g.over && guard++ < 800) {
      const seat = g.current;
      const pid = `p${seat}`;
      const apply = (a: Action, what: string) => {
        const r = applyAction(s, a);
        if (r.error) throw new Error(`판 ${i} ${what} 거부: ${r.error} (${JSON.stringify(a)})`);
        s = r.state;
      };
      if (g.needs() === 'plant') {
        const m = bots[seat]!.plant(g, seat, rand);
        if (m.cell >= 0) {
          const spIdx = g.hands[seat]![m.hand] as number;
          const rotation = rotationOf(g, spIdx, m.rot);
          const seed = m.extra >= 0 ? at(m.extra) : undefined;
          const pos = at(m.cell);
          g.doPlant(m);
          apply({ type: 'PLANT', playerId: pid, species: sp(spIdx), pos, rotation: rotation as 0, ...(seed ? { seed } : {}) }, '심기');
        } else {
          const spIdx = g.hands[seat]![Math.max(0, m.hand)] as number;
          g.doPlant(m);
          apply({ type: 'DISCARD', playerId: pid, species: sp(spIdx) }, '버리기');
        }
        moves++;
        compareOne(g, s, `판 ${i} 수 ${g.turns}`);
        continue;
      }
      const act = bots[seat]!.action!(g, seat, rand);
      if (act.kind === 'pass') {
        // 정본은 이미 건너뛰었어야 한다
        if (s.currentPlayerId === pid && s.round === g.round && s.phase === 'playing') throw new Error(`판 ${i}: 실험실은 쉬는데 정본은 자리 ${seat} 차례`);
        g.doAction(act);
        passes++;
        compareOne(g, s, `판 ${i} 쉼 ${g.turns}`);
        continue;
      }
      if (s.currentPlayerId !== pid || s.stage !== 'act') throw new Error(`판 ${i}: 차례 실험실 ${seat} / 정본 ${s.currentPlayerId} (${s.stage})`);
      if (act.kind === 'take2') {
        // 실험실 doTakeCards 와 같은 순서: 고른 종이 마켓에 있으면 그 카드, 없으면 더미 맨 위, 더미도 비면 마켓 맨 앞
        for (const p of act.picks) {
          if (s.currentPlayerId !== pid || s.players[seat]!.hand.length >= max) break;
          const k = p >= 0 ? s.market.indexOf(sp(p)) : -1;
          const take: number | 'pile' | null = k >= 0 ? k : s.pile.length ? 'pile' : s.market.length ? 0 : null;
          if (take === null) break;
          apply({ type: 'TAKE', playerId: pid, take }, '가져오기');
        }
        g.doAction(act);
        if (s.currentPlayerId === pid && (s.stage as string) === 'take') throw new Error(`판 ${i}: 실험실은 ${act.picks.length}장으로 끝, 정본은 두 번째 장을 기다림`);
      } else if (act.kind === 'plant') {
        g.doAction(act); // 실험실은 다음 단계(plant)에서 고른다
        continue;
      } else if (act.kind === 'call') {
        const rotation = rotationOf(g, g.plant[act.cell] as number, act.rot ?? (g.plantRot[act.cell] as number));
        g.doAction(act);
        apply({ type: 'CALL', playerId: pid, pos: at(act.cell), rotation: rotation as 0 }, '명당 부르기');
      } else throw new Error(`판 ${i}: o1 에 없는 행동 ${act.kind}`);
      moves++;
      compareOne(g, s, `판 ${i} 수 ${g.turns}`);
    }
    const lw = g.winner();
    const ew = s.result?.ranking[0];
    if (ew !== `p${lw}`) throw new Error(`판 ${i}: 승자 실험실 ${lw} / 정본 ${ew}`);
  }
  console.log(`일치: ${games}판 ${moves}수 (실험실 ${name} = 정본), 실험실 쉼 ${passes}번`);
}

/** 큐브·점수는 늘, 차례·선·라운드는 실험실이 행동 고르기 단계이고 라운드가 같을 때 비교한다 */
function compareOne(g: Game, s: GameState, where: string): void {
  compareCubes(g, s, where);
  if (g.over) {
    if (s.phase !== 'finished') throw new Error(`${where}: 실험실만 끝남`);
    return;
  }
  if (s.phase !== 'playing') throw new Error(`${where}: 정본이 먼저 끝남`);
  if (g.needs() !== 'take' || s.round !== g.round) return;
  if (s.roundStart !== g.roundStart) throw new Error(`${where}: 라운드 선 실험실 ${g.roundStart} / 정본 ${s.roundStart}`);
}

const variantName = process.argv[3] ?? 'o1r20';
const gameCount = Number(process.argv[2] ?? 30);
if (VARIANTS[variantName]?.one) runOne(gameCount, variantName);
else run(gameCount, variantName);
