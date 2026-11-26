/**
 * 실험실 엔진(lab/engine.ts) 과 정본 엔진(src/engine) 이 같은 수에서 같은 결과를 내는지 대조한다.
 *   npx tsx tools/lab/parity.ts [판수=30] [변형=c5]
 * 2026-11-26 정본이 v7 「골목 일과」(실험실 c5)가 되어 기본은 c5 대조(runChores)다. 일과가 없는 변형(v5·v6)은 정본 흐름과 달라
 * 더는 맞지 않는다(코드는 기록으로 남긴다).
 * 실험실 판의 보드·목표·식물·카드 순서를 정본 상태에 그대로 옮기고, 실험실 봇의 수를 양쪽에 둔 뒤
 * 매 수마다 칸별 큐브·점수·차례·라운드 선을 비교한다.
 */
import { applyAction, createInitialState, createPlayer, entranceRoots, joinPlayer, startGame, computeScores, rotateSpot } from '../../src/engine/index.js';
import { getSpecies } from '../../src/engine/data/species.js';
import type { Action, Board, Cell, ChoreId, GameState, GoalId, SpeciesId } from '../../src/engine/types.js';
import { makeBot } from './bots.js';
import { FERTILE, Game, PLACE_CHORES, POND, ROCK, mulberry32 } from './engine.js';
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
  return { ...s, phase: 'playing', round: 1, roundStart: 0, currentPlayerId: 'p0', stage: s.market.length ? 'take' : 'plant' };
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

/** v5·v6 대조: 큐브·점수 + 차례·단계·라운드 선 */
function compare(g: Game, s: GameState, where: string): void {
  compareCubes(g, s, where);
  if (!g.over) {
    if (s.phase !== 'playing') throw new Error(`${where}: 정본이 먼저 끝남`);
    if (s.currentPlayerId !== `p${g.current}`) throw new Error(`${where}: 차례 실험실 ${g.current} / 정본 ${s.currentPlayerId}`);
    if (s.stage !== g.stage) throw new Error(`${where}: 단계 실험실 ${g.stage} / 정본 ${s.stage}`);
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
// v7 「골목 일과」 대조 (실험실 c5 ↔ 정본). npx tsx tools/lab/parity.ts [판수] c5
// ---------------------------------------------------------------------------

/**
 * 실험실과 정본이 일부러 다른 곳 (정본 = Rules.md):
 *  - 일과 섞기 난수: 실험실은 따로 둔 RNG, 정본은 보드 시드. 라운드마다 정본의 펼친 일과를 실험실 것으로 맞춘다.
 *  - 생선 냄새로 마켓 카드를 가져올 때 실험실은 채운 카드를, 정본은 편 카드를 더미로 되돌린다(Rules.md 5.3).
 *    큐브·점수에는 영향이 없으므로 그때 정본의 마켓·더미를 실험실 순서로 맞춘다(맞춘 횟수를 출력한다).
 *  - 실험실 봇은 담 넘기·명당 부르기를 할 수 없으면 명당 놓기로 대신한다(실험실 엔진이 막지 않음). 정본은 쉰다(Rules.md 5.2).
 *    그 판은 거기서 대조를 멈추고 "실험실 쉼 차이"로 센다.
 *  - 실험실 봇은 생선 냄새 차례에도 더미 뒷면을 가져올 수 있다. 정본은 그 차례에 뒷면 대신 편 카드다(Rules.md 5.3).
 *    정본에서는 둘 수 없는 수라 정본 상태의 손·마켓·더미를 실험실 것으로 고쳐 심기 단계로 넘기고 이어 간다(횟수를 출력한다).
 */
function runChores(games: number, name: string): void {
  const rules = VARIANTS[name]!;
  if (!rules.chores) throw new Error(`${name} 은 골목 일과 변형이 아닙니다`);
  let moves = 0;
  let resynced = 0;
  let labIdle = 0;
  let labBlind = 0;
  let finished = 0;
  for (let i = 0; i < games; i++) {
    const P = 2 + (i % 3);
    const g = new Game(rules, P, 4242 + i);
    const base = toEngine(g);
    let s: GameState = { ...base, stage: 'chore', choreOffer: [...g.offer], chores: base.players.map(() => null), peek: null, turn: 1 };
    compareChores(g, s, `판 ${i} 시작`);
    const bots = Array.from({ length: P }, (_, k) => makeBot(k % 2 ? 'human' : 'greedy'));
    const rand = mulberry32(99 + i);
    let guard = 0;
    let stopped = false;
    while (!g.over && guard++ < 800) {
      const seat = g.current;
      const pid = `p${seat}`;
      const apply = (a: Action, what: string) => {
        const r = applyAction(s, a);
        if (r.error) throw new Error(`판 ${i} ${what} 거부: ${r.error} (${JSON.stringify(a)})`);
        s = r.state;
      };
      if (g.needs() === 'draft') {
        // 라운드 첫 고르기: 정본의 펼친 일과를 실험실 것으로 맞춘다(섞는 난수가 다르다)
        if (s.chores.every((c) => c === null)) s = { ...s, choreOffer: [...g.offer] };
        const k = bots[seat]!.draft!(g, seat, rand);
        const chore = g.offer[Math.max(0, Math.min(g.offer.length - 1, k))] as ChoreId;
        g.doDraft(k);
        apply({ type: 'PICK_CHORE', playerId: pid, chore }, '일과 고르기');
        continue;
      }
      // 차례 (실험실은 'take' 단계가 차례 전체)
      const look3 = g.choreOf[seat] === 'peek';
      if (look3) g.peekOpen();
      const act = bots[seat]!.action!(g, seat, rand);
      // 정본이 이 차례에 있는가 (정본은 할 일이 없는 사람을 건너뛰어 다음 라운드로 먼저 갈 수 있다)
      const here = s.currentPlayerId === pid && s.round === g.round && s.stage !== 'chore';
      if (!here) {
        if (act.kind !== 'place') throw new Error(`판 ${i}: 정본이 건너뛴 차례에 실험실이 ${act.kind}`);
        // 정본은 이 사람이 쉬었다(손·마켓이 모두 비었거나, 실험실 봇이 놓지 않는 일과에서 놓으려 함)
        if (!PLACE_CHORES.includes(g.choreOf[seat] as ChoreId)) {
          labIdle++;
          stopped = true;
          break;
        }
        g.doTake(act.take);
        if (look3) g.peekClose();
        g.doPlant(bots[seat]!.plant(g, seat, rand));
        compareChores(g, s, `판 ${i} 수 ${g.turns}`);
        continue;
      }
      if (act.kind === 'place') {
        const sp = (x: number) => g.rules.species[x]!.id as SpeciesId;
        if (s.stage === 'take' && look3 && act.take === -1) {
          labBlind++;
          g.doTake(-1);
          g.peekClose();
          const hand = g.hands[seat]!.map(sp);
          s = { ...s, stage: 'plant', peek: null, market: g.market.map(sp), pile: [...g.bag].reverse().map(sp), players: s.players.map((p) => (p.seat === seat ? { ...p, hand } : p)) };
        } else if (s.stage === 'take') {
          const peekIdx = look3 && s.peek !== null ? g.market.length - 1 : -2;
          const take: number | 'pile' | 'peek' = act.take === -1 ? 'pile' : act.take === peekIdx ? 'peek' : Math.max(0, Math.min(s.market.length - 1, act.take));
          g.doTake(act.take);
          if (look3) g.peekClose();
          apply({ type: 'TAKE', playerId: pid, take }, '가져오기');
          const labMarket = g.market.map(sp);
          const labPile = [...g.bag].reverse().map(sp);
          if (labMarket.join() !== s.market.join() || labPile.join() !== s.pile.join()) {
            s = { ...s, market: labMarket, pile: labPile };
            resynced++;
          }
        } else if (s.stage === 'plant') {
          g.doTake(act.take); // 마켓이 비어 아무것도 가져오지 않는다
          if (look3) g.peekClose();
        } else {
          labIdle++;
          stopped = true;
          break;
        }
        const m = bots[seat]!.plant(g, seat, rand);
        if (m.cell >= 0) {
          const spIdx = g.hands[seat]![m.hand] as number;
          const species = g.rules.species[spIdx]!.id as SpeciesId;
          const rotation = rotationOf(g, spIdx, m.rot);
          const pos = { q: g.geo.q[m.cell] as number, r: g.geo.r[m.cell] as number };
          const seed = m.extra >= 0 ? { q: g.geo.q[m.extra] as number, r: g.geo.r[m.extra] as number } : undefined;
          g.doPlant(m);
          apply({ type: 'PLANT', playerId: pid, species, pos, rotation: rotation as 0, ...(seed ? { seed } : {}) }, '심기');
        } else {
          const spIdx = g.hands[seat]![Math.max(0, m.hand)] as number;
          g.doPlant(m);
          apply({ type: 'DISCARD', playerId: pid, species: g.rules.species[spIdx]!.id as SpeciesId }, '버리기');
        }
      } else {
        if (look3) g.peekClose();
        const at = (c: number) => ({ q: g.geo.q[c] as number, r: g.geo.r[c] as number });
        if (act.kind === 'move') {
          const steps = [{ from: at(act.from), to: at(act.to), count: act.k }];
          if (act.then) steps.push({ from: at(act.then.from), to: at(act.then.to), count: act.then.k });
          g.doAction(act);
          apply({ type: 'MOVE', playerId: pid, moves: steps }, '담 넘기');
        } else if (act.kind === 'call') {
          const spIdx = g.plant[act.cell] as number;
          const rotation = rotationOf(g, spIdx, act.rot ?? (g.plantRot[act.cell] as number));
          const canTake = g.market.length > 0 && g.hands[seat]!.length < 3;
          g.doAction(act);
          apply({ type: 'CALL', playerId: pid, pos: at(act.cell), rotation: rotation as 0, ...(canTake ? { take: 0 } : {}) }, '명당 부르기');
        } else throw new Error(`판 ${i}: c5 에 없는 행동 ${act.kind}`);
      }
      moves++;
      compareChores(g, s, `판 ${i} 수 ${g.turns}`);
    }
    if (stopped) continue;
    finished++;
    const lw = g.winner();
    const ew = s.result?.ranking[0];
    if (ew !== `p${lw}`) throw new Error(`판 ${i}: 승자 실험실 ${lw} / 정본 ${ew}`);
  }
  console.log(`일치: ${finished}/${games}판 끝까지, ${moves}수 (실험실 ${name} = 정본). 생선 냄새 카드 순서 맞춤 ${resynced}번, 실험실 쉼 차이로 멈춘 판 ${labIdle}, 생선 냄새 차례 뒷면 가져오기(정본 상태 고침) ${labBlind}번`);
}

/**
 * 큐브·점수는 늘 비교한다. 차례·선·일과는 둘 다 일과 고르기 단계일 때만 비교한다(정본은 할 일이 없는 사람을 건너뛰어 앞서 갈 수 있다)
 */
function compareChores(g: Game, s: GameState, where: string): void {
  compareCubes(g, s, where);
  if (g.over) {
    if (s.phase !== 'finished') throw new Error(`${where}: 실험실만 끝남`);
    return;
  }
  if (g.stage !== 'draft' || s.phase !== 'playing' || s.round !== g.round) return;
  if (s.round !== g.round) throw new Error(`${where}: 라운드 실험실 ${g.round} / 정본 ${s.round}`);
  if (s.roundStart !== g.roundStart) throw new Error(`${where}: 라운드 선 실험실 ${g.roundStart} / 정본 ${s.roundStart}`);
  if ((g.stage === 'draft') !== (s.stage === 'chore')) throw new Error(`${where}: 단계 실험실 ${g.stage} / 정본 ${s.stage}`);
  if (g.stage === 'draft' && s.currentPlayerId !== `p${g.current}`) throw new Error(`${where}: 고르는 사람 실험실 ${g.current} / 정본 ${s.currentPlayerId}`);
  s.players.forEach((p) => {
    if ((g.choreOf[p.seat] ?? null) !== (s.chores[p.seat] ?? null)) throw new Error(`${where}: 자리${p.seat} 일과 실험실 ${g.choreOf[p.seat]} / 정본 ${s.chores[p.seat]}`);
  });
}

const variantName = process.argv[3] ?? 'c5';
const gameCount = Number(process.argv[2] ?? 30);
if (VARIANTS[variantName]?.chores) runChores(gameCount, variantName);
else run(gameCount, variantName);
