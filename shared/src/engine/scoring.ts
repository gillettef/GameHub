/**
 * 점수·목표·순위 (Rules.md 8·9절). 보드의 순수 함수.
 */
import { RESERVE_BONUS, VARIETY_BONUS, VARIETY_SPECIES, rulesFor } from '../data/constants.js';
import { FLOWER_SPECIES, FOREST_SPECIES, getGoal, getSpecies } from '../data/species.js';
import type { GameState, GoalId, PlayerId, Score, SpeciesId } from '../types/index.js';
import { boardIndex, step, type BoardIndex } from './board.js';
import { computeInfluence, computeOwners, occupancy, requireBoard, type Occupancy } from './influence.js';

/** 1등 A, 2등 B. 동점 1등은 모두 A 이고 그때 2등은 없다. 값 0은 받지 않는다 */
function rankAward(values: number[], first: number, second: number): number[] {
  const out = values.map(() => 0);
  const top = Math.max(0, ...values);
  if (top <= 0) return out;
  const tops = values.filter((v) => v === top).length;
  values.forEach((v, i) => {
    if (v === top) out[i] = first;
  });
  if (tops === 1 && second > 0) {
    const rest = values.filter((v) => v < top);
    const sec = rest.length ? Math.max(...rest) : 0;
    if (sec > 0)
      values.forEach((v, i) => {
        if (v === sec) out[i] = second;
      });
  }
  return out;
}

function components(cells: number[], idx: BoardIndex): number[][] {
  const set = new Set(cells);
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const comp: number[] = [];
    const stack = [c];
    seen.add(c);
    while (stack.length) {
      const x = stack.pop() as number;
      comp.push(x);
      for (const y of idx.ring1[x] as number[])
        if (set.has(y) && !seen.has(y)) {
          seen.add(y);
          stack.push(y);
        }
    }
    comps.push(comp);
  }
  return comps;
}

/** 세 축(방향 0·1·2) 중 하나로 이어진 같은 주인 칸 줄의 최대 길이 */
function longestLine(seat: number, cells: number[], owners: Int8Array, idx: BoardIndex): number {
  let best = 0;
  for (const d of [0, 1, 2]) {
    for (const c of cells) {
      const cell = idx.board.cells[c]!;
      const back = idx.indexOf(step(cell, (d + 3) % 6));
      if (back >= 0 && owners[back] === seat) continue; // 줄의 시작 칸에서만 센다
      let len = 1;
      let cur = c;
      for (;;) {
        const nx = idx.indexOf(step(idx.board.cells[cur]!, d));
        if (nx < 0 || owners[nx] !== seat) break;
        len++;
        cur = nx;
      }
      best = Math.max(best, len);
    }
  }
  return best;
}

function goalPoints(goal: GoalId, state: GameState, idx: BoardIndex, owners: Int8Array, mine: number[][], occ: Occupancy): number[] {
  const P = state.players.length;
  const cells = idx.board.cells;
  switch (goal) {
    case 'pond-side':
      return mine.map((cs) => cs.filter((c) => (idx.ring1[c] as number[]).some((x) => cells[x]?.terrain === 'pond')).length);
    case 'big-garden':
      return rankAward(mine.map((cs) => Math.max(0, ...components(cs, idx).map((k) => k.length))), 6, 3);
    case 'long-path':
      return rankAward(mine.map((cs, seat) => longestLine(seat, cs, owners, idx)), 5, 2);
    case 'fertile-field':
      return mine.map((cs) => 2 * cs.filter((c) => cells[c]?.terrain === 'fertile').length);
    case 'edge-fence':
      return mine.map((cs) => cs.filter((c) => idx.edge[c]).length);
    case 'center-plaza':
      return rankAward(mine.map((cs) => cs.filter((c) => cells[c]?.tile === 0).length), 6, 0);
    case 'every-tile':
      return mine.map((cs) => new Set(cs.map((c) => cells[c]?.tile)).size);
    case 'flower-bed':
      return mine.map((cs) => 2 * cs.filter((c) => FLOWER_SPECIES.includes(occ.plantSpecies[c] as SpeciesId)).length);
    case 'forest':
      return Array.from({ length: P }, (_, seat) => {
        const trees: number[] = [];
        for (let c = 0; c < idx.n; c++) if (occ.plantSeat[c] === seat && FOREST_SPECIES.includes(occ.plantSpecies[c] as SpeciesId)) trees.push(c);
        return 4 * components(trees, idx).filter((k) => k.length >= 3).length;
      });
    case 'connected':
      return Array.from({ length: P }, (_, seat) => {
        const group: number[] = [idx.indexOf(idx.board.entrances[seat]!)];
        for (let c = 0; c < idx.n; c++) if (occ.plantSeat[c] === seat) group.push(c);
        return group.length > 1 && components(group, idx).length === 1 ? 5 : 0;
      });
    case 'border-guard':
      return mine.map((cs, seat) => cs.filter((c) => (idx.ring1[c] as number[]).some((x) => (owners[x] as number) >= 0 && owners[x] !== seat)).length);
    case 'variety':
      return Array.from({ length: P }, (_, seat) => {
        const id = state.players.find((p) => p.seat === seat)?.id;
        const kinds = new Set(state.plants.filter((pl) => pl.ownerId === id).map((pl) => pl.species));
        return kinds.size >= VARIETY_SPECIES ? VARIETY_BONUS : 0;
      });
    default: {
      const species = getGoal(goal).species;
      const pts = new Array<number>(P).fill(0);
      if (!species) return pts;
      for (let c = 0; c < idx.n; c++) {
        const seat = occ.plantSeat[c] as number;
        if (occ.plantSpecies[c] === species && seat >= 0 && owners[c] === seat) pts[seat]! += RESERVE_BONUS;
      }
      return pts;
    }
  }
}

/** 좌석별 점수 (Rules.md 9절). 언제든 부를 수 있다(진행 중 예상 점수 표시용) */
export function computeScores(state: GameState): Record<PlayerId, Score> {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const inf = computeInfluence(state);
  const owners = computeOwners(state, inf);
  const occ = occupancy(state);
  const P = state.players.length;
  const mine: number[][] = Array.from({ length: P }, () => []);
  for (let c = 0; c < idx.n; c++) if ((owners[c] as number) >= 0) mine[owners[c] as number]!.push(c);
  const breakdown = state.goals.map((g) => goalPoints(g, state, idx, owners, mine, occ));
  const bloom = new Array<number>(P).fill(0);
  for (let c = 0; c < idx.n; c++) {
    const sp = occ.plantSpecies[c];
    const seat = occ.plantSeat[c] as number;
    if (sp && seat >= 0 && owners[c] === seat) bloom[seat]! += getSpecies(sp).bloomBonus;
  }
  const komi = rulesFor(P).komi;
  const out: Record<PlayerId, Score> = {};
  for (const p of state.players) {
    const land = mine[p.seat]!.length;
    const goalBreakdown = breakdown.map((b) => b[p.seat] ?? 0);
    const goals = goalBreakdown.reduce((a, b) => a + b, 0);
    const k = komi[p.seat] ?? 0;
    out[p.id] = { land, goals, goalBreakdown, bloom: bloom[p.seat]!, komi: k, total: land + goals + bloom[p.seat]! + k };
  }
  return out;
}

/** 순위 (Rules.md 9절): 기권 안 함 → 점수 → 땅 → 좌석 큰 쪽. 기권자는 늦게 기권한 쪽이 위 */
export function computeRanking(state: GameState, scores: Record<PlayerId, Score> = computeScores(state)): PlayerId[] {
  const active = state.players.filter((p) => p.surrenderedOrder === null);
  const gone = state.players.filter((p) => p.surrenderedOrder !== null);
  active.sort((a, b) => {
    const sa = scores[a.id]!;
    const sb = scores[b.id]!;
    return sb.total - sa.total || sb.land - sa.land || b.seat - a.seat;
  });
  gone.sort((a, b) => (b.surrenderedOrder as number) - (a.surrenderedOrder as number));
  return [...active, ...gone].map((p) => p.id);
}

/** 좌석별 땅 칸 수 (주인 바뀜 기록용) */
export function landCounts(state: GameState): number[] {
  const owners = computeOwners(state);
  const counts = new Array<number>(state.players.length).fill(0);
  for (const o of owners) if (o >= 0) counts[o]!++;
  return counts;
}

