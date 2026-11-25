import { describe, expect, it } from 'vitest';
import { START_HAND, getSpecies, rulesFor } from '../src/engine/data/index.js';
import { maskState } from '../src/engine/mask.js';
import type { Action, Board, GameState, Plant, PlayerId, Position, SpeciesId } from '../src/engine/types.js';
import {
  applyAction,
  autoAction,
  boardIndex,
  buildBoard,
  cellLabel,
  cellLabels,
  computeOwners,
  computeRanking,
  computeScores,
  createInitialState,
  createPlayer,
  cubesOnBoard,
  hasAnyPlant,
  hexDistance,
  joinPlayer,
  layoutFor,
  leaveLobby,
  legalPlantCells,
  legalSeedCells,
  nextRandom,
  nextRoundStart,
  pickGarden,
  pickGoals,
  plantRoots,
  rotateSpot,
  supplyLeft,
} from '../src/engine/index.js';

// ---------------------------------------------------------------------------
// 도우미
// ---------------------------------------------------------------------------

function lobby(n: number, seed = 42): GameState {
  let s = createInitialState('room', seed);
  for (let i = 0; i < n; i++) s = joinPlayer(s, createPlayer(`p${i}`, `P${i}`)).state;
  return s;
}

function ok(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (r.error) throw new Error(r.error);
  return r.state;
}

/** 모두 준비 → 이번 판 식물 공개 단계에서 모두 확인 → 1라운드 */
function readyAll(s: GameState): GameState {
  s = revealAll(s);
  for (const p of s.players) if (s.phase === 'reveal' && !p.isReady) s = ok(s, { type: 'CONFIRM', playerId: p.id });
  return s;
}

function revealAll(s: GameState): GameState {
  for (const p of s.players) s = ok(s, { type: 'READY', playerId: p.id });
  return s;
}

/** 자동 수로 끝까지 둔다 */
function playOut(n: number, seed: number): GameState {
  let s = readyAll(lobby(n, seed));
  for (let i = 0; i < 1000 && s.phase === 'playing'; i++) s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
  return s;
}

type RootSpec = [q: number, r: number, seat: number, n: number];

/**
 * 테스트용 평평한 보드(모두 빈 땅, 15×9). 입구는 자리 0 (0,0), 자리 1 (6,0). 큐브는 roots 로만 놓는다(입구 둘레 큐브 없음).
 * terrain 으로 일부 칸 지형을 바꾼다
 */
function flatState(plants: Omit<Plant, 'id'>[] = [], roots: RootSpec[] = [], terrain: [number, number, Board['cells'][number]['terrain']][] = []): GameState {
  const cells: Board['cells'] = [];
  for (let r = -4; r <= 4; r++) for (let q = -4; q <= 10; q++) cells.push({ q, r, terrain: 'empty', tile: q < 3 ? 0 : 1 });
  cells.sort((a, b) => a.r - b.r || a.q - b.q);
  for (const [q, r, t] of terrain) cells.find((c) => c.q === q && c.r === r)!.terrain = t;
  const board: Board = { cells, entrances: [{ q: 0, r: 0 }, { q: 6, r: 0 }], tileCount: 2 };
  const s = lobby(2);
  const idx = boardIndex(board);
  const rootSeat = new Array<number>(cells.length).fill(-1);
  const rootCount = new Array<number>(cells.length).fill(0);
  for (const [q, r, seat, n] of roots) {
    const c = idx.indexOf({ q, r });
    rootSeat[c] = seat;
    rootCount[c] = n;
  }
  return {
    ...s,
    phase: 'playing',
    board,
    goals: [],
    market: ['grass', 'oak', 'pine'],
    pile: ['kudzu', 'fern', 'lotus', 'mushroom'],
    round: 1,
    stage: 'plant',
    roundStart: 0,
    turn: 1,
    currentPlayerId: 'p0',
    plants: plants.map((p, i) => ({ ...p, id: `t${i}` })),
    rootSeat,
    rootCount,
    players: s.players.map((p) => ({ ...p, hand: ['grass', 'oak'] })),
  };
}

/** 칸의 [자리, 큐브 수] (없으면 [−1, 0]) */
function at(s: Pick<GameState, 'board' | 'rootSeat' | 'rootCount'>, q: number, r: number): [number, number] {
  const c = boardIndex(s.board!).indexOf({ q, r });
  const n = s.rootCount[c] ?? 0;
  return n > 0 ? [s.rootSeat[c]!, n] : [-1, 0];
}

const plant = (species: SpeciesId, ownerId: PlayerId, q: number, r: number, rotation: Plant['rotation'] = 0): Omit<Plant, 'id'> => ({ species, ownerId, pos: { q, r }, rotation });

/** 심기를 큐브까지 적용한 상태 (테스트용 — 차례 검사 없이) */
function grow(s: GameState, playerId: PlayerId, species: SpeciesId, q: number, r: number, rotation = 0, seed?: Position): GameState {
  const withPlant = { ...s, plants: [...s.plants, { id: `g${s.plants.length}`, species, ownerId: playerId, pos: { q, r }, rotation: rotation as Plant['rotation'] }] };
  return { ...withPlant, ...plantRoots(withPlant, playerId, species, { q, r }, rotation, seed) };
}

// ---------------------------------------------------------------------------

describe('칸 이름 (Rules.md 2절)', () => {
  it.each([
    [2, ['D2', 'F7'], 'I'],
    [3, ['C3', 'F11', 'L5'], 'M'],
    [4, ['C4', 'F11', 'K10', 'H2'], 'M'],
  ])('%i인: 칸마다 다른 이름, 입구 %j, 마지막 줄 %s, 시드와 무관', (n, entrances, lastRow) => {
    const a = buildBoard(n, 7).board;
    const b = buildBoard(n, 12345).board;
    const labels = cellLabels(a);
    expect(new Set(labels).size).toBe(a.cells.length);
    expect(labels).toEqual(cellLabels(b));
    expect(a.entrances.map((e) => cellLabel(a, e))).toEqual(entrances);
    expect(labels[0]![0]).toBe('A');
    expect(labels[labels.length - 1]![0]).toBe(lastRow);
  });
  it('같은 줄은 오른쪽으로 1씩, 오른쪽 아래(방향 5) 칸은 다음 줄 같은 번호 또는 +1', () => {
    const board = buildBoard(2, 7).board;
    expect(cellLabel(board, { q: -2, r: -1 })).toBe('D2');
    expect(cellLabel(board, { q: -1, r: -1 })).toBe('D3');
    expect(cellLabel(board, { q: -2, r: 0 })).toBe('E2');
    expect(cellLabel(board, { q: -3, r: 0 })).toBe('E1');
    expect(cellLabel(board, { q: 99, r: 99 })).toBe('?');
  });
});

describe('보드 조립 (Rules.md 3.3)', () => {
  it.each([
    [2, 7, 49],
    [3, 13, 91],
    [4, 15, 105],
  ])('%i인: 조각 %i개, 칸 %i개, 겹침 없음', (n, tiles, cells) => {
    const { board } = buildBoard(n, 7);
    expect(board.tileCount).toBe(tiles);
    expect(board.cells).toHaveLength(cells);
    expect(new Set(board.cells.map((c) => `${c.q},${c.r}`)).size).toBe(cells);
    expect(board.entrances).toHaveLength(n);
  });

  it('칸은 r → q 오름차순 (Rules.md 11절)', () => {
    const { board } = buildBoard(3, 1);
    const sorted = [...board.cells].sort((a, b) => a.r - b.r || a.q - b.q);
    expect(board.cells).toEqual(sorted);
  });

  it('2·3인 입구는 모든 칸까지의 거리 분포가 자리마다 같다 (대칭 보드)', () => {
    for (const n of [2, 3]) {
      const { board } = buildBoard(n, 3);
      const profiles = board.entrances.map((e) => board.cells.map((c) => hexDistance(c, e)).sort((a, b) => a - b).join(','));
      expect(new Set(profiles).size).toBe(1);
    }
  });

  it('조립은 결정적이고, 시드가 다르면 지형 배치가 바뀐다', () => {
    expect(buildBoard(4, 99)).toEqual(buildBoard(4, 99));
    const a = buildBoard(2, 1).board.cells.map((c) => c.terrain).join();
    const b = buildBoard(2, 2).board.cells.map((c) => c.terrain).join();
    expect(a).not.toBe(b);
  });

  it('인원별 배치는 고정 (layoutFor 는 같은 값을 돌려준다)', () => {
    expect(layoutFor(4)).toBe(layoutFor(4));
    expect(layoutFor(2).centers[0]).toEqual({ q: 0, r: 0 });
  });

  it('입구 조각은 연못·돌밭이 없다', () => {
    const { board } = buildBoard(4, 5);
    const idx = boardIndex(board);
    for (const e of board.entrances) {
      const around = [idx.indexOf(e), ...idx.ring1[idx.indexOf(e)]!];
      for (const c of around) expect(['empty', 'fertile']).toContain(board.cells[c]!.terrain);
    }
  });
});

describe('뿌리 큐브 (Rules.md 6.2·7절)', () => {
  it('회전: 1번에 (dq, dr) → (−dr, dq+dr), 6번이면 제자리', () => {
    expect(rotateSpot({ dq: 1, dr: 0, n: 2 }, 1)).toEqual({ dq: 0, dr: 1, n: 2 });
    expect(rotateSpot({ dq: 2, dr: 0, n: 1 }, 3)).toEqual({ dq: -2, dr: 0, n: 1 });
    expect(rotateSpot({ dq: 1, dr: -1, n: 1 }, 6)).toEqual({ dq: 1, dr: -1, n: 1 });
  });

  it('잔디: 심은 칸 2, 이어진 세 칸에 1. 회전하면 모양이 돈다', () => {
    const s = grow(flatState(), 'p0', 'grass', 2, 2);
    expect(at(s, 2, 2)).toEqual([0, 2]);
    expect(at(s, 3, 2)).toEqual([0, 1]);
    expect(at(s, 3, 1)).toEqual([0, 1]);
    expect(at(s, 2, 1)).toEqual([0, 1]);
    expect(at(s, 1, 2)).toEqual([-1, 0]);
    const t = grow(flatState(), 'p0', 'grass', 2, 2, 3);
    expect(at(t, 1, 2)).toEqual([0, 1]);
    expect(at(t, 1, 3)).toEqual([0, 1]);
    expect(at(t, 2, 3)).toEqual([0, 1]);
    expect(at(t, 3, 2)).toEqual([-1, 0]);
  });

  it('칡: 한 줄로 첫 칸 1, 둘째 칸 2. 고사리: 바로 옆은 비우고 하나 걸러 두 칸 앞', () => {
    const k = grow(flatState(), 'p0', 'kudzu', 0, 2);
    expect([at(k, 0, 2), at(k, 1, 2), at(k, 2, 2), at(k, 3, 2)]).toEqual([
      [0, 1],
      [0, 1],
      [0, 2],
      [-1, 0],
    ]);
    const f = grow(flatState(), 'p0', 'fern', 2, 2);
    expect([at(f, 2, 2), at(f, 4, 2), at(f, 2, 0), at(f, 0, 4), at(f, 3, 2)]).toEqual([
      [0, 2],
      [0, 1],
      [0, 1],
      [0, 1],
      [-1, 0],
    ]);
  });

  it('줄다리기: 남의 큐브 2개 칸에 뿌리 3 → 내 1, 뿌리 2 → 빈 칸, 뿌리 1 → 남 1', () => {
    const base = flatState([], [
      [3, 2, 1, 2],
      [2, 2, 1, 2],
    ]);
    // 참나무: 심은 칸 2, 양옆 2. (1,2)에 심으면 (2,2)에 2 → 남 2와 맞서 빈 칸
    const oak = grow(base, 'p0', 'oak', 1, 2);
    expect(at(oak, 2, 2)).toEqual([-1, 0]);
    // 소나무 회전 0 을 (2,2)... 심을 칸이 남 땅이라 직접 시험: 잔디 (2,3) 회전 1 → (2,3)2, (2,4)? 대신 칡으로 둘째 칸 2
    const kudzu = grow(base, 'p0', 'kudzu', 1, 2); // (2,2)에 1 → 남 1 남음, (3,2)에 2 → 빈 칸
    expect(at(kudzu, 2, 2)).toEqual([1, 1]);
    expect(at(kudzu, 3, 2)).toEqual([-1, 0]);
    const pine = grow(flatState([], [[4, 2, 1, 2]]), 'p0', 'pine', 3, 2, 0); // (4,2)에 1 → 남 1
    expect(at(pine, 4, 2)).toEqual([1, 1]);
    const three = grow(flatState([], [[2, 2, 1, 2]]), 'p0', 'pine', 2, 1, 5); // 회전 5: (1,0)→(1,−1)... 심은 칸만 3
    expect(at(three, 2, 1)).toEqual([0, 3]);
    // 큐브 3 이 남 2 위로: 소나무 심은 칸 3 을 남 큐브 칸에 직접 놓는 경우는 없으므로 plantRoots 로 맞섬을 확인
    const push = { ...flatState([], [[2, 2, 1, 2]]) };
    const r = plantRoots({ ...push, plants: [{ id: 'x', species: 'pine', ownerId: 'p0', pos: { q: 2, r: 2 }, rotation: 0 }] }, 'p0', 'pine', { q: 2, r: 2 }, 0);
    expect(at({ ...push, ...r }, 2, 2)).toEqual([0, 1]);
  });

  it('밀어낸 큐브는 주인 공급처로, 밀어내는 데 쓴 내 큐브도 내 공급처에 남는다', () => {
    const s = flatState([], [[2, 2, 1, 2]]);
    const t = grow(s, 'p0', 'kudzu', 1, 2); // (1,2)1, (2,2)1 → 남 1 남음, (3,2)2
    expect(cubesOnBoard(t)).toEqual([1 + 2, 1]);
    expect(supplyLeft(t)).toEqual([rulesFor(2).supply - 3, rulesFor(2).supply - 1]);
  });

  it('보드 밖·연못·바위·입구로 가는 뿌리는 버린다', () => {
    const s = grow(flatState([], [], [[1, 0, 'pond']]), 'p0', 'oak', 0, 1, 0); // (1,1)2, (−1,1)2, 심은 칸 2
    expect(at(s, 0, 1)).toEqual([0, 2]);
    const t = grow(flatState([], [], [[2, 1, 'rock']]), 'p0', 'oak', 1, 1); // (2,1) 바위, (0,1)
    expect(at(t, 2, 1)).toEqual([-1, 0]);
    expect(cubesOnBoard(t)[0]).toBe(4);
    const e = grow(flatState(), 'p0', 'oak', 1, 0); // (0,0) 입구 칸
    expect(at(e, 0, 0)).toEqual([-1, 0]);
    const edge = grow(flatState(), 'p0', 'kudzu', 9, 0); // (10,0)1, (11,0) 보드 밖
    expect(cubesOnBoard(edge)[0]).toBe(2);
  });

  it('공급처가 모자라면 가장 높이 쌓인 내 다른 칸에서 옮겨 온다 (같으면 식물 없는 칸 → 칸 순서)', () => {
    const lim = rulesFor(2).supply;
    // 공급처 0: 높이 4짜리 넷. 칸 순서(r → q)로는 (4,−4)(식물) → (−3,−3) → (−2,−3) → (−3,3)
    const s = flatState([plant('grass', 'p1', 4, -4)], [
      [4, -4, 0, 4],
      [-3, -3, 0, 4],
      [-2, -3, 0, lim - 12],
      [-3, 3, 0, 4],
    ]);
    expect(supplyLeft(s)[0]).toBe(0);
    const t = grow(s, 'p0', 'mushroom', 2, 2); // 심은 칸 2 → 큐브 2개를 옮겨 와야 한다
    expect(at(t, 2, 2)).toEqual([0, 2]);
    // 칸 순서상 맨 앞인 (4,−4) 는 식물이 있어 건너뛰고, 식물 없는 (−3,−3) → (−2,−3) 에서 하나씩
    expect(at(t, 4, -4)).toEqual([0, 4]);
    expect(at(t, -3, -3)).toEqual([0, 3]);
    expect(at(t, -2, -3)).toEqual([0, lim - 13]);
    expect(at(t, -3, 3)).toEqual([0, 4]);
    expect(cubesOnBoard(t)[0]).toBe(lim);
  });

  it('옮겨 올 칸도 없으면 그만큼은 놓지 않는다', () => {
    const lim = rulesFor(2).supply;
    const s = flatState([], [[-3, -3, 0, lim]]);
    // 잔디: 심은 칸 2 + 3칸. 공급처 0 → (−3,−3) 에서 하나씩 옮겨 오며 모두 놓는다
    const t = grow(s, 'p0', 'grass', 2, 2);
    expect(cubesOnBoard(t)[0]).toBe(lim);
    expect(at(t, -3, -3)).toEqual([0, lim - 5]);
    // 내 큐브가 전부 지금 놓는 칸에 있으면 더 못 놓는다
    const u = flatState([], [[2, 2, 0, lim]]);
    const v = plantRoots({ ...u, plants: [{ id: 'x', species: 'oak', ownerId: 'p0', pos: { q: 2, r: 2 }, rotation: 0 }] }, 'p0', 'oak', { q: 2, r: 2 }, 0);
    // 심은 칸 2 → 공급처 0, 옮길 다른 칸 없음 → 그대로. 양옆 2 → (2,2) 에서 옮겨 온다
    expect(cubesOnBoard({ ...u, ...v })[0]).toBe(lim);
    expect(at({ ...u, ...v }, 3, 2)).toEqual([0, 2]);
  });

  it('버섯: 맞닿은 6칸의 남의 큐브 2개씩 걷어낸다, 내 큐브는 그대로', () => {
    const s = flatState([], [
      [3, 2, 1, 3],
      [1, 2, 1, 1],
      [2, 1, 0, 2],
    ]);
    const t = grow(s, 'p0', 'mushroom', 2, 2);
    expect(at(t, 3, 2)).toEqual([1, 1]);
    expect(at(t, 1, 2)).toEqual([-1, 0]);
    expect(at(t, 2, 1)).toEqual([0, 2]);
    expect(at(t, 2, 2)).toEqual([0, 2]);
  });

  it('민들레 씨앗: 두 칸 안 큐브를 놓을 수 있는 칸에 1 (식물 칸도 된다)', () => {
    const s = flatState([plant('oak', 'p1', 4, 2)]);
    const cells = legalSeedCells(s, { q: 2, r: 2 });
    expect(cells.every((p) => hexDistance(p, { q: 2, r: 2 }) <= 2)).toBe(true);
    expect(cells).toContainEqual({ q: 4, r: 2 });
    expect(cells).not.toContainEqual({ q: 2, r: 2 });
    const t = grow(s, 'p0', 'dandelion', 2, 2, 0, { q: 4, r: 2 });
    expect(at(t, 4, 2)).toEqual([0, 1]);
  });

  it('땅 = 큐브가 있는 칸의 색 (computeOwners)', () => {
    const s = flatState([], [
      [1, 1, 0, 1],
      [2, 1, 1, 3],
    ]);
    const owners = computeOwners(s);
    const idx = boardIndex(s.board!);
    expect(owners[idx.indexOf({ q: 1, r: 1 })]).toBe(0);
    expect(owners[idx.indexOf({ q: 2, r: 1 })]).toBe(1);
    expect(owners[idx.indexOf({ q: 3, r: 1 })]).toBe(-1);
  });
});

describe('심을 수 있는 칸 (Rules.md 6.1)', () => {
  it('내 땅, 또는 내 땅·입구와 맞닿은 큐브 없는 칸. 남의 땅·식물·입구 칸은 안 된다', () => {
    const s = flatState([plant('grass', 'p1', -2, 0)], [
      [-2, 0, 0, 1],
      [3, 3, 0, 1],
      [1, 0, 1, 1],
    ]);
    const cells = legalPlantCells(s, 'p0', 'grass');
    expect(cells).toContainEqual({ q: 3, r: 3 }); // 내 땅
    expect(cells).toContainEqual({ q: 4, r: 3 }); // 내 땅과 맞닿은 빈 칸
    expect(cells).toContainEqual({ q: 0, r: 1 }); // 입구와 맞닿은 빈 칸
    expect(cells).not.toContainEqual({ q: 1, r: 0 }); // 남의 땅
    expect(cells).not.toContainEqual({ q: -2, r: 0 }); // 식물 칸
    expect(cells).not.toContainEqual({ q: 0, r: 0 }); // 입구
    expect(cells).not.toContainEqual({ q: 5, r: 5 }); // 멀리 떨어진 칸
  });

  it('연꽃: 연못과 맞닿은 빈 칸이면 남의 땅이어도', () => {
    const s = flatState([], [[8, 3, 1, 2]], [[8, 2, 'pond']]);
    expect(legalPlantCells(s, 'p0', 'grass')).not.toContainEqual({ q: 8, r: 3 });
    expect(legalPlantCells(s, 'p0', 'lotus')).toContainEqual({ q: 8, r: 3 });
    expect(legalPlantCells(s, 'p0', 'lotus')).not.toContainEqual({ q: 8, r: 2 }); // 연못 자체는 안 됨
  });
});

describe('진행 (Rules.md 4·5절)', () => {
  it('모두 준비하면 공개 단계: 손 1장씩, 마켓 펼침, 입구 둘레 큐브. 모두 확인하면 1라운드 자리 0 가져오기', () => {
    const r = revealAll(lobby(2));
    expect(r.phase).toBe('reveal');
    expect(r.currentPlayerId).toBeNull();
    for (const p of r.players) expect(p.hand).toHaveLength(START_HAND);
    expect(r.market).toHaveLength(rulesFor(2).market);
    expect(cubesOnBoard(r)).toEqual([6, 6]);
    for (const [seat, e] of r.board!.entrances.entries()) {
      const idx = boardIndex(r.board!);
      for (const x of idx.ring1[idx.indexOf(e)]!) expect([r.rootSeat[x], r.rootCount[x]]).toEqual([seat, 1]);
    }
    const r1 = ok(r, { type: 'CONFIRM', playerId: 'p1' });
    expect(r1.phase).toBe('reveal');
    expect(applyAction(r1, { type: 'CONFIRM', playerId: 'p1' }).error).toMatch(/이미/);
    expect(autoAction(r1, 'p0')).toEqual({ type: 'CONFIRM', playerId: 'p0' });
    const s = ok(r1, { type: 'CONFIRM', playerId: 'p0' });
    expect(s.phase).toBe('playing');
    expect(s.round).toBe(1);
    expect(s.stage).toBe('take');
    expect(s.currentPlayerId).toBe('p0');
    expect(s.species).toHaveLength(rulesFor(2).gardenSize);
    const total = s.players.reduce((n, p) => n + p.hand.length, 0) + s.market.length + s.pile.length;
    expect(total).toBe(rulesFor(2).gardenSize * rulesFor(2).copies);
  });

  it('인원이 바뀌면 사람의 준비가 풀린다', () => {
    let s = lobby(1);
    s = ok(s, { type: 'READY', playerId: 'p0' });
    expect(s.phase).toBe('lobby');
    s = joinPlayer(s, createPlayer('ai', 'AI', 'ai')).state;
    expect(s.players.find((p) => p.id === 'p0')!.isReady).toBe(false);
    s = ok(s, { type: 'READY', playerId: 'p0' });
    expect(s.phase).toBe('reveal');
    s = ok(s, { type: 'CONFIRM', playerId: 'p0' });
    expect(s.phase).toBe('playing');
    let t = lobby(3);
    t = ok(t, { type: 'READY', playerId: 'p0' });
    t = ok(t, { type: 'READY', playerId: 'p1' });
    t = leaveLobby(t, 'p2').state;
    expect(t.phase).toBe('lobby');
    expect(t.players.every((p) => !p.isReady)).toBe(true);
  });

  it('차례: 가져오면 손 2장, 마켓은 더미 맨 위로 채워지고, 같은 사람이 심는다. 심으면 다음 사람 가져오기', () => {
    const s = readyAll(lobby(2));
    const top = s.pile[0]!;
    const card = s.market[1]!;
    const t = ok(s, { type: 'TAKE', playerId: 'p0', take: 1 });
    expect(t.players[0]!.hand).toEqual([...s.players[0]!.hand, card]);
    expect(t.market).toHaveLength(rulesFor(2).market);
    expect(t.market[t.market.length - 1]).toBe(top);
    expect(t.pile).toHaveLength(s.pile.length - 1);
    expect(t.stage).toBe('plant');
    expect(t.currentPlayerId).toBe('p0');
    expect(applyAction(t, { type: 'TAKE', playerId: 'p0', take: 0 }).error).toMatch(/이미 가져왔/);
    const u = ok(t, autoAction(t, 'p0')!);
    expect(u.players[0]!.hand).toHaveLength(1);
    expect(u.currentPlayerId).toBe('p1');
    expect(u.stage).toBe('take');
    expect(applyAction(t, { type: 'PLANT', playerId: 'p1', species: u.players[1]!.hand[0]!, pos: { q: 0, r: 0 } }).error).toMatch(/내 차례가 아닙니다/);
  });

  it('마켓은 2장. 카드 더미 맨 위 1장을 가져오면 마켓은 그대로, 기록에 식물 이름이 없다 (Rules.md 5절 1)', () => {
    const s = readyAll(lobby(3));
    expect(s.market).toHaveLength(2);
    const top = s.pile[0]!;
    const t = ok(s, { type: 'TAKE', playerId: 'p0', take: 'pile' });
    expect(t.players[0]!.hand).toEqual([...s.players[0]!.hand, top]);
    expect(t.market).toEqual(s.market);
    expect(t.pile).toEqual(s.pile.slice(1));
    expect(t.stage).toBe('plant');
    const log = t.log[t.log.length - 1]!;
    expect(log.kind).toBe('take');
    expect(log.message).toBe('P0: 카드 더미에서 1장 가져옴');
    expect(applyAction({ ...s, pile: [] }, { type: 'TAKE', playerId: 'p0', take: 'pile' }).error).toMatch(/카드 더미가 비었/);
    expect(applyAction(s, { type: 'TAKE', playerId: 'p0', take: 'deck' as never }).error).toMatch(/없는 카드/);
  });

  it('더미가 1장 남았을 때 더미에서 가져오면 더미가 비고, 다음 마켓 가져오기는 채우지 않아 마켓이 1장으로 준다', () => {
    let s = readyAll(lobby(2, 5));
    // 더미가 1장 남을 때까지 마켓 0번 가져오기로 진행
    for (let i = 0; i < 1000 && s.pile.length > 1; i++) s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    while (s.stage !== 'take') s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    expect(s.pile).toHaveLength(1);
    s = ok(s, { type: 'TAKE', playerId: s.currentPlayerId as PlayerId, take: 'pile' });
    expect(s.pile).toHaveLength(0);
    expect(s.market).toHaveLength(2);
    s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    const pid = s.currentPlayerId as PlayerId;
    expect(applyAction(s, { type: 'TAKE', playerId: pid, take: 'pile' }).error).toMatch(/카드 더미가 비었/);
    s = ok(s, { type: 'TAKE', playerId: pid, take: 0 });
    expect(s.market).toHaveLength(1);
    expect(applyAction(s, { type: 'TAKE', playerId: pid, take: 1 }).error).toBeTruthy();
  });

  it.each([2, 3, 4])('%i인: 더미와 마켓을 섞어 가져와도 각자 같은 횟수를 심고 정상 종료', (n) => {
    let s = readyAll(lobby(n, 40 + n));
    for (let i = 0; i < 2000 && s.phase === 'playing'; i++) {
      const pid = s.currentPlayerId as PlayerId;
      // 가져오기 차례마다 번갈아 더미·마켓 (더미가 비면 마켓)
      const fromPile = s.stage === 'take' && s.pile.length > 0 && s.turn % 2 === 0;
      s = ok(s, fromPile ? { type: 'TAKE', playerId: pid, take: 'pile' } : autoAction(s, pid)!);
    }
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('complete');
    const rule = rulesFor(n);
    const plays = (rule.gardenSize * rule.copies) / n;
    expect(s.log.filter((e) => e.kind === 'take' && e.message.endsWith('카드 더미에서 1장 가져옴')).length).toBeGreaterThan(0);
    for (const p of s.players) {
      expect(s.log.filter((e) => e.playerId === p.id && (e.kind === 'plant' || e.kind === 'discard')).length).toBe(plays);
    }
  });

  it('더미에서 가져온 카드는 다른 사람에게 보이지 않는다 (가린 상태에 손·더미·기록 어디에도 없다)', () => {
    const s = readyAll(lobby(3, 8));
    const t = ok(s, { type: 'TAKE', playerId: 'p0', take: 'pile' });
    const card = t.players[0]!.hand[t.players[0]!.hand.length - 1]!;
    const seen = maskState(t, 'p1');
    const p0 = seen.players.find((p) => p.id === 'p0')!;
    expect(p0.hand).toEqual([]);
    expect(p0.handCount).toBe(s.players[0]!.hand.length + 1);
    expect(seen.pile).toEqual([]);
    expect(seen.pileCount).toBe(t.pile.length);
    expect(seen.log[seen.log.length - 1]!.message).not.toContain(getSpecies(card).name);
    expect(maskState(t, 'p0').players.find((p) => p.id === 'p0')!.hand).toContain(card);
  });

  it('기록: 심은 칸·씨앗 칸·밀어낸 칸을 칸 이름으로 남긴다', () => {
    const s = readyAll(lobby(2));
    expect(s.log.some((e) => e.message === '입구: 1번 자리 D2 · 2번 자리 F7')).toBe(true);
    const f = { ...flatState([], [[2, 0, 1, 1]]), stage: 'plant' as const };
    // 평평한 보드: (0,0) = E7, (1,0) = E8, (2,0) = E9
    const r = ok(f, { type: 'PLANT', playerId: 'p0', species: 'grass', pos: { q: 1, r: 0 } });
    const msgs = r.log.map((e) => e.message);
    expect(msgs).toContain('P0: E8에 잔디 심음');
    // 잔디 뿌리 (1,0) 방향 0 → (2,0) 에 1: P1 큐브 1개를 밀어내 빈 칸이 된다
    expect(at(r, 2, 0)).toEqual([-1, 0]);
    expect(msgs).toContain('P0: P1의 땅 1칸을 밀어냄 (E9)');
  });

  it('다음 선: 공급처에 큐브가 가장 많이 남은 사람, 동점이면 이번 선 다음 자리부터', () => {
    const s = flatState([], [
      [1, 1, 0, 3],
      [5, 1, 1, 1],
    ]);
    expect(nextRoundStart(s)).toBe(1);
    const t = flatState([], [
      [1, 1, 0, 2],
      [5, 1, 1, 2],
    ]);
    expect(nextRoundStart(t)).toBe(1); // 동점 → 이번 선(0) 다음 자리
    expect(nextRoundStart({ ...t, roundStart: 1 })).toBe(0);
  });

  it('라운드가 넘어갈 때 선은 직전 상태의 nextRoundStart 와 같다 (4인 끝까지)', () => {
    let s = readyAll(lobby(4, 9));
    let rounds = 0;
    for (let i = 0; i < 1000 && s.phase === 'playing'; i++) {
      const round = s.round;
      const prevStart = s.roundStart;
      s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
      if (s.phase === 'playing' && s.round !== round) {
        rounds++;
        // 라운드 사이에는 큐브가 움직이지 않으므로 새 상태의 공급처로 직전 선 기준 예측과 같아야 한다
        const predicted = nextRoundStart({ ...s, roundStart: prevStart });
        expect(s.roundStart).toBe(predicted);
        expect(s.currentPlayerId).toBe(s.players.find((p) => p.seat === predicted)!.id);
      }
    }
    expect(rounds).toBe(9);
  });

  it.each([
    [2, 12],
    [3, 10],
    [4, 10],
  ])('%i인: 끝까지 두면 각자 %i번 심고 정상 종료', (n, plays) => {
    const s = playOut(n, 11 + n);
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('complete');
    for (const p of s.players) {
      const acted = s.log.filter((e) => e.playerId === p.id && (e.kind === 'plant' || e.kind === 'discard')).length;
      expect(acted).toBe(plays);
      expect(p.hand).toHaveLength(0);
    }
    expect(s.market).toHaveLength(0);
    expect(s.pile).toHaveLength(0);
    for (const c of cubesOnBoard(s)) expect(c).toBeLessThanOrEqual(rulesFor(n).supply);
  });

  it('마켓이 비면 차례는 바로 심기부터', () => {
    let s = readyAll(lobby(2, 3));
    for (let i = 0; i < 1000 && s.phase === 'playing' && s.market.length > 0; i++) s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    expect(s.phase).toBe('playing');
    expect(s.stage).toBe('plant');
    expect(autoAction(s, s.currentPlayerId as PlayerId)!.type).not.toBe('TAKE');
  });

  it('거부: 남의 차례·손에 없는 카드·심을 수 없는 칸·잘못된 회전·민들레가 아닌 씨앗·두 칸 밖 씨앗', () => {
    const s = flatState();
    expect(applyAction(s, { type: 'PLANT', playerId: 'p1', species: 'grass', pos: { q: 0, r: 1 } }).error).toMatch(/내 차례/);
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: 'pine', pos: { q: 0, r: 1 } }).error).toMatch(/손에 없는/);
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: 'grass', pos: { q: 4, r: 4 } }).error).toMatch(/내 땅/);
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: 'grass', pos: { q: 0, r: 1 }, rotation: 7 as never }).error).toMatch(/회전/);
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: 'grass', pos: { q: 0, r: 1 }, seed: { q: 1, r: 1 } }).error).toMatch(/씨앗을 날리지/);
    const d = { ...s, players: s.players.map((p) => ({ ...p, hand: ['dandelion' as SpeciesId] })) };
    expect(applyAction(d, { type: 'PLANT', playerId: 'p0', species: 'dandelion', pos: { q: 0, r: 1 }, seed: { q: 4, r: 1 } }).error).toMatch(/두 칸 안/);
    expect(applyAction(d, { type: 'PLANT', playerId: 'p0', species: 'dandelion', pos: null as never }).error).toMatch(/잘못된/);
    expect(applyAction(d, { type: 'PLANT', playerId: 'p0', species: 'dandelion', pos: { q: 0, r: 1 }, seed: { q: 2, r: 1 } }).error).toBeUndefined();
  });

  it('버리기: 어떤 카드도 심을 칸이 없을 때만', () => {
    const s = flatState();
    expect(hasAnyPlant(s, 'p0')).toBe(true);
    expect(applyAction(s, { type: 'DISCARD', playerId: 'p0', species: 'grass' }).error).toMatch(/버릴 수 없/);
    // 입구 둘레를 모두 막고 내 큐브가 하나도 없으면 심을 칸이 없다
    const blocked = flatState(
      [plant('grass', 'p1', 1, 0), plant('grass', 'p1', 1, -1), plant('grass', 'p1', 0, -1), plant('grass', 'p1', -1, 0), plant('grass', 'p1', -1, 1), plant('grass', 'p1', 0, 1)],
      [],
    );
    expect(hasAnyPlant(blocked, 'p0')).toBe(false);
    expect(autoAction(blocked, 'p0')).toEqual({ type: 'DISCARD', playerId: 'p0', species: 'grass' });
    const t = ok(blocked, { type: 'DISCARD', playerId: 'p0', species: 'grass' });
    expect(t.players[0]!.hand).toEqual(['oak']);
    expect(t.log.at(-2)?.kind).toBe('discard');
  });

  it('남의 땅을 밀어내면 flip, 큐브를 옮겨 오면 uproot 로그', () => {
    const lim = rulesFor(2).supply;
    const s = flatState([], [
      [1, 1, 0, 1],
      [2, 1, 1, 1],
      [-4, -4, 0, lim - 1],
    ]);
    const t = ok(s, { type: 'PLANT', playerId: 'p0', species: 'oak', pos: { q: 1, r: 1 } }); // (2,1) 에 2 → 남 1 밀어내고 내 1
    expect(at(t, 2, 1)).toEqual([0, 1]);
    expect(t.log.some((e) => e.kind === 'flip')).toBe(true);
    expect(t.log.some((e) => e.kind === 'uproot')).toBe(true);
  });

  it('카드 더미 셔플은 deckSeed 만 쓴다', () => {
    const mk = (deckSeed: number) => {
      let s = createInitialState('r', 42, deckSeed);
      for (let i = 0; i < 2; i++) s = joinPlayer(s, createPlayer(`p${i}`, `P${i}`)).state;
      return readyAll(s);
    };
    const a = mk(1);
    const b = mk(2);
    expect(a.board).toEqual(b.board);
    expect(a.goals).toEqual(b.goals);
    expect(a.species).toEqual(b.species);
    expect([...a.players.flatMap((p) => p.hand), ...a.market, ...a.pile].join()).not.toEqual([...b.players.flatMap((p) => p.hand), ...b.market, ...b.pile].join());
  });

  it('목표 3장에는 종 연계가 1장 이상. 이번 판 식물은 인원별 수, 보호구역 식물 필수, 꽃밭·숲이면 꽃·나무', () => {
    let seed = 7;
    for (let i = 0; i < 300; i++) {
      seed = nextRandom(seed).seed;
      const { goals, seed: next } = pickGoals(seed);
      expect(goals).toHaveLength(3);
      expect(goals.some((g) => g.endsWith('-reserve'))).toBe(true);
      for (const n of [2, 3, 4]) {
        const { species } = pickGarden(n, goals, next);
        expect(species).toHaveLength(rulesFor(n).gardenSize);
        expect(new Set(species).size).toBe(species.length);
        for (const g of goals) if (g.endsWith('-reserve')) expect(species).toContain(g.replace('-reserve', ''));
        if (goals.includes('flower-bed')) expect(species.some((x) => ['dandelion', 'lotus', 'mugunghwa'].includes(x))).toBe(true);
        if (goals.includes('forest')) expect(species.some((x) => ['oak', 'pine'].includes(x))).toBe(true);
      }
    }
  });
});

describe('종료·점수·순위 (Rules.md 8·9절)', () => {
  it('점수 = 땅 + 목표 + 무궁화 + 덤, 순위는 점수 → 땅 → 내 땅 위 식물 → 자리 큰 쪽', () => {
    const s = playOut(4, 5);
    const scores = s.result!.scores;
    for (const p of s.players) {
      const sc = scores[p.id]!;
      expect(sc.total).toBe(sc.land + sc.goals + sc.bloom + sc.komi);
      expect(sc.goalBreakdown).toHaveLength(3);
      expect(sc.komi).toBe(rulesFor(4).komi[p.seat]);
    }
    const ranking = s.result!.ranking;
    for (let i = 1; i < ranking.length; i++) {
      const a = scores[ranking[i - 1]!]!;
      const b = scores[ranking[i]!]!;
      expect(a.total > b.total || (a.total === b.total && (a.land > b.land || (a.land === b.land && a.plantsOnLand >= b.plantsOnLand)))).toBe(true);
    }
  });

  it('동점 깨기: 점수·땅이 같으면 내 땅 위 식물이 많은 쪽', () => {
    const s = flatState([plant('grass', 'p0', 1, 1)], [
      [1, 1, 0, 1],
      [2, 1, 0, 1],
      [5, 1, 1, 1],
      [6, 1, 1, 1],
    ]);
    expect(computeRanking(s)).toEqual(['p0', 'p1']);
    const t = flatState([], s.rootSeat.map(() => 0).length ? [
      [1, 1, 0, 1],
      [2, 1, 0, 1],
      [5, 1, 1, 1],
      [6, 1, 1, 1],
    ] : []);
    expect(computeRanking(t)).toEqual(['p1', 'p0']); // 모두 같으면 자리 큰 쪽
  });

  it('땅 점수는 computeOwners 와 같다', () => {
    const s = playOut(2, 8);
    const owners = computeOwners(s);
    for (const p of s.players) expect(s.result!.scores[p.id]!.land).toBe([...owners].filter((o) => o === p.seat).length);
  });

  it('공개 단계에서 기권하면 남은 사람이 모두 확인했을 때 시작, 1명만 남으면 종료', () => {
    let r = revealAll(lobby(3));
    r = ok(r, { type: 'CONFIRM', playerId: 'p0' });
    r = ok(r, { type: 'CONFIRM', playerId: 'p1' });
    r = ok(r, { type: 'SURRENDER', playerId: 'p2' });
    expect(r.phase).toBe('playing');
    let t = revealAll(lobby(2));
    t = ok(t, { type: 'SURRENDER', playerId: 'p1' });
    expect(t.phase).toBe('finished');
  });

  it('기권: 차례를 건너뛰고 순위 맨 아래, 1명만 남으면 종료. 남은 사람으로 끝까지 진행된다', () => {
    let s = readyAll(lobby(3));
    s = ok(s, { type: 'SURRENDER', playerId: 'p1' });
    s = ok(s, autoAction(s, 'p0')!);
    s = ok(s, autoAction(s, 'p0')!);
    expect(s.currentPlayerId).toBe('p2');
    let u = s;
    for (let i = 0; i < 1000 && u.phase === 'playing'; i++) u = ok(u, autoAction(u, u.currentPlayerId as PlayerId)!);
    expect(u.result?.reason).toBe('complete');
    expect(u.result?.ranking.at(-1)).toBe('p1');
    s = ok(s, { type: 'SURRENDER', playerId: 'p2' });
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('last-standing');
    expect(s.result?.ranking).toEqual(['p0', 'p2', 'p1']);
  });

  it('같은 시드·같은 수 → 같은 결과 (결정성)', () => {
    expect(playOut(4, 77)).toEqual(playOut(4, 77));
  });

  it('입력 상태를 바꾸지 않는다 (순수 함수)', () => {
    const s = readyAll(lobby(2));
    const snapshot = JSON.stringify(s);
    const t = applyAction(s, autoAction(s, 'p0')!).state;
    applyAction(t, autoAction(t, 'p0')!);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('목표 점수 (Rules.md 8절)', () => {
  const withGoals = (s: GameState, goals: GameState['goals']) => ({ ...s, goals });

  it('종 연계: 누가 심었든 내 땅 위의 그 식물 1개당 +2', () => {
    const s = withGoals(flatState([plant('pine', 'p1', 2, 2), plant('pine', 'p1', 8, 2)], [
      [2, 2, 0, 1],
      [8, 2, 1, 3],
    ]), ['pine-reserve']);
    const sc = computeScores(s);
    expect(sc['p0']!.goalBreakdown[0]).toBe(2);
    expect(sc['p1']!.goalBreakdown[0]).toBe(2);
  });

  it('큰 정원: 1등 +4 2등 +2, 동점 1등은 모두 4이고 2등 없음', () => {
    const s = withGoals(flatState([], [
      [1, 1, 0, 1],
      [2, 1, 0, 1],
      [6, 2, 1, 1],
    ]), ['big-garden']);
    expect(computeScores(s)['p0']!.goalBreakdown[0]).toBe(4);
    expect(computeScores(s)['p1']!.goalBreakdown[0]).toBe(2);
    const t = withGoals(flatState([], [
      [1, 1, 0, 1],
      [6, 2, 1, 1],
    ]), ['big-garden']);
    expect(computeScores(t)['p0']!.goalBreakdown[0]).toBe(4);
    expect(computeScores(t)['p1']!.goalBreakdown[0]).toBe(4);
  });

  it('여러 가지 심기: 내 땅 위 서로 다른 식물 5종 이상이면 +4', () => {
    const kinds = ['grass', 'oak', 'pine', 'kudzu', 'fern'] as const;
    const plants = kinds.map((sp, i) => plant(sp, 'p1', i - 2, 2));
    const roots: RootSpec[] = kinds.map((_, i) => [i - 2, 2, 0, 1]);
    expect(computeScores(withGoals(flatState(plants.slice(0, 4), roots.slice(0, 4)), ['variety']))['p0']!.goalBreakdown[0]).toBe(0);
    expect(computeScores(withGoals(flatState(plants, roots), ['variety']))['p0']!.goalBreakdown[0]).toBe(4);
  });

  it('숲: 서로 맞닿은 내 땅 위 나무 3개 무리마다 +4', () => {
    const s = withGoals(flatState([plant('oak', 'p0', 1, 2), plant('pine', 'p1', 2, 2), plant('oak', 'p0', 3, 2)], [
      [1, 2, 0, 1],
      [2, 2, 0, 1],
      [3, 2, 0, 1],
    ]), ['forest']);
    expect(computeScores(s)['p0']!.goalBreakdown[0]).toBe(4);
  });

  it('무궁화: 끝날 때 그 칸이 내 땅이면 +1 (누가 심었든)', () => {
    const s = flatState([plant('mugunghwa', 'p1', 2, 2)], [[2, 2, 0, 1]]);
    expect(computeScores(s)['p0']!.bloom).toBe(1);
    expect(computeScores(s)['p1']!.bloom).toBe(0);
  });
});
