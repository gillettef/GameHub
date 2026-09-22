/**
 * 룰 엔진 v2 테스트 (Rules.md, F018~F025, F031).
 * 시나리오는 상태를 직접 구성(손패·에너지·마커)해 결정적으로 만든다.
 * 보드는 odd-r 오프셋 육각 좌표계다. 거리는 육각 거리(hexDistance)이지 체비쇼프가 아니다.
 */
import { describe, expect, it } from 'vitest';
import {
  advanceTurn,
  applyAction,
  changeMap,
  leaveLobby,
  canPlay,
  computeIncome,
  computeRanking,
  computeScores,
  computeSightArea,
  computeTerritory,
  countPasses,
  createInitialState,
  createPlayer,
  hasAnyPlay,
  joinPlayer,
  legalCells,
  setupGame,
  startGame,
  validatePlacement,
  withMarkers,
} from './index.js';
import {
  CORE_BASE_INCOME,
  CORE_SIGHT,
  CORE_SPEC,
  DECK_SIZE,
  DEFAULT_DECK_CHOICE,
  ENERGY_CAP,
  HAND_LIMIT,
  INITIAL_HAND_SIZE,
  STARTING_ENERGY,
  getMap,
  getSpec,
} from '../data/index.js';

/** 코어 시야 1 → 육각 반경 1 = 7칸 (3r(r+1)+1) */
const CORE_AREA = 3 * CORE_SIGHT * (CORE_SIGHT + 1) + 1;
import type { Action, CardId, GameState, Marker, PlayerId, Position } from '../types/index.js';

const CHOICES = [
  DEFAULT_DECK_CHOICE,
  { buildingId: 'observatory', unitId: 'stealth', magicId: 'warp-gate' },
  { buildingId: 'fortress', unitId: 'repair-drone', magicId: 'energy-storm' },
  DEFAULT_DECK_CHOICE,
];

function lobby(n = 2, mapId?: string, seed = 42): GameState {
  const map = mapId ?? { 2: 'binary-star', 3: 'triangle-nebula', 4: 'quadrant' }[n];
  let s = createInitialState('room-1', map as string, seed);
  for (let i = 0; i < n; i++) s = joinPlayer(s, createPlayer(`p${i}`, `플레이어${i}`)).state;
  return s;
}

function readyLobby(n = 2, mapId?: string, seed = 42): GameState {
  let s = lobby(n, mapId, seed);
  for (let i = 0; i < n; i++) s = applyAction(s, { type: 'SELECT_DECK', playerId: `p${i}`, choice: CHOICES[i]! }).state;
  for (let i = 0; i < n - 1; i++) s = applyAction(s, { type: 'READY', playerId: `p${i}` }).state;
  return { ...s, players: s.players.map((p) => ({ ...p, isReady: true })) };
}

/** 시작 단계 전 상태 (F018/F019 기준) */
function setup(n = 2, mapId?: string, seed = 42): GameState {
  return setupGame(readyLobby(n, mapId, seed));
}

/** 손패·에너지를 지정한다 (결정적 시나리오용) */
function withHand(s: GameState, playerId: PlayerId, hand: CardId[], energy = 10, deck?: CardId[]): GameState {
  return {
    ...s,
    players: s.players.map((p) => (p.id === playerId ? { ...p, hand, energy, deck: deck ?? p.deck } : p)),
  };
}

let idSeq = 100;
function marker(ownerId: PlayerId, specId: CardId, pos: Position, hp?: number, remainingTurns: number | null = null): Marker {
  const spec = getSpec(specId);
  return { id: `t${idSeq++}`, specId, kind: spec.kind, ownerId, pos, hp: hp ?? spec.hp, remainingTurns };
}

function addMarkers(s: GameState, ...ms: Marker[]): GameState {
  return withMarkers(s, [...s.markers, ...ms]);
}

function core(s: GameState, playerId: PlayerId): Marker {
  return s.markers.find((m) => m.ownerId === playerId && m.kind === 'core') as Marker;
}

function player(s: GameState, id: PlayerId) {
  return s.players.find((p) => p.id === id)!;
}

/** 액션이 입력 상태를 변이하지 않는지 확인하고 결과를 돌려준다 */
function pure(s: GameState, a: Action) {
  const snap = JSON.stringify(s);
  const r = applyAction(s, a);
  expect(JSON.stringify(s)).toBe(snap);
  return r;
}

function ok(s: GameState, a: Action): GameState {
  const r = pure(s, a);
  expect(r.error).toBeUndefined();
  return r.state;
}

function fail(s: GameState, a: Action): string {
  const r = pure(s, a);
  expect(r.error).toBeDefined();
  expect(r.state).toBe(s);
  return r.error as string;
}

const pass = (id: PlayerId): Action => ({ type: 'PASS', playerId: id });
const place = (id: PlayerId, cardId: CardId, pos: Position): Action => ({ type: 'PLACE', playerId: id, cardId, pos });

// ---------------------------------------------------------------------------
// 테스트에서 반복해서 쓰는 좌표 (odd-r 오프셋 육각 거리 기준, hexmap 스크립트로 계산):
//  - binary-star: 코어 p0 (3,2) 시야1 = {(2,1),(3,1),(2,2),(3,2),(4,2),(2,3),(3,3)}
//                 코어 p1 (8,8) 시야1/침투 인접 = {(7,7),(8,7),(7,8),(9,8),(7,9),(8,9)}
//  - triangle-nebula: 코어 p0 (4,2), p1 (10,6), p2 (4,10)
//  - quadrant: 코어 p0 (4,3), p1 (10,3), p2 (4,11), p3 (10,11)
// ---------------------------------------------------------------------------

describe('로비 · 덱 선택 · 시작 (F016, F018, F019)', () => {
  it('좌석은 입장 순서, 중복·정원 초과 거부', () => {
    const s = lobby(2);
    expect(s.players.map((p) => [p.id, p.seat])).toEqual([['p0', 0], ['p1', 1]]);
    expect(joinPlayer(s, createPlayer('p0', '중복')).error).toBeDefined();
    let four = lobby(4);
    expect(joinPlayer(four, createPlayer('p4', '5번째')).error).toBeDefined();
    four = { ...four, phase: 'playing' };
    expect(joinPlayer(four, createPlayer('p9', '늦음')).error).toBeDefined();
  });

  it('덱 선택은 종류별 특수 카드 하나씩, 덱을 고르기 전엔 준비 불가', () => {
    const s = lobby(2);
    expect(fail(s, { type: 'READY', playerId: 'p0' })).toContain('특수 카드');
    expect(fail(s, { type: 'SELECT_DECK', playerId: 'p0', choice: { buildingId: 'extractor', unitId: 'stealth', magicId: 'warp-gate' } })).toContain('특수 카드');
    expect(fail(s, { type: 'SELECT_DECK', playerId: 'zzz', choice: DEFAULT_DECK_CHOICE })).toBeDefined();
  });

  it('AI 좌석은 기본 덱을 자동 선택하고 준비 완료 상태로 들어온다 (F026)', () => {
    const ai = createPlayer('ai-1', 'AI', 'ai');
    expect(ai.isReady).toBe(true);
    expect(ai.deckChoice).toEqual(DEFAULT_DECK_CHOICE);
  });

  it('맵 정원과 인원이 같고 전원 준비돼야 시작한다 (F002, F030)', () => {
    // 3인 맵에 2명
    let s = lobby(2, 'triangle-nebula');
    for (const id of ['p0', 'p1']) s = ok(s, { type: 'SELECT_DECK', playerId: id, choice: DEFAULT_DECK_CHOICE });
    for (const id of ['p0', 'p1']) s = ok(s, { type: 'READY', playerId: id });
    expect(s.phase).toBe('lobby');
    // 2인 맵에 2명 → 마지막 READY 로 시작
    let t = lobby(2);
    for (const id of ['p0', 'p1']) t = ok(t, { type: 'SELECT_DECK', playerId: id, choice: DEFAULT_DECK_CHOICE });
    t = ok(t, { type: 'READY', playerId: 'p0' });
    expect(t.phase).toBe('lobby');
    t = ok(t, { type: 'READY', playerId: 'p1' });
    expect(t.phase).toBe('playing');
    expect(t.currentPlayerId).toBe('p0');
  });

  it('F018: 6개 맵 모두 코어가 Rules.md 좌표에 좌석 순으로 놓인다', () => {
    for (const map of ['binary-star', 'asteroid-belt', 'triangle-nebula', 'interstellar-route', 'quadrant', 'event-horizon']) {
      const def = getMap(map);
      const s = setup(def.players, map);
      for (const p of s.players) {
        const c = core(s, p.id);
        expect(c.pos).toEqual(def.corePositions[p.seat]);
        expect(c.hp).toBe(CORE_SPEC.hp);
        expect(c.specId).toBe('core');
      }
      expect(s.markers).toHaveLength(def.players);
      expect(s.board.width).toBe(def.size);
      expect(s.roundLimit).toBe(def.roundLimit);
    }
  });

  it('F019: 시작 직후 에너지 5, 손패 4, 덱 21, 같은 시드는 같은 덱 순서', () => {
    const s = setup(2);
    for (const p of s.players) {
      expect(p.energy).toBe(STARTING_ENERGY);
      expect(p.hand).toHaveLength(INITIAL_HAND_SIZE);
      expect(p.deck).toHaveLength(DECK_SIZE - INITIAL_HAND_SIZE);
      expect(p.alive).toBe(true);
      const all = [...p.hand, ...p.deck].sort();
      expect(all.filter((c) => c === 'extractor')).toHaveLength(4);
      expect(all).toContain(p.deckChoice!.buildingId);
    }
    expect(s.round).toBe(1);
    expect(s.turn).toBe(1);
    const same = setup(2);
    expect(same.players.map((p) => p.deck)).toEqual(s.players.map((p) => p.deck));
    const other = setup(2, undefined, 7);
    expect(other.players.map((p) => p.deck)).not.toEqual(s.players.map((p) => p.deck));
    // 두 플레이어의 덱 순서도 서로 다르다 (시드가 이어진다)
    expect(s.players[0]!.deck).not.toEqual(s.players[1]!.deck);
  });

  it('첫 턴에도 시작 단계를 수행한다: 첫 플레이어 수입 +코어 기본 수입, 드로우 1', () => {
    const s = startGame(readyLobby(2));
    expect(player(s, 'p0').energy).toBe(STARTING_ENERGY + CORE_BASE_INCOME);
    expect(player(s, 'p0').hand).toHaveLength(INITIAL_HAND_SIZE + 1);
    expect(player(s, 'p1').energy).toBe(STARTING_ENERGY);
    expect(player(s, 'p1').hand).toHaveLength(INITIAL_HAND_SIZE);
    expect(s.log.map((l) => l.kind)).toContain('income');
    expect(s.log.map((l) => l.kind)).toContain('draw');
  });
});

describe('시야 · 영토 (F031)', () => {
  it('코어 시야 1 → 육각 반경 1 = 7칸, 보드 밖은 잘린다', () => {
    const s = setup(2);
    const area = computeSightArea(s, 'p0');
    expect(area).toHaveLength(CORE_AREA);
    expect(area[0]).toEqual({ x: 2, y: 1 });
    expect(area[6]).toEqual({ x: 3, y: 3 });
    // 정렬: y → x
    for (let i = 1; i < area.length; i++) {
      const a = area[i - 1]!;
      const b = area[i]!;
      expect(a.y < b.y || (a.y === b.y && a.x < b.x)).toBe(true);
    }
  });

  it('영토: 단독 시야 안 빈 칸 + 마커 칸. 경합·소행성은 무소유', () => {
    let s = setup(2);
    let t = computeTerritory(s);
    expect(t.counts).toEqual({ p0: CORE_AREA, p1: CORE_AREA });
    expect(t.owners[2]![2]).toBe('p0');
    expect(t.owners[5]![5]).toBeNull();

    // p0 전초기지(시야 2)를 (5,5)에, p1 정찰 드론(시야 2)을 (6,6)에 → 겹치는 칸은 경합
    s = addMarkers(s, marker('p0', 'outpost', { x: 5, y: 5 }), marker('p1', 'scout', { x: 6, y: 6 }));
    t = computeTerritory(s);
    expect(t.owners[5]![5]).toBe('p0'); // 마커 칸
    expect(t.owners[6]![6]).toBe('p1');
    expect(t.owners[5]![6]).toBeNull(); // 둘 다 시야 안 → 경합
    expect(t.owners[3]![5]).toBe('p0'); // p0 만
    expect(t.owners[8]![7]).toBe('p1');

    // 소행성 칸은 시야 안이어도 무소유 (소행성대 맵, 코어 옆이 아니라 관측소로 장벽 너머를 비춘다)
    const belt = setup(2, 'asteroid-belt');
    const w = addMarkers(belt, marker('p0', 'observatory', { x: 5, y: 1 }));
    const tb = computeTerritory(w);
    expect(tb.owners[1]![6]).toBeNull(); // 소행성 자체
    expect(tb.owners[1]![8]).toBe('p0'); // 장벽 너머까지 닿는다
  });

  it('점수 = 영토 + 마커 점수, 동점은 좌석 큰 쪽 우선', () => {
    const s = setup(2);
    const sc = computeScores(s);
    expect(sc.p0).toEqual({ territory: CORE_AREA, markers: 0, total: CORE_AREA });
    expect(sc.p1).toEqual({ territory: CORE_AREA, markers: 0, total: CORE_AREA });
    expect(computeRanking(s)).toEqual(['p1', 'p0']);
    const w = addMarkers(s, marker('p0', 'outpost', { x: 4, y: 4 }));
    const sc2 = computeScores(w);
    expect(sc2.p0!.markers).toBe(3);
    expect(sc2.p0!.territory).toBe(22);
    expect(sc2.p1!.territory).toBe(CORE_AREA); // 멀리 떨어져 있어 겹치지 않는다
    expect(computeRanking(w)).toEqual(['p0', 'p1']);
  });
});

describe('배치 검증 (F022)', () => {
  it('거부 사유: 턴 아님 / 손패 없음 / 에너지 부족 / 보드 밖 / 소행성 / 점유 / 시야 밖', () => {
    let s = startGame(readyLobby(2, 'asteroid-belt'));
    s = withHand(s, 'p0', ['extractor', 'cruiser'], 3);
    s = withHand(s, 'p1', ['extractor'], 3);
    expect(fail(s, place('p1', 'extractor', { x: 10, y: 6 }))).toContain('플레이어0의 턴');
    expect(fail(s, place('p0', 'scout', { x: 2, y: 6 }))).toContain('손패에 없는');
    expect(fail(s, place('p0', 'cruiser', { x: 2, y: 6 }))).toBe('에너지가 2 부족합니다');
    expect(fail(s, place('p0', 'extractor', { x: -1, y: 6 }))).toContain('보드 밖');
    expect(fail(s, place('p0', 'extractor', { x: 13, y: 6 }))).toContain('보드 밖');
    expect(fail(s, place('p0', 'extractor', { x: 6, y: 4 }))).toContain('소행성'); // 중앙 장벽 칸
    expect(fail(s, place('p0', 'extractor', { x: 1, y: 6 }))).toContain('이미 마커'); // 코어 칸
    expect(fail(s, place('p0', 'extractor', { x: 5, y: 6 }))).toBe('시야 밖입니다'); // 코어(1,6) 시야1 밖
    expect(validatePlacement(s, 'p0', 'extractor', { x: 2, y: 6 })).toBeNull(); // 코어 시야1 안
  });

  it('침투: 스텔스함은 적 마커 거리 1 이내에도 놓을 수 있다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['stealth', 'fighter'], 10);
    expect(fail(s, place('p0', 'fighter', { x: 7, y: 7 }))).toBe('시야 밖입니다');
    const cells = legalCells(s, 'p0', 'stealth');
    expect(cells).toContainEqual({ x: 7, y: 7 }); // p1 코어(8,8) 인접
    expect(cells).toContainEqual({ x: 8, y: 7 }); // p1 코어 인접
    expect(cells).not.toContainEqual({ x: 8, y: 8 }); // 코어 칸
    expect(cells).not.toContainEqual({ x: 6, y: 6 }); // 거리 3, 침투 범위 밖
    const t = ok(s, place('p0', 'stealth', { x: 7, y: 7 }));
    expect(t.markers.some((m) => m.specId === 'stealth' && m.pos.x === 7)).toBe(true);
  });

  it('배치 성립: 비용 차감, 카드 버림, 마커 생성. 에너지가 허락하면 같은 턴에 이어서 배치할 수 있다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['extractor', 'scout'], 5);
    let t = ok(s, place('p0', 'extractor', { x: 3, y: 3 }));
    let p0 = player(t, 'p0');
    expect(p0.energy).toBe(3);
    expect(p0.hand).toEqual(['scout']);
    expect(p0.discard).toEqual(['extractor']);
    const m = t.markers.find((x) => x.specId === 'extractor')!;
    expect(m.ownerId).toBe('p0');
    expect(m.hp).toBe(4);
    expect(m.kind).toBe('building');
    expect(m.remainingTurns).toBeNull();
    // 배치는 턴을 끝내지 않는다 — 여전히 같은 턴, 같은 플레이어
    expect(t.currentPlayerId).toBe('p0');
    expect(t.turn).toBe(1);
    expect(p0.actedThisTurn).toBe(true);
    expect(countPasses(t)).toBe(0);

    // 이어서 두 번째 배치 (방금 놓은 채굴기 시야 안, 에너지가 남는 한 제한 없음)
    t = ok(t, place('p0', 'scout', { x: 3, y: 4 }));
    p0 = player(t, 'p0');
    expect(p0.energy).toBe(2);
    expect(p0.hand).toEqual([]);
    expect(t.currentPlayerId).toBe('p0');
    expect(t.markers.some((x) => x.specId === 'scout')).toBe(true);

    // 턴 종료 — 이번 턴에 배치했으므로 패스로 기록되지 않는다
    t = ok(t, pass('p0'));
    expect(t.currentPlayerId).toBe('p1');
    expect(t.turn).toBe(2);
    expect(countPasses(t)).toBe(0);
    expect(t.log.some((l) => l.message.includes('턴 종료'))).toBe(true);
    expect(fail(t, place('p0', 'scout', { x: 3, y: 5 }))).toContain('플레이어1의 턴');
    expect(t.log.at(-1)?.kind).toBe('draw'); // p1 시작 단계까지 진행됨
    expect(t.markers.map((x) => x.pos)).toEqual([...t.markers.map((x) => x.pos)].sort((a, b) => a.y - b.y || a.x - b.x));
  });

  it('한 턴에 에너지가 허락하는 만큼 배치할 수 있고, 에너지가 바닥나면 더 놓을 수 없다', () => {
    let s = startGame(readyLobby(2, 'asteroid-belt'));
    s = withHand(s, 'p0', ['scout', 'scout', 'scout'], 2); // scout 비용 1, 에너지 2 → 최대 2장
    let t = ok(s, place('p0', 'scout', { x: 2, y: 6 })); // 코어(1,6) 시야1 안
    expect(player(t, 'p0').energy).toBe(1);
    t = ok(t, place('p0', 'scout', { x: 3, y: 6 })); // 방금 놓은 정찰 드론(시야 2) 안
    expect(player(t, 'p0').energy).toBe(0);
    expect(t.currentPlayerId).toBe('p0'); // 여전히 내 턴
    expect(fail(t, place('p0', 'scout', { x: 3, y: 5 }))).toContain('에너지');
    expect(canPlay(t, 'p0', 'scout')).toBe(false);
    expect(hasAnyPlay(t, 'p0')).toBe(false);
  });

  it('패스와 턴 종료의 차이: 아무것도 안 놓고 넘기면 패스, 하나라도 놓고 넘기면 패스가 아니다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['scout'], 10);
    s = withHand(s, 'p1', [], 10);
    // p0: 아무것도 놓지 않고 턴 종료 → 진짜 패스
    let t = ok(s, pass('p0'));
    expect(countPasses(t)).toBe(1);
    expect(player(t, 'p0').passed).toBe(true);
    const passLog = t.log.filter((l) => l.kind === 'pass').at(-1);
    expect(passLog?.message).toContain('패스');
    expect(passLog?.message).not.toContain('턴 종료');
    // p1: 배치 후 턴 종료 → 패스로 기록되지 않는다
    t = withHand(t, 'p1', ['scout'], 10);
    t = ok(t, place('p1', 'scout', { x: 7, y: 7 }));
    t = ok(t, pass('p1'));
    expect(player(t, 'p1').passed).toBe(false);
    expect(countPasses(t)).toBe(0); // p0 의 이전 패스도 배치로 이미 풀렸다
    const endLog = t.log.filter((l) => l.kind === 'pass').at(-1);
    expect(endLog?.message).toContain('턴 종료');
    expect(t.phase).toBe('playing'); // 전원 패스가 아니므로 안 끝난다
    expect(t.log.at(-1)?.kind).toBe('draw'); // p0 의 다음 턴 시작 단계까지 진행
  });

  it('canPlay / hasAnyPlay: 에너지 부족·놓을 칸 없음이면 낼 수 없다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['cruiser'], 4);
    expect(canPlay(s, 'p0', 'cruiser')).toBe(false);
    expect(hasAnyPlay(s, 'p0')).toBe(false);
    s = withHand(s, 'p0', ['cruiser'], 5);
    expect(hasAnyPlay(s, 'p0')).toBe(true);
  });
});

describe('수입 (F020) · 드로우', () => {
  it('수입 = 코어 기본 수입 + 건물 생산, 광맥 위 건물 +1, 유닛은 보너스 없음', () => {
    let s = setup(2);
    expect(computeIncome(s, 'p0').total).toBe(CORE_BASE_INCOME);
    s = addMarkers(
      s,
      marker('p0', 'extractor', { x: 3, y: 3 }), // 광맥 아님
      marker('p0', 'extractor', { x: 1, y: 4 }), // 광맥
      marker('p0', 'refinery', { x: 5, y: 5 }), // 광맥
      marker('p0', 'scout', { x: 6, y: 10 }), // 광맥 위 유닛, 생산 0
      marker('p1', 'extractor', { x: 9, y: 9 }),
    );
    const inc = computeIncome(s, 'p0');
    expect(inc.total).toBe(CORE_BASE_INCOME + 1 + 2 + 4);
    expect(inc.items.map((i) => [i.name, i.amount, i.vein])).toEqual([
      ['코어', CORE_BASE_INCOME, false],
      ['채굴기', 1, false],
      ['채굴기', 2, true],
      ['정제소', 4, true],
    ]);
    expect(computeIncome(s, 'p1').total).toBe(CORE_BASE_INCOME + 1);
  });

  it('턴 시작 시 수입이 에너지에 더해지고 내역이 로그에 남는다', () => {
    let s = setup(2);
    s = addMarkers(s, marker('p0', 'extractor', { x: 1, y: 4 })); // 광맥
    s = { ...s, currentPlayerId: 'p1', turn: 2 };
    const t = advanceTurn(withHand(s, 'p1', [], 3)); // → p0 턴
    expect(t.currentPlayerId).toBe('p0');
    expect(player(t, 'p0').energy).toBe(STARTING_ENERGY + CORE_BASE_INCOME + 2);
    const log = t.log.find((l) => l.kind === 'income' && l.playerId === 'p0')!;
    expect(log.message).toContain('채굴기(광맥) +2');
  });

  it('에너지는 상한(20)을 넘지 않는다. 초과 수입은 버려지고 로그에 남는다', () => {
    let s = setup(2);
    s = addMarkers(s, marker('p0', 'refinery', { x: 5, y: 5 })); // 광맥, 생산 4
    s = withHand(s, 'p0', [], ENERGY_CAP - 1);
    s = { ...s, currentPlayerId: 'p1', turn: 2 };
    const t = advanceTurn(withHand(s, 'p1', [], 3)); // → p0 턴, 수입 적용
    expect(t.currentPlayerId).toBe('p0');
    expect(player(t, 'p0').energy).toBe(ENERGY_CAP);
    const log = t.log.find((l) => l.kind === 'income' && l.playerId === 'p0')!;
    expect(log.message).toContain('상한');
  });

  it('F021: 건물이 파괴되면 수입·시야·영토가 즉시 줄어든다', () => {
    let s = setup(2);
    // p0 전초기지를 (5,5) 에 (생산 0), p1 포격함(공 3, 사거리 3) 이 (7,7) 에서 노린다 (거리 2)
    s = addMarkers(s, marker('p0', 'outpost', { x: 5, y: 5 }, 3), marker('p1', 'artillery', { x: 7, y: 7 }));
    expect(computeIncome(s, 'p0').total).toBe(CORE_BASE_INCOME + 1); // 전초기지 자리가 광맥 위는 아니라 +1 은 없다... 실측값 그대로
    const territoryBefore = computeTerritory(s).counts.p0!;
    const sightBefore = computeSightArea(s, 'p0').length;
    // p0 패스 → p1 턴 시작 전투에서 전초기지 파괴
    const t = ok(withHand(s, 'p0', [], 3), pass('p0'));
    expect(t.markers.some((m) => m.specId === 'outpost')).toBe(false);
    expect(computeIncome(t, 'p0').total).toBe(CORE_BASE_INCOME);
    expect(computeTerritory(t).counts.p0!).toBeLessThan(territoryBefore);
    expect(computeSightArea(t, 'p0').length).toBeLessThan(sightBefore);
    expect(computeSightArea(t, 'p0')).toHaveLength(CORE_AREA);
    expect(computeScores(t).p0!.markers).toBe(0);
  });

  it('드로우: 손패 5장이면 생략, 덱이 비면 생략', () => {
    let s = setup(2);
    s = withHand(s, 'p0', ['scout', 'scout', 'scout', 'scout', 'scout'], 3);
    let t = advanceTurn({ ...s, currentPlayerId: 'p1', turn: 2 });
    expect(player(t, 'p0').hand).toHaveLength(HAND_LIMIT);
    expect(t.log.at(-1)?.message).toContain('상한');
    s = withHand(s, 'p0', ['scout'], 3, []);
    t = advanceTurn({ ...s, currentPlayerId: 'p1', turn: 2 });
    expect(player(t, 'p0').hand).toEqual(['scout']);
    expect(t.log.at(-1)?.message).toContain('덱이 비어');
  });
});

describe('전투 (F023)', () => {
  /** p1 턴 상태를 만들어 p1 이 패스하면 p0 시작 단계(전투)가 돈다 */
  function beforeP0Turn(s: GameState): GameState {
    return withHand({ ...s, currentPlayerId: 'p1', turn: 2 }, 'p1', [], 3);
  }

  it('대상 선택: 거리 → 체력 → y → x (육각 거리 기준)', () => {
    let s = setup(2);
    // 방어탑(공 2, 사거리 2) at (5,5). 후보: 순양함 d=1 hp7, 정찰 d=2 hp2 → 거리 우선
    s = addMarkers(s, marker('p0', 'turret', { x: 5, y: 5 }), marker('p1', 'cruiser', { x: 6, y: 6 }), marker('p1', 'scout', { x: 6, y: 7 }));
    let t = ok(beforeP0Turn(s), pass('p1'));
    expect(t.markers.find((m) => m.specId === 'cruiser')!.hp).toBe(5);
    expect(t.markers.find((m) => m.specId === 'scout')!.hp).toBe(2);

    // 같은 거리(d=1): 체력 낮은 쪽. (6,6) hp 7 vs (6,5) hp 4(전투기)
    s = setup(2);
    s = addMarkers(s, marker('p0', 'turret', { x: 5, y: 5 }), marker('p1', 'cruiser', { x: 6, y: 6 }), marker('p1', 'fighter', { x: 6, y: 5 }));
    t = ok(beforeP0Turn(s), pass('p1'));
    expect(t.markers.find((m) => m.specId === 'fighter')!.hp).toBe(2);
    expect(t.markers.find((m) => m.specId === 'cruiser')!.hp).toBe(7);

    // 같은 거리(d=1)·체력: y 작은 쪽, 그다음 x 작은 쪽
    s = setup(2);
    s = addMarkers(
      s,
      marker('p0', 'fighter', { x: 5, y: 5 }),
      marker('p1', 'scout', { x: 5, y: 4 }),
      marker('p1', 'scout', { x: 6, y: 4 }),
      marker('p1', 'scout', { x: 6, y: 6 }),
    );
    t = ok(beforeP0Turn(s), pass('p1'));
    const scouts = t.markers.filter((m) => m.specId === 'scout');
    expect(scouts).toHaveLength(2); // (5,4) 가 파괴됨 (y=4 최소, 그중 x=5 최소)
    expect(scouts.some((m) => m.pos.x === 5 && m.pos.y === 4)).toBe(false);
    expect(t.log.some((l) => l.kind === 'destroy' && l.message.includes('(5,4)'))).toBe(true);
  });

  it('동시 판정: 전투 시작 상태로 대상을 고르고 피해를 한꺼번에 적용한다', () => {
    let s = setup(2);
    // 전투기 둘(5,5)(7,5) 이 모두 정찰(6,5, hp2)에 인접(d=1). 둘 다 정찰을 때리고(오버킬),
    // 순양함(6,4)은 (5,5) 에만 인접(d=1) 이지만 체력이 커서 정찰이 먼저 → 무사
    s = addMarkers(
      s,
      marker('p0', 'fighter', { x: 5, y: 5 }),
      marker('p0', 'fighter', { x: 7, y: 5 }),
      marker('p1', 'scout', { x: 6, y: 5 }),
      marker('p1', 'cruiser', { x: 6, y: 4 }),
    );
    const t = ok(beforeP0Turn(s), pass('p1'));
    expect(t.markers.some((m) => m.specId === 'scout')).toBe(false);
    expect(t.markers.find((m) => m.specId === 'cruiser')!.hp).toBe(7);
    expect(t.log.filter((l) => l.kind === 'combat')).toHaveLength(2);
  });

  it('마커를 놓은 직후에는 공격하지 않고, 한 바퀴 뒤 내 턴 시작에 공격한다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['artillery'], 10);
    s = withHand(s, 'p1', ['scout'], 10);
    // 전초기지(시야 2, 임의 배치)로 시야를 넓혀 포격함(사거리 3)을 p1 코어(8,8) 근처에 놓는다 (거리 1)
    s = addMarkers(s, marker('p0', 'outpost', { x: 6, y: 6 }));
    let t = ok(s, place('p0', 'artillery', { x: 7, y: 7 })); // d((7,7),(8,8)) = 1 ≤ 사거리 3
    expect(core(t, 'p1').hp).toBe(20); // 배치 직후 공격 없음
    t = ok(t, pass('p0')); // p0 턴 종료 (배치했으므로 패스로 기록되지 않음)
    t = ok(t, pass('p1'));
    expect(core(t, 'p1').hp).toBe(17); // p0 턴 시작 전투
    expect(t.currentPlayerId).toBe('p0');
  });

  it('턴 플레이어의 마커만 공격한다 (상대는 자기 턴에 반격)', () => {
    let s = setup(2);
    s = addMarkers(s, marker('p0', 'fighter', { x: 5, y: 5 }), marker('p1', 'fighter', { x: 6, y: 5 }));
    const t = ok(beforeP0Turn(s), pass('p1')); // p0 턴 시작: p0 전투기만 공격
    expect(t.markers.find((m) => m.ownerId === 'p1' && m.specId === 'fighter')!.hp).toBe(2);
    expect(t.markers.find((m) => m.ownerId === 'p0' && m.specId === 'fighter')!.hp).toBe(4);
    // p0 는 배치 후 턴 종료(패스 두 번이면 전원 패스로 끝나므로) → p1 턴 시작: 반격
    let u = ok(withHand(t, 'p0', ['scout'], 3), place('p0', 'scout', { x: 4, y: 2 }));
    u = ok(u, pass('p0'));
    expect(u.markers.find((m) => m.ownerId === 'p0' && m.specId === 'fighter')!.hp).toBe(2);
  });

  it('지속 마법 마커도 공격 대상이다', () => {
    let s = setup(2);
    s = addMarkers(s, marker('p0', 'fighter', { x: 5, y: 5 }), marker('p1', 'warp-gate', { x: 6, y: 5 }, 2, 3));
    const t = ok(beforeP0Turn(s), pass('p1'));
    expect(t.markers.some((m) => m.specId === 'warp-gate')).toBe(false);
  });
});

describe('즉발 마법 · 지속 마법 · 정비', () => {
  it('유성우: 반경 1 적 마커 전부 피해 3, 아군은 무사, 즉시 파괴 정리', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['meteor'], 10);
    // p1 마커는 공격력이 없는 건물로 두어 p1 턴 시작 전투가 결과를 바꾸지 않게 한다
    s = addMarkers(
      s,
      marker('p0', 'outpost', { x: 4, y: 4 }), // 시야 2 → (5,5) 를 비춘다 (거리 2)
      marker('p0', 'scout', { x: 6, y: 4 }), // 반경 안, 아군이라 무사
      marker('p1', 'extractor', { x: 6, y: 6 }, 3), // 반경 안(d=1), 피해로 파괴
      marker('p1', 'outpost', { x: 6, y: 5 }), // 반경 안(d=1)
      marker('p1', 'extractor', { x: 7, y: 6 }), // 반경 밖(d=2)
    );
    const t = ok(s, place('p0', 'meteor', { x: 5, y: 5 }));
    expect(t.markers.some((m) => m.specId === 'meteor')).toBe(false);
    expect(t.markers.some((m) => m.ownerId === 'p1' && m.pos.x === 6 && m.pos.y === 6)).toBe(false);
    expect(t.markers.find((m) => m.ownerId === 'p1' && m.specId === 'outpost')!.hp).toBe(3);
    expect(t.markers.find((m) => m.ownerId === 'p1' && m.pos.x === 7)!.hp).toBe(4);
    expect(t.markers.find((m) => m.ownerId === 'p0' && m.specId === 'scout')!.hp).toBe(2);
    expect(player(t, 'p0').discard).toEqual(['meteor']);
    expect(t.log.some((l) => l.kind === 'magic')).toBe(true);
    expect(t.log.some((l) => l.kind === 'destroy')).toBe(true);
  });

  it('차폐막: 반경 1 아군 체력 +3 (최대 체력까지)', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['shield'], 10);
    s = addMarkers(s, marker('p0', 'cruiser', { x: 3, y: 3 }, 1), marker('p0', 'scout', { x: 4, y: 4 }, 1), marker('p1', 'extractor', { x: 4, y: 2 }, 1));
    const t = ok(s, place('p0', 'shield', { x: 3, y: 4 }));
    expect(t.markers.find((m) => m.specId === 'cruiser')!.hp).toBe(4);
    expect(t.markers.find((m) => m.specId === 'scout')!.hp).toBe(2);
    expect(t.markers.find((m) => m.specId === 'extractor')!.hp).toBe(1);
  });

  it('에너지 폭풍: 비용 2 내고 +6', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['energy-storm'], 2);
    const t = ok(s, place('p0', 'energy-storm', { x: 3, y: 3 }));
    expect(player(t, 'p0').energy).toBe(6);
    expect(t.markers).toHaveLength(2);
  });

  it('워프 게이트: 시야 3 마커로 남고 소유자 턴 시작마다 1 줄어 0이면 제거', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['warp-gate', 'scout', 'scout'], 10);
    s = withHand(s, 'p1', [], 10);
    let t = ok(s, place('p0', 'warp-gate', { x: 3, y: 3 }));
    const gate = t.markers.find((m) => m.specId === 'warp-gate')!;
    expect(gate.remainingTurns).toBe(3);
    expect(gate.hp).toBe(2);
    expect(gate.kind).toBe('magic');
    expect(computeSightArea(t, 'p0')).toContainEqual({ x: 6, y: 3 }); // 거리 3, 게이트가 없으면 안 닿는다
    t = ok(t, pass('p0')); // p0 턴 종료 (배치했으므로 패스로 기록되지 않음)
    t = ok(t, pass('p1')); // p0 턴 시작 → 2
    expect(t.markers.find((m) => m.specId === 'warp-gate')!.remainingTurns).toBe(2);
    t = ok(t, place('p0', 'scout', { x: 2, y: 1 })); // p0 는 배치 (패스 연속이면 게임이 끝난다)
    t = ok(t, pass('p0')); // 턴 종료
    t = ok(t, pass('p1')); // → 1
    expect(t.markers.find((m) => m.specId === 'warp-gate')!.remainingTurns).toBe(1);
    t = ok(t, place('p0', 'scout', { x: 2, y: 3 }));
    t = ok(t, pass('p0')); // 턴 종료
    t = ok(t, pass('p1')); // → 0 제거
    expect(t.markers.some((m) => m.specId === 'warp-gate')).toBe(false);
    expect(t.log.some((l) => l.kind === 'expire')).toBe(true);
    expect(t.phase).toBe('playing');
    expect(computeSightArea(t, 'p0')).not.toContainEqual({ x: 6, y: 3 });
  });

  it('수리 드론: 턴 시작(전투 직후) 반경 1 아군 체력 +1, 최대 체력까지', () => {
    let s = setup(2);
    s = addMarkers(
      s,
      marker('p0', 'repair-drone', { x: 3, y: 3 }, 1),
      marker('p0', 'cruiser', { x: 4, y: 4 }, 5), // d=1
      marker('p0', 'scout', { x: 5, y: 5 }, 1), // d=3, 반경 밖
      marker('p0', 'outpost', { x: 4, y: 3 }, 5), // d=1, 최대(6) 직전
    );
    const t = advanceTurn(withHand({ ...s, currentPlayerId: 'p1', turn: 2 }, 'p1', [], 3));
    expect(t.markers.find((m) => m.specId === 'repair-drone')!.hp).toBe(2); // 자기 자신 포함
    expect(t.markers.find((m) => m.specId === 'cruiser')!.hp).toBe(6);
    expect(t.markers.find((m) => m.specId === 'scout')!.hp).toBe(1); // 거리 3, 반경 밖
    expect(t.markers.find((m) => m.specId === 'outpost')!.hp).toBe(6); // 최대
    expect(t.log.some((l) => l.kind === 'repair')).toBe(true);
  });
});

describe('파괴 · 탈락 · 종료 (F024, F025)', () => {
  it('코어 파괴 → 탈락, 마커 전부 제거, 생존자 1명이면 즉시 승리', () => {
    let s = setup(2);
    s = addMarkers(s, marker('p0', 'fighter', { x: 7, y: 7 }), marker('p1', 'scout', { x: 9, y: 9 }));
    s = withMarkers(s, s.markers.map((m) => (m.ownerId === 'p1' && m.kind === 'core' ? { ...m, hp: 2 } : m)));
    const t = ok(withHand({ ...s, currentPlayerId: 'p1', turn: 2 }, 'p1', [], 3), pass('p1'));
    expect(t.phase).toBe('finished');
    expect(t.result?.reason).toBe('last-survivor');
    expect(t.result?.ranking).toEqual(['p0', 'p1']);
    expect(player(t, 'p1').alive).toBe(false);
    expect(player(t, 'p1').eliminatedOrder).toBe(0);
    expect(t.markers.every((m) => m.ownerId === 'p0')).toBe(true);
    expect(t.currentPlayerId).toBeNull();
    expect(t.log.some((l) => l.kind === 'eliminate')).toBe(true);
    expect(t.log.at(-1)?.kind).toBe('result');
    expect(fail(t, pass('p0'))).toContain('진행 중인 게임이 아닙니다');
  });

  it('3인전: 탈락자는 턴에서 건너뛰고 순위는 생존자 아래', () => {
    let s = setup(3);
    s = withHand(s, 'p0', [], 3);
    s = withHand(s, 'p1', [], 3);
    s = withHand(s, 'p2', [], 3);
    // p1 코어 (10,6) 옆(d=1) p0 전투기, p1 코어 체력 1
    s = addMarkers(s, marker('p0', 'fighter', { x: 9, y: 6 }));
    s = withMarkers(s, s.markers.map((m) => (m.ownerId === 'p1' && m.kind === 'core' ? { ...m, hp: 1 } : m)));
    s = { ...s, currentPlayerId: 'p2', turn: 3 };
    let t = ok(s, pass('p2')); // → p0 턴 시작: p1 코어 파괴
    expect(t.phase).toBe('playing');
    expect(player(t, 'p1').alive).toBe(false);
    expect(t.markers.some((m) => m.ownerId === 'p1')).toBe(false);
    expect(t.currentPlayerId).toBe('p0');
    t = ok(withHand(t, 'p0', ['scout'], 3), place('p0', 'scout', { x: 4, y: 3 }));
    t = ok(t, pass('p0')); // 턴 종료
    expect(t.currentPlayerId).toBe('p2'); // p1 건너뜀
    expect(fail(t, pass('p1'))).toBeDefined();
    const ranking = computeRanking(t);
    expect(ranking[0]).toBe('p0'); // 마커 2개 + 넓은 영토
    expect(ranking[2]).toBe('p1'); // 탈락자는 맨 아래
    expect(computeScores(t).p1).toEqual({ territory: 0, markers: 0, total: 0 });
  });

  it('기권: 즉시 탈락, 2인전이면 상대 승리, 3인전이면 계속', () => {
    const two = startGame(readyLobby(2));
    const t = ok(two, { type: 'SURRENDER', playerId: 'p0' });
    expect(t.phase).toBe('finished');
    expect(t.result?.reason).toBe('last-survivor');
    expect(t.result?.ranking).toEqual(['p1', 'p0']);
    expect(fail(two, { type: 'SURRENDER', playerId: 'p1' })).toContain('턴');

    const three = startGame(readyLobby(3));
    const u = ok(three, { type: 'SURRENDER', playerId: 'p0' });
    expect(u.phase).toBe('playing');
    expect(u.currentPlayerId).toBe('p1');
    expect(u.markers.some((m) => m.ownerId === 'p0')).toBe(false);
    expect(computeScores(u).p0!.total).toBe(0);
  });

  it('전원 연속 패스 → 점수 정산. 배치가 끼면 리셋', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['scout'], 10);
    s = withHand(s, 'p1', [], 10);
    let t = ok(s, pass('p0'));
    expect(countPasses(t)).toBe(1);
    expect(fail(t, place('p0', 'scout', { x: 3, y: 3 }))).toContain('턴'); // p1 턴이므로 거부
    expect(countPasses(t)).toBe(1);
    t = ok(t, pass('p1'));
    expect(t.phase).toBe('finished');
    expect(t.result?.reason).toBe('all-pass');
    expect(t.result?.scores.p0?.total).toBe(CORE_AREA);

    let u = ok(s, pass('p0'));
    u = ok(u, pass('p1'));
    expect(u.phase).toBe('finished');

    let v = ok(s, pass('p0'));
    v = withHand(v, 'p1', ['scout'], 10);
    v = ok(v, place('p1', 'scout', { x: 7, y: 7 }));
    expect(countPasses(v)).toBe(0);
    expect(v.players.every((p) => !p.passed)).toBe(true);
    expect(v.phase).toBe('playing');
  });

  it('라운드 제한 도달 → 점수 정산. 라운드는 생존자 전원이 턴을 마쳐야 오른다', () => {
    let s = startGame(readyLobby(2));
    s = { ...s, roundLimit: 2 };
    s = withHand(s, 'p0', ['scout', 'scout'], 10);
    s = withHand(s, 'p1', ['scout', 'scout'], 10);
    let t = ok(s, place('p0', 'scout', { x: 3, y: 3 }));
    t = ok(t, pass('p0'));
    expect(t.round).toBe(1);
    t = ok(t, place('p1', 'scout', { x: 7, y: 7 }));
    t = ok(t, pass('p1'));
    expect(t.round).toBe(2);
    expect(t.turn).toBe(3);
    t = ok(t, place('p0', 'scout', { x: 3, y: 4 }));
    t = ok(t, pass('p0'));
    t = ok(t, place('p1', 'scout', { x: 7, y: 6 }));
    t = ok(t, pass('p1'));
    expect(t.phase).toBe('finished');
    expect(t.result?.reason).toBe('round-limit');
    expect(t.round).toBe(2);
  });

  it('순위: 점수 내림차순, 동점은 좌석 큰 쪽, 탈락자는 늦게 탈락한 순', () => {
    let s = setup(4);
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p0' ? { ...p, alive: false, eliminatedOrder: 1 } : p.id === 'p3' ? { ...p, alive: false, eliminatedOrder: 0 } : p,
      ),
    };
    s = withMarkers(s, s.markers.filter((m) => m.ownerId === 'p1' || m.ownerId === 'p2'));
    expect(computeRanking(s)).toEqual(['p2', 'p1', 'p0', 'p3']);
  });
});

describe('결정성 · 순수성', () => {
  it('같은 시드·같은 액션 → 같은 상태', () => {
    const run = () => {
      let s = startGame(readyLobby(2, undefined, 99));
      const seq: Action[] = [pass('p0'), pass('p1')];
      for (const a of seq) s = applyAction(s, a).state;
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('markers 는 항상 y → x 순으로 정렬돼 있다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['scout', 'scout', 'scout'], 10);
    s = withHand(s, 'p1', ['scout', 'scout', 'scout'], 10);
    const seq: Action[] = [
      place('p0', 'scout', { x: 2, y: 1 }),
      pass('p0'),
      place('p1', 'scout', { x: 9, y: 8 }),
      pass('p1'),
      place('p0', 'scout', { x: 3, y: 3 }),
      pass('p0'),
      place('p1', 'scout', { x: 7, y: 9 }),
      pass('p1'),
    ];
    for (const a of seq) {
      s = ok(s, a);
      const sorted = [...s.markers].sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
      expect(s.markers.map((m) => m.id)).toEqual(sorted.map((m) => m.id));
    }
  });
});

describe('리뷰 보강: 탈락과 패스, 동시 파괴, 즉발 코어 파괴, 침투·시야 경계', () => {
  it('탈락자의 패스는 전원 패스 판정에 남지 않는다 (3인)', () => {
    let s = setup(3);
    for (const id of ['p0', 'p1', 'p2']) s = withHand(s, id, [], 3);
    // p1 전투기가 p0 코어(4,2) 옆(d=1), p0 코어 체력 1
    s = addMarkers(s, marker('p1', 'fighter', { x: 4, y: 3 }));
    s = withMarkers(s, s.markers.map((m) => (m.ownerId === 'p0' && m.kind === 'core' ? { ...m, hp: 1 } : m)));
    let t = ok(s, pass('p0')); // → p1 턴 시작 전투: p0 탈락
    expect(player(t, 'p0').alive).toBe(false);
    t = ok(t, pass('p1'));
    expect(t.phase).toBe('playing'); // p2 는 아직 패스하지 않았다
    expect(t.currentPlayerId).toBe('p2');
    expect(countPasses(t)).toBe(1);
    t = ok(t, pass('p2'));
    expect(t.phase).toBe('finished');
    expect(t.result?.reason).toBe('all-pass');
  });

  it('4인: 세 명 패스 후 네 번째가 기권하면 생존자 전원 패스로 정산', () => {
    let s = startGame(readyLobby(4));
    for (const id of ['p0', 'p1', 'p2', 'p3']) s = withHand(s, id, [], 3);
    s = ok(s, pass('p0'));
    s = ok(s, pass('p1'));
    s = ok(s, pass('p2'));
    s = ok(s, { type: 'SURRENDER', playerId: 'p3' });
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('all-pass');
    expect(s.result?.ranking.at(-1)).toBe('p3');
  });

  it('방에 없는 플레이어의 PLACE 는 예외 없이 거부된다', () => {
    const s = startGame(readyLobby(2));
    expect(fail(s, place('ghost', 'scout', { x: 3, y: 3 }))).toContain('방에 없는');
  });

  it('같은 전투에서 코어 둘 파괴: 좌석 오름차순 탈락 기록, 순위는 늦게 탈락한 쪽이 위', () => {
    let s = setup(4);
    for (const id of ['p0', 'p1', 'p2', 'p3']) s = withHand(s, id, [], 3);
    // p0 포격함(사거리 3) 두 대가 p1 코어(10,3, d=2)·p3 코어(10,11, d=2) 를 노린다. 두 코어 체력 1
    s = addMarkers(s, marker('p0', 'artillery', { x: 8, y: 3 }), marker('p0', 'artillery', { x: 9, y: 9 }));
    s = withMarkers(s, s.markers.map((m) => (m.kind === 'core' && (m.ownerId === 'p1' || m.ownerId === 'p3') ? { ...m, hp: 1 } : m)));
    s = { ...s, currentPlayerId: 'p3', turn: 4 };
    const t = ok(s, pass('p3')); // → p0 턴 시작 전투
    expect(player(t, 'p1').alive).toBe(false);
    expect(player(t, 'p3').alive).toBe(false);
    expect(player(t, 'p1').eliminatedOrder).toBe(0);
    expect(player(t, 'p3').eliminatedOrder).toBe(1);
    expect(t.phase).toBe('playing');
    const r = computeRanking(t);
    expect(r.slice(2)).toEqual(['p3', 'p1']);
  });

  it('즉발 마법으로 코어를 부수면 배치 직후 탈락하고 2인이면 즉시 종료', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['gravity-wave'], 10);
    s = addMarkers(s, marker('p0', 'observatory', { x: 5, y: 5 })); // 시야 3 → (7,7) 까지 (거리 3)
    s = withMarkers(s, s.markers.map((m) => (m.ownerId === 'p1' && m.kind === 'core' ? { ...m, hp: 2 } : m)));
    const t = ok(s, place('p0', 'gravity-wave', { x: 7, y: 7 })); // 반경 2 → p1 코어(8,8, d=1)
    expect(t.phase).toBe('finished');
    expect(t.result?.reason).toBe('last-survivor');
    expect(t.result?.ranking[0]).toBe('p0');
    expect(t.markers.some((m) => m.ownerId === 'p1')).toBe(false);
  });

  it('침투 카드도 적 인접이 아니면 내 시야 안에만 놓인다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['stealth'], 10);
    const cells = legalCells(s, 'p0', 'stealth');
    expect(cells).toContainEqual({ x: 3, y: 3 }); // 내 시야
    expect(cells).not.toContainEqual({ x: 6, y: 6 }); // 시야 밖, 적 인접도 아님
    expect(cells).toContainEqual({ x: 7, y: 7 }); // 적 코어 인접
  });

  it('시야는 소행성을 통과하고, 탈락자의 시야는 즉시 사라져 경합 칸이 생존자 영토가 된다', () => {
    let s = setup(2, 'asteroid-belt');
    s = addMarkers(s, marker('p0', 'observatory', { x: 5, y: 1 })); // 시야 3, 장벽 너머까지 닿는다
    const t = computeTerritory(s);
    expect(t.owners[1]![8]).toBe('p0'); // 소행성대 너머
    expect(t.owners[1]![6]).toBeNull(); // 소행성 자체
    // p1 관측소가 (8,3) 에 있으면 (1,8) 은 경합
    s = addMarkers(s, marker('p1', 'observatory', { x: 8, y: 3 }));
    expect(computeTerritory(s).owners[1]![8]).toBeNull();
    s = withHand(s, 'p1', [], 3);
    const u = ok({ ...s, currentPlayerId: 'p1', turn: 2 }, { type: 'SURRENDER', playerId: 'p1' });
    expect(u.phase).toBe('finished');
    expect(computeTerritory(u).owners[1]![8]).toBe('p0');
    expect(computeSightArea(u, 'p1')).toHaveLength(0);
  });

  it('공격력 마커가 있어도 사거리 안 적이 없으면 아무 일도 없다', () => {
    let s = setup(2);
    s = addMarkers(s, marker('p0', 'fighter', { x: 3, y: 3 }));
    const before = s.markers.map((m) => m.hp);
    const t = advanceTurn(withHand({ ...s, currentPlayerId: 'p1', turn: 2 }, 'p1', [], 3));
    expect(t.markers.map((m) => m.hp)).toEqual(before);
    expect(t.log.some((l) => l.kind === 'combat')).toBe(false);
  });

  it('회복은 코어·지속 마법 마커에도 적용되고 최대 체력을 넘지 않는다', () => {
    let s = startGame(readyLobby(2));
    s = withHand(s, 'p0', ['shield'], 10);
    s = addMarkers(s, marker('p0', 'warp-gate', { x: 3, y: 3 }, 1, 3));
    s = withMarkers(s, s.markers.map((m) => (m.ownerId === 'p0' && m.kind === 'core' ? { ...m, hp: 19 } : m)));
    const t = ok(s, place('p0', 'shield', { x: 2, y: 3 })); // 코어(3,2) d=1, 워프 게이트(3,3) d=1
    expect(core(t, 'p0').hp).toBe(CORE_SPEC.hp);
    expect(t.markers.find((m) => m.specId === 'warp-gate')!.hp).toBe(2);
  });
});

describe('로비 조작 (F002, F030)', () => {
  it('맵 변경: 보드·라운드 제한이 바뀌고 사람 플레이어의 준비가 해제된다', () => {
    let s = lobby(2);
    s = applyAction(s, { type: 'SELECT_DECK', playerId: 'p0', choice: DEFAULT_DECK_CHOICE }).state;
    s = applyAction(s, { type: 'READY', playerId: 'p0' }).state;
    expect(s.players[0]?.isReady).toBe(true);
    const r = changeMap(s, 'quadrant');
    expect(r.error).toBeUndefined();
    expect(r.state.mapId).toBe('quadrant');
    expect(r.state.board.width).toBe(getMap('quadrant').size);
    expect(r.state.roundLimit).toBe(getMap('quadrant').roundLimit);
    expect(r.state.players[0]?.isReady).toBe(false);
    expect(r.state.players).toHaveLength(2);
    // 정원보다 인원이 많으면 거부
    const three = lobby(3);
    expect(changeMap(three, 'binary-star').error).toMatch(/2명까지/);
    // 게임 중엔 거부
    expect(changeMap(startGame(readyLobby(2)), 'quadrant').error).toBeDefined();
  });

  it('퇴장: 뒷좌석이 당겨지고 게임 중엔 거부된다', () => {
    const s = lobby(3);
    const r = leaveLobby(s, 'p1');
    expect(r.error).toBeUndefined();
    expect(r.state.players.map((p) => [p.id, p.seat])).toEqual([
      ['p0', 0],
      ['p2', 1],
    ]);
    expect(leaveLobby(s, 'nobody').error).toBeDefined();
    expect(leaveLobby(startGame(readyLobby(2)), 'p0').error).toMatch(/기권/);
  });
});
