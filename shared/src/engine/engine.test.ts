import { describe, expect, it } from 'vitest';
import { START_HAND, rulesFor } from '../data/index.js';
import type { Action, Board, GameState, Plant, PlayerId, Position, SpeciesId } from '../types/index.js';
import {
  applyAction,
  autoAction,
  boardIndex,
  buildBoard,
  computeInfluence,
  computeOwners,
  computeRanking,
  computeScores,
  createInitialState,
  createPlayer,
  hasAnyPlant,
  hexDistance,
  joinPlayer,
  layoutFor,
  leaveLobby,
  legalDirections,
  legalPlantCells,
  legalSeedCells,
  nextRandom,
  nextRoundStart,
  pickGarden,
  pickGoals,
  step,
} from './index.js';

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

/** 모두 준비 → 이번 판 식물 공개 단계에서 모두 확인 → 1라운드 가져오기 */
function readyAll(s: GameState): GameState {
  s = revealAll(s);
  for (const p of s.players) if (s.phase === 'reveal' && !p.isReady) s = ok(s, { type: 'CONFIRM', playerId: p.id });
  return s;
}

function revealAll(s: GameState): GameState {
  for (const p of s.players) s = ok(s, { type: 'READY', playerId: p.id });
  return s;
}

/** 1라운드 가져오기를 자동 수로 끝내고 심기 단계로 */
function toPlant(s: GameState): GameState {
  while (s.stage === 'take') s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
  return s;
}

/** 빈 보드(모두 빈 땅) 위에 테스트용 상태를 만든다. 입구는 좌석 0 (0,0), 좌석 1 (6,0) */
function flatState(plants: Omit<Plant, 'id'>[] = [], seeds: GameState['seeds'] = []): GameState {
  const cells: Board['cells'] = [];
  for (let r = -4; r <= 4; r++) for (let q = -4; q <= 10; q++) cells.push({ q, r, terrain: 'empty', tile: q < 3 ? 0 : 1 });
  cells.sort((a, b) => a.r - b.r || a.q - b.q);
  const board: Board = { cells, entrances: [{ q: 0, r: 0 }, { q: 6, r: 0 }], tileCount: 2 };
  const s = lobby(2);
  return {
    ...s,
    phase: 'playing',
    board,
    goals: [],
    round: 1,
    stage: 'plant',
    roundStart: 0,
    turn: 1,
    currentPlayerId: 'p0',
    plants: plants.map((p, i) => ({ ...p, id: `t${i}` })),
    seeds,
    players: s.players.map((p) => ({ ...p, hand: ['grass', 'grass', 'grass'] })),
  };
}

function infAt(s: GameState, seat: number, pos: Position): number {
  const idx = boardIndex(s.board!);
  return computeInfluence(s)[seat]![idx.indexOf(pos)]!;
}

const plant = (species: SpeciesId, ownerId: PlayerId, q: number, r: number, direction: Plant['direction'] = null): Omit<Plant, 'id'> => ({ species, ownerId, pos: { q, r }, direction });

// ---------------------------------------------------------------------------

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

  it('2·3인 입구는 모든 칸까지의 거리 분포가 좌석마다 같다 (대칭 보드)', () => {
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

describe('영향력 (Rules.md 6.2·7절)', () => {
  it('입구: 자기 3, 거리 1에 1', () => {
    const s = flatState();
    expect(infAt(s, 0, { q: 0, r: 0 })).toBe(3);
    expect(infAt(s, 0, { q: 1, r: 0 })).toBe(1);
    expect(infAt(s, 0, { q: 2, r: 0 })).toBe(0);
  });

  it('잔디 3/1, 참나무 2/2, 소나무 5/1', () => {
    const s = flatState([plant('grass', 'p0', 0, 3), plant('oak', 'p0', 4, 3), plant('pine', 'p1', 8, 3)]);
    expect(infAt(s, 0, { q: 0, r: 3 })).toBe(3);
    expect(infAt(s, 0, { q: 1, r: 3 })).toBe(1);
    expect(infAt(s, 0, { q: 4, r: 3 })).toBe(2);
    expect(infAt(s, 0, { q: 5, r: 3 })).toBe(2);
    expect(infAt(s, 1, { q: 8, r: 3 })).toBe(5);
    expect(infAt(s, 1, { q: 9, r: 3 })).toBe(1);
  });

  it('칡: 자기 2, 고른 방향 직선 거리 1·2 에 각 2, 거리 3 은 없음', () => {
    const s = flatState([plant('kudzu', 'p0', 0, -3, 0)]);
    expect(infAt(s, 0, { q: 0, r: -3 })).toBe(2);
    expect(infAt(s, 0, { q: 1, r: -3 })).toBe(2);
    expect(infAt(s, 0, { q: 2, r: -3 })).toBe(2);
    expect(infAt(s, 0, { q: 3, r: -3 })).toBe(0);
    expect(infAt(s, 0, { q: -1, r: -3 })).toBe(0);
  });

  it('칡: 거리 1·2 가 보드 밖이면 건너뛰고 거리 3 으로 밀려나지 않는다, 그런 방향은 고를 수 없다', () => {
    // flatState 는 q ∈ [−4, 10]. (9,0) 에서 방향 0 → (10,0) 보드 안, (11,0) 보드 밖, (12,0) 보드 밖
    const s = flatState([plant('kudzu', 'p0', 9, 0, 0)]);
    expect(infAt(s, 0, { q: 10, r: 0 })).toBe(2);
    // (10,0) 에서 방향 0 은 거리 1·2 모두 보드 밖 → 고를 수 없다
    expect(legalDirections(s, { q: 10, r: 0 })).not.toContain(0);
    expect(legalDirections(s, { q: 9, r: 0 })).toContain(0);
  });

  it('고사리: 자기 2, 거리 1 은 0, 별 모양 거리 2 에 1', () => {
    const s = flatState([plant('fern', 'p0', 4, -2)]);
    expect(infAt(s, 0, { q: 4, r: -2 })).toBe(2);
    expect(infAt(s, 0, step({ q: 4, r: -2 }, 0))).toBe(0);
    for (let d = 0; d < 6; d++) expect(infAt(s, 0, step({ q: 4, r: -2 }, d, 2))).toBe(1);
    // 거리 2 이지만 직선이 아닌 칸은 0
    expect(infAt(s, 0, { q: 5, r: -1 })).toBe(0);
  });

  it('비옥토: 자기 칸 +1, 유채는 비옥토에서 둘레 3 (밖에서는 2/1)', () => {
    const s0 = flatState([plant('rapeseed', 'p0', 0, 3)]);
    expect(infAt(s0, 0, { q: 0, r: 3 })).toBe(2);
    expect(infAt(s0, 0, { q: 1, r: 3 })).toBe(1);
    const cells = s0.board!.cells.map((c) => (c.q === 0 && c.r === 3 ? { ...c, terrain: 'fertile' as const } : c));
    const s = { ...s0, board: { ...s0.board!, cells } };
    expect(infAt(s, 0, { q: 0, r: 3 })).toBe(3);
    expect(infAt(s, 0, { q: 1, r: 3 })).toBe(3);
  });

  it('담쟁이: 둘레에 식물이 있는 칸에만 +1 더', () => {
    const s = flatState([plant('ivy', 'p0', 4, 3), plant('grass', 'p1', 5, 3)]);
    expect(infAt(s, 0, { q: 5, r: 3 })).toBe(2);
    expect(infAt(s, 0, { q: 3, r: 3 })).toBe(1);
  });

  it('대나무: 이웃한 내 대나무 1개당 자기 칸 +2 (상대 대나무는 무관)', () => {
    const s = flatState([plant('bamboo', 'p0', 4, 3), plant('bamboo', 'p0', 5, 3), plant('bamboo', 'p1', 4, 2)]);
    // (4,3): 자기 1 + 이웃 내 대나무 1개 ×2 = 3, 거기에 (5,3) 대나무의 둘레 2 → 5
    expect(infAt(s, 0, { q: 4, r: 3 })).toBe(5);
  });

  it('버섯: 둘레 6칸의 다른 사람 영향력 −2, 0 밑으로 안 내려감, 내 영향력은 그대로', () => {
    const s = flatState([plant('oak', 'p1', 2, 2), plant('mushroom', 'p0', 2, 3), plant('grass', 'p0', 1, 3)]);
    // (3,2): p1 참나무 둘레 2 − 2 = 0
    expect(infAt(s, 1, { q: 3, r: 2 })).toBe(0);
    // (1,3): 내 잔디 3 은 그대로
    expect(infAt(s, 0, { q: 1, r: 3 })).toBeGreaterThanOrEqual(3);
    // 참나무 자기 칸(2,2)은 버섯 둘레: 2 − 2 = 0
    expect(infAt(s, 1, { q: 2, r: 2 })).toBe(0);
  });

  it('씨앗: 그 칸에 2, 여러 개면 더한다', () => {
    const s = flatState([], [
      { ownerId: 'p0', pos: { q: 3, r: 3 } },
      { ownerId: 'p0', pos: { q: 3, r: 3 } },
    ]);
    expect(infAt(s, 0, { q: 3, r: 3 })).toBe(4);
  });

  it('땅: 엄격한 1등만. 동점·0·연못은 주인 없음', () => {
    const s = flatState([plant('grass', 'p0', 2, 0), plant('grass', 'p1', 4, 0)]);
    const idx = boardIndex(s.board!);
    const owners = computeOwners(s);
    expect(owners[idx.indexOf({ q: 3, r: 0 })]).toBe(-1); // 1 : 1 동점
    expect(owners[idx.indexOf({ q: 2, r: 0 })]).toBe(0);
    expect(owners[idx.indexOf({ q: -4, r: 4 })]).toBe(-1); // 아무도 안 닿음
  });
});

describe('심을 수 있는 칸 (Rules.md 6.1)', () => {
  it('내 영향력 1 이상인 빈 칸. 입구·식물 칸은 안 됨. 씨앗 칸은 됨', () => {
    const s = flatState([plant('grass', 'p0', 1, 0)], [{ ownerId: 'p1', pos: { q: 2, r: 0 } }]);
    const cells = legalPlantCells(s, 'p0', 'grass').map((p) => `${p.q},${p.r}`);
    expect(cells).not.toContain('0,0');
    expect(cells).not.toContain('1,0');
    expect(cells).toContain('2,0');
    expect(cells).not.toContain('5,0'); // 상대 입구 옆이지만 내 영향력 0
  });

  it('상대 땅이어도 내 뿌리가 닿으면 심을 수 있다', () => {
    const s = flatState([plant('pine', 'p1', 4, 0), plant('grass', 'p0', 2, 0)]);
    expect(legalPlantCells(s, 'p0', 'grass').some((p) => p.q === 3 && p.r === 0)).toBe(true);
  });

  it('연꽃: 연못 옆 빈 칸이면 영향력 없이도', () => {
    const s0 = flatState();
    const cells = s0.board!.cells.map((c) => (c.q === -3 && c.r === 4 ? { ...c, terrain: 'pond' as const } : c));
    const s = { ...s0, board: { ...s0.board!, cells } };
    expect(legalPlantCells(s, 'p0', 'lotus').some((p) => p.q === -2 && p.r === 4)).toBe(true);
    expect(legalPlantCells(s, 'p0', 'grass').some((p) => p.q === -2 && p.r === 4)).toBe(false);
    expect(legalPlantCells(s, 'p0', 'lotus').some((p) => p.q === -3 && p.r === 4)).toBe(false); // 연못 자체는 불가
  });

  it('씨앗 자리: 심는 칸에서 거리 2 이내 빈 칸', () => {
    const s = flatState();
    const seeds = legalSeedCells(s, { q: 1, r: 0 });
    expect(seeds.every((p) => hexDistance(p, { q: 1, r: 0 }) <= 2)).toBe(true);
    expect(seeds.some((p) => p.q === 0 && p.r === 0)).toBe(false); // 입구
    expect(seeds.some((p) => p.q === 1 && p.r === 0)).toBe(false); // 심는 칸 자신
  });
});

describe('로비 → 진행, 라운드 마켓 (Rules.md 4·5·6절)', () => {
  it('모두 준비하면 이번 판 식물 공개 단계: 손 1장씩, 마켓·차례 없음, 모두 확인하면 1라운드', () => {
    const r = revealAll(lobby(2));
    expect(r.phase).toBe('reveal');
    expect(r.currentPlayerId).toBeNull();
    expect(r.market).toHaveLength(0);
    expect(applyAction(r, { type: 'TAKE', playerId: 'p0', take: 0 }).error).toBeDefined();
    const r1 = ok(r, { type: 'CONFIRM', playerId: 'p1' });
    expect(r1.phase).toBe('reveal');
    expect(applyAction(r1, { type: 'CONFIRM', playerId: 'p1' }).error).toMatch(/이미/);
    expect(autoAction(r1, 'p0')).toEqual({ type: 'CONFIRM', playerId: 'p0' });
    const s = ok(r1, { type: 'CONFIRM', playerId: 'p0' });
    expect(s.phase).toBe('playing');
    expect(s.round).toBe(1);
    expect(s.stage).toBe('take');
    expect(s.board?.cells).toHaveLength(49);
    expect(s.goals).toHaveLength(3);
    expect(s.species).toHaveLength(rulesFor(2).gardenSize);
    expect(s.market).toHaveLength(2);
    for (const p of s.players) expect(p.hand).toHaveLength(START_HAND);
    const total = s.players.reduce((n, p) => n + p.hand.length, 0) + s.market.length + s.pile.length;
    expect(total).toBe(rulesFor(2).gardenSize * rulesFor(2).copies);
    expect([...s.pile, ...s.market, ...s.players.flatMap((p) => p.hand)].every((x) => s.species.includes(x))).toBe(true);
    expect(s.currentPlayerId).toBe('p0');
  });

  it('인원이 바뀌면 사람의 준비가 풀린다 (AI 를 넣자마자 시작하거나, 전원 준비인데 멈추는 일이 없다)', () => {
    let s = lobby(1);
    s = ok(s, { type: 'READY', playerId: 'p0' });
    expect(s.phase).toBe('lobby'); // 혼자는 시작 안 함
    s = joinPlayer(s, createPlayer('ai', 'AI', 'ai')).state;
    expect(s.phase).toBe('lobby');
    expect(s.players.find((p) => p.id === 'p0')!.isReady).toBe(false);
    expect(s.players.find((p) => p.id === 'ai')!.isReady).toBe(true);
    s = ok(s, { type: 'READY', playerId: 'p0' });
    expect(s.phase).toBe('reveal');
    expect(s.players.find((p) => p.id === 'ai')!.isReady).toBe(true); // AI 는 바로 확인
    s = ok(s, { type: 'CONFIRM', playerId: 'p0' });
    expect(s.phase).toBe('playing');

    let t = lobby(3);
    t = ok(t, { type: 'READY', playerId: 'p0' });
    t = ok(t, { type: 'READY', playerId: 'p1' });
    t = leaveLobby(t, 'p2').state;
    expect(t.phase).toBe('lobby');
    expect(t.players.every((p) => !p.isReady)).toBe(true);
  });

  it('이번 판 식물: 인원별 수, 보호구역 식물 필수, 꽃밭·숲이면 꽃·나무 하나 이상, 표 순서', () => {
    let seed = 7;
    for (let i = 0; i < 300; i++) {
      seed = nextRandom(seed).seed;
      const { goals, seed: next } = pickGoals(seed);
      for (const n of [2, 3, 4]) {
        const { species } = pickGarden(n, goals, next);
        expect(species).toHaveLength(rulesFor(n).gardenSize);
        expect(new Set(species).size).toBe(species.length);
        for (const g of goals) if (g.endsWith('-reserve')) expect(species).toContain(g.replace('-reserve', ''));
        if (goals.includes('flower-bed')) expect(species.some((x) => ['rapeseed', 'lotus', 'mugunghwa'].includes(x))).toBe(true);
        if (goals.includes('forest')) expect(species.some((x) => ['oak', 'bamboo'].includes(x))).toBe(true);
        const order = ['grass', 'oak', 'pine', 'kudzu', 'fern', 'dandelion', 'rapeseed', 'lotus', 'ivy', 'bamboo', 'mushroom', 'mugunghwa'];
        expect([...species].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(species);
      }
    }
  });

  it('PLANT 의 pos·seed 모양이 깨지면 예외가 아니라 거부', () => {
    const s = readyAll(lobby(2));
    const sp = s.players[0]!.hand[0]!;
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: sp, pos: null as never }).error).toMatch(/잘못된/);
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: sp, pos: { q: 0, r: 0 }, seed: null as never }).error).toMatch(/잘못된/);
  });

  it('카드 더미 셔플은 deckSeed 만 쓴다: 보드 시드가 같아도 deckSeed 가 다르면 손·더미가 다르다', () => {
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

  it('목표 3장에는 종 연계가 1장 이상, 큰 정원과 이어진 정원은 함께 안 나온다', () => {
    let seed = 1;
    for (let i = 0; i < 300; i++) {
      seed = nextRandom(seed).seed;
      const { goals } = pickGoals(seed);
      expect(goals).toHaveLength(3);
      expect(goals.some((g) => g.endsWith('-reserve'))).toBe(true);
      expect(goals.includes('big-garden') && goals.includes('connected')).toBe(false);
    }
  });

  it('가져오기: 내 차례에 마켓의 고른 카드가 손으로 오고, 모두 가져가면 선부터 심기 단계', () => {
    const s = readyAll(lobby(2));
    expect(s.stage).toBe('take');
    expect(applyAction(s, { type: 'TAKE', playerId: 'p1', take: 0 }).error).toMatch(/차례/);
    expect(applyAction(s, { type: 'TAKE', playerId: 'p0', take: 5 }).error).toMatch(/없는 카드/);
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: s.players[0]!.hand[0]!, pos: { q: 0, r: 0 } }).error).toMatch(/가져오세요/);
    const picked = s.market[1]!;
    const t = ok(s, { type: 'TAKE', playerId: 'p0', take: 1 });
    expect(t.players[0]!.hand).toHaveLength(START_HAND + 1);
    expect(t.players[0]!.hand[START_HAND]).toBe(picked);
    expect(t.market).toEqual([s.market[0]]);
    expect(t.log.some((e) => e.kind === 'take' && e.playerId === 'p0')).toBe(true);
    expect(t.currentPlayerId).toBe('p1');
    expect(t.stage).toBe('take');
    const u = ok(t, { type: 'TAKE', playerId: 'p1', take: 0 });
    expect(u.market).toHaveLength(0);
    expect(u.stage).toBe('plant');
    expect(u.currentPlayerId).toBe('p0');
    expect(applyAction(u, { type: 'TAKE', playerId: 'p0', take: 0 }).error).toMatch(/심을 차례/);
  });

  it('라운드: 가져오기(선부터) → 심기(선부터) 뒤 다음 라운드에 인원 수만큼 새로 펼친다', () => {
    let s = readyAll(lobby(3));
    const pileBefore = s.pile.length;
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(`${s.stage}:${s.currentPlayerId}`);
      s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    }
    expect(seen).toEqual(['take:p0', 'take:p1', 'take:p2', 'plant:p0', 'plant:p1', 'plant:p2']);
    expect(s.round).toBe(2);
    expect(s.stage).toBe('take');
    expect(s.market).toHaveLength(3);
    expect(s.pile).toHaveLength(pileBefore - 3);
    for (const p of s.players) expect(p.hand).toHaveLength(START_HAND);
  });

  it('다음 선: 점수가 가장 낮은 사람, 동점이면 이번 선 다음 자리부터 시계방향 첫 동점자', () => {
    // flatState: 입구만 있는 2인 보드. p0 이 앞서면 p1 이 선
    const base = { ...flatState(), roundStart: 0 };
    const ahead = flatState([plant('oak', 'p0', 1, 0)]);
    expect(nextRoundStart({ ...ahead, roundStart: 0 })).toBe(1);
    expect(nextRoundStart({ ...ahead, roundStart: 1 })).toBe(1);
    // 동점: 이번 선 다음 자리
    expect(computeScores(base)['p0']!.total).toBe(computeScores(base)['p1']!.total);
    expect(nextRoundStart({ ...base, roundStart: 0 })).toBe(1);
    expect(nextRoundStart({ ...base, roundStart: 1 })).toBe(0);
  });

  it('라운드가 넘어갈 때 선은 직전 상태의 nextRoundStart 와 같고, 가져오기·심기 모두 그 자리부터 (4인 끝까지)', () => {
    let s = readyAll(lobby(4, 9));
    for (let i = 0; i < 400 && s.phase === 'playing'; i++) {
      const before = s;
      s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
      if (s.phase === 'playing' && s.round !== before.round) {
        // 마켓 펼치기는 점수를 바꾸지 않으므로, 새 라운드 보드에 직전 선을 넣어 고른 결과와 같아야 한다
        expect(s.roundStart).toBe(nextRoundStart({ ...s, roundStart: before.roundStart }));
        expect(s.players.find((p) => p.id === s.currentPlayerId)!.seat).toBe(s.roundStart);
      }
    }
    expect(s.phase).toBe('finished');
  });

  it('기권으로 마켓이 인원보다 적게 펼쳐져도 손이 남지 않고 정상 종료한다 (4인, 둘째 라운드 심기 중 차례 아닌 사람 기권)', () => {
    let s = readyAll(lobby(4, 3));
    while (s.round < 2 || s.stage !== 'plant') s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    const notCurrent = s.players.find((p) => p.id !== s.currentPlayerId)!.id;
    const cur = s.currentPlayerId;
    s = ok(s, { type: 'SURRENDER', playerId: notCurrent });
    expect(s.currentPlayerId).toBe(cur);
    for (let i = 0; i < 400 && s.phase === 'playing'; i++) {
      expect(s.players.find((p) => p.seat === s.roundStart)!.surrenderedOrder).toBeNull();
      s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    }
    expect(s.result?.reason).toBe('complete');
    for (const p of s.players) expect(p.hand).toHaveLength(0);
  });

  it('다음 선은 기권하지 않은 사람 중에서 고른다 (3인)', () => {
    let s = readyAll(lobby(3));
    s = ok(s, { type: 'SURRENDER', playerId: 'p1' });
    for (let i = 0; i < 40 && s.phase === 'playing'; i++) {
      expect(s.players.find((p) => p.seat === s.roundStart)!.surrenderedOrder).toBeNull();
      s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    }
  });

  it('가져오기 차례인 사람이 기권하면 다음 사람이 가져오고, 다음 라운드 마켓은 남은 인원 수만큼', () => {
    let s = readyAll(lobby(3));
    s = ok(s, autoAction(s, 'p0')!);
    expect(s.currentPlayerId).toBe('p1');
    s = ok(s, { type: 'SURRENDER', playerId: 'p1' });
    expect(s.players[1]!.hand).toHaveLength(0);
    expect(s.currentPlayerId).toBe('p2');
    expect(s.stage).toBe('take');
    s = ok(s, autoAction(s, 'p2')!);
    expect(s.stage).toBe('plant');
    expect(s.market).toHaveLength(1); // 남은 1장은 라운드가 바뀌면 버려진다
    const pileBefore = s.pile.length;
    s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    expect(s.round).toBe(2);
    expect(s.market).toHaveLength(2);
    expect(s.pile).toHaveLength(pileBefore - 2);
  });

  it('버리기: 어떤 카드도 심을 칸이 없을 때만, 심기 단계에서', () => {
    let s0 = readyAll(lobby(2));
    s0 = ok(s0, autoAction(s0, 'p0')!);
    s0 = ok(s0, autoAction(s0, 'p1')!);
    expect(s0.stage).toBe('plant');
    // 심을 칸이 없게: 모든 빈 칸을 바위로 만든다
    const cells = s0.board!.cells.map((c) => (s0.board!.entrances.some((e) => e.q === c.q && e.r === c.r) ? c : { ...c, terrain: 'rock' as const }));
    const s = { ...s0, board: { ...s0.board!, cells } };
    expect(hasAnyPlant(s, 'p0')).toBe(false);
    const sp = s.players[0]!.hand[0]!;
    expect(autoAction(s, 'p0')).toEqual({ type: 'DISCARD', playerId: 'p0', species: sp });
    const t = ok(s, { type: 'DISCARD', playerId: 'p0', species: sp });
    expect(t.players[0]!.hand).toHaveLength(START_HAND);
    expect(t.log.some((e) => e.kind === 'discard')).toBe(true);
    expect(t.currentPlayerId).toBe('p1');
  });

  it('더미가 떨어지면 마켓 없이 바로 심기 단계', () => {
    let s = readyAll(lobby(2));
    s = ok(s, autoAction(s, 'p0')!);
    s = ok(s, autoAction(s, 'p1')!);
    s = { ...s, pile: [] };
    s = ok(s, autoAction(s, 'p0')!);
    s = ok(s, autoAction(s, 'p1')!);
    expect(s.round).toBe(2);
    expect(s.market).toHaveLength(0);
    expect(s.stage).toBe('plant');
    expect(autoAction(s, s.currentPlayerId as PlayerId)!.type).toBe('PLANT');
  });

  it('남의 차례·손패에 없는 카드·뿌리가 안 닿는 칸은 거부', () => {
    const s = toPlant(readyAll(lobby(2)));
    const sp = s.players[0]!.hand[0]!;
    expect(applyAction(s, { type: 'PLANT', playerId: 'p1', species: s.players[1]!.hand[0]!, pos: { q: 0, r: 0 } }).error).toMatch(/차례/);
    const notInHand = (['grass', 'oak', 'pine', 'kudzu', 'fern', 'dandelion', 'rapeseed', 'lotus', 'ivy', 'bamboo', 'mushroom', 'mugunghwa'] as SpeciesId[]).find((x) => !s.players[0]!.hand.includes(x))!;
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: notInHand, pos: { q: 0, r: 0 } }).error).toMatch(/손에 없는/);
    const far = s.board!.entrances[1]!;
    expect(applyAction(s, { type: 'PLANT', playerId: 'p0', species: sp, pos: far }).error).toBeDefined();
  });

  it('칡은 방향이 필요하고, 다른 종은 방향을 받지 않는다', () => {
    const s = flatState();
    const withHand = { ...s, players: s.players.map((p) => (p.id === 'p0' ? { ...p, hand: ['kudzu', 'grass', 'grass'] as SpeciesId[] } : p)) };
    expect(applyAction(withHand, { type: 'PLANT', playerId: 'p0', species: 'kudzu', pos: { q: 1, r: 0 } }).error).toMatch(/방향/);
    expect(applyAction(withHand, { type: 'PLANT', playerId: 'p0', species: 'grass', pos: { q: 1, r: 0 }, direction: 0 }).error).toMatch(/방향/);
    expect(applyAction(withHand, { type: 'PLANT', playerId: 'p0', species: 'kudzu', pos: { q: 1, r: 0 }, direction: 0 }).error).toBeUndefined();
  });

  it('민들레 씨앗: 거리 2 이내 빈 칸만', () => {
    const s = flatState();
    const withHand = { ...s, players: s.players.map((p) => (p.id === 'p0' ? { ...p, hand: ['dandelion', 'grass', 'grass'] as SpeciesId[] } : p)) };
    expect(applyAction(withHand, { type: 'PLANT', playerId: 'p0', species: 'dandelion', pos: { q: 1, r: 0 }, seed: { q: 5, r: 0 } }).error).toMatch(/씨앗/);
    const t = ok(withHand, { type: 'PLANT', playerId: 'p0', species: 'dandelion', pos: { q: 1, r: 0 }, seed: { q: 3, r: 0 } });
    expect(t.seeds).toEqual([{ ownerId: 'p0', pos: { q: 3, r: 0 } }]);
  });

  it('버리기: 심을 칸이 있으면 거부', () => {
    const s = toPlant(readyAll(lobby(2)));
    expect(hasAnyPlant(s, 'p0')).toBe(true);
    expect(applyAction(s, { type: 'DISCARD', playerId: 'p0', species: s.players[0]!.hand[0]! }).error).toMatch(/버릴 수 없/);
  });

  it('상대 땅을 뺏으면 flip 로그가 남는다', () => {
    const s = flatState([plant('grass', 'p1', 3, 0)]);
    // p0 가 (1,0) 에 참나무: (2,0) 은 p1 잔디 둘레 1 → p0 참나무 둘레 2 로 뒤집힌다
    const withHand = { ...s, players: s.players.map((p) => (p.id === 'p0' ? { ...p, hand: ['oak', 'grass', 'grass'] as SpeciesId[] } : p)) };
    const before = computeScores(withHand);
    const t = ok(withHand, { type: 'PLANT', playerId: 'p0', species: 'oak', pos: { q: 1, r: 0 } });
    expect(computeScores(t)['p1']!.land).toBeLessThan(before['p1']!.land);
    expect(t.log.some((e) => e.kind === 'flip')).toBe(true);
  });
});

describe('종료·점수·순위 (Rules.md 8·9절)', () => {
  /** 자동 수로 끝까지 둔다 */
  function playOut(n: number, seed: number): GameState {
    let s = readyAll(lobby(n, seed));
    for (let i = 0; i < 500 && s.phase === 'playing'; i++) s = ok(s, autoAction(s, s.currentPlayerId as PlayerId)!);
    return s;
  }

  it.each([2, 3, 4])('%i인: 덱을 다 쓰면 끝나고, 모두 같은 횟수(15/16번)를 둔다', (n) => {
    const s = playOut(n, 11 + n);
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('complete');
    const turns = n === 2 ? 15 : 16;
    for (const p of s.players) {
      const acted = s.log.filter((e) => e.playerId === p.id && (e.kind === 'plant' || e.kind === 'discard')).length;
      expect(acted).toBe(turns);
      expect(p.hand).toHaveLength(0);
    }
    expect(s.plants.length).toBeGreaterThan(0);
    expect(s.result!.ranking).toHaveLength(n);
  });

  it('점수 = 땅 + 목표 + 무궁화 + 덤, 순위는 점수 → 땅 → 좌석 큰 쪽', () => {
    const s = playOut(3, 5);
    const scores = s.result!.scores;
    for (const p of s.players) {
      const sc = scores[p.id]!;
      expect(sc.total).toBe(sc.land + sc.goals + sc.bloom + sc.komi);
      expect(sc.goalBreakdown).toHaveLength(3);
      expect(sc.komi).toBe(rulesFor(3).komi[p.seat]);
    }
    const ranking = s.result!.ranking;
    for (let i = 1; i < ranking.length; i++) {
      const a = scores[ranking[i - 1]!]!;
      const b = scores[ranking[i]!]!;
      expect(a.total > b.total || (a.total === b.total && a.land >= b.land)).toBe(true);
    }
  });

  it('땅 점수는 computeOwners 와 같다 (파생값 일치)', () => {
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
    expect(r.market).toHaveLength(2);
    let t = revealAll(lobby(2));
    t = ok(t, { type: 'SURRENDER', playerId: 'p1' });
    expect(t.phase).toBe('finished');
  });

  it('기권: 차례를 건너뛰고 순위 맨 아래, 1명만 남으면 종료', () => {
    let s = readyAll(lobby(3));
    s = ok(s, { type: 'SURRENDER', playerId: 'p1' });
    s = ok(s, autoAction(s, 'p0')!);
    expect(s.currentPlayerId).toBe('p2');
    s = ok(s, { type: 'SURRENDER', playerId: 'p2' });
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('last-standing');
    expect(s.result?.ranking).toEqual(['p0', 'p2', 'p1']);
    expect(computeRanking(s)).toEqual(['p0', 'p2', 'p1']);
  });

  it('같은 시드·같은 수 → 같은 결과 (결정성)', () => {
    expect(playOut(4, 77)).toEqual(playOut(4, 77));
  });

  it('입력 상태를 바꾸지 않는다 (순수 함수)', () => {
    const s = readyAll(lobby(2));
    const snapshot = JSON.stringify(s);
    applyAction(s, autoAction(s, 'p0')!);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('목표 점수 (Rules.md 8절)', () => {
  const withGoals = (s: GameState, goals: GameState['goals']) => ({ ...s, goals });

  it('종 연계: 내 땅 위의 내 그 종 식물 1개당 +2, 뺏긴 칸은 0', () => {
    const s = withGoals(flatState([plant('pine', 'p0', 2, 2), plant('pine', 'p1', 8, 2), plant('grass', 'p0', 7, 2), plant('oak', 'p0', 8, 1), plant('oak', 'p0', 9, 1)]), ['pine-reserve']);
    const sc = computeScores(s);
    expect(sc['p0']!.goalBreakdown[0]).toBe(2);
    // p1 소나무(8,2): p1 5 vs p0 잔디 1 + 참나무 2 + 2 = 5 → 동점이라 p1 땅 아님 → 0
    expect(sc['p1']!.goalBreakdown[0]).toBe(0);
  });

  it('큰 정원: 동점 1등은 모두 1등 점수, 2등 없음', () => {
    const s = withGoals(flatState(), ['big-garden']);
    const sc = computeScores(s);
    expect(sc['p0']!.goalBreakdown[0]).toBe(6);
    expect(sc['p1']!.goalBreakdown[0]).toBe(6);
  });

  it('여러 가지 심기: 서로 다른 식물 5종 이상이면 +4', () => {
    const four = ['grass', 'oak', 'pine', 'bamboo'] as const;
    const s4 = withGoals(flatState(four.map((sp, i) => plant(sp, 'p0', i - 2, 2))), ['variety']);
    expect(computeScores(s4)['p0']!.goalBreakdown[0]).toBe(0);
    const s5 = withGoals(flatState([...four, 'ivy' as const].map((sp, i) => plant(sp, 'p0', i - 2, 2))), ['variety']);
    expect(computeScores(s5)['p0']!.goalBreakdown[0]).toBe(4);
    expect(computeScores(s5)['p1']!.goalBreakdown[0]).toBe(0);
  });

  it('무궁화: 끝날 때 그 칸이 내 땅이면 +1', () => {
    const s = flatState([plant('mugunghwa', 'p0', 2, 2)]);
    expect(computeScores(s)['p0']!.bloom).toBe(1);
  });
});
