import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeProduction,
  computeScores,
  computeTerritory,
  createInitialState,
  createPlayer,
  joinPlayer,
  nextRandom,
  shuffle,
  startGame,
} from './index.js';
import {
  BASE_DECK,
  DEFAULT_DECK_CHOICE,
  INITIAL_HAND_SIZE,
  INITIAL_MANA,
  INITIAL_RESOURCES,
  MAIN_BASE_POSITIONS,
  MAX_PLAYERS,
  TURN_LIMIT,
  getBuildingSpec,
} from '../data/index.js';
import type { Action, GameState } from '../types/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const P2_CHOICE = { buildingId: 'nexus', unitId: 'phantom', magicId: 'rally' };

function lobby(n = 2, seed = 42): GameState {
  let s = createInitialState('room-1', seed);
  for (let i = 1; i <= n; i++) s = joinPlayer(s, createPlayer(`p${i}`, `플레이어${i}`)).state;
  return s;
}

function playing(n = 2, seed = 42): GameState {
  let s = lobby(n, seed);
  for (let i = 1; i <= n; i++) {
    s = applyAction(s, { type: 'SELECT_DECK', playerId: `p${i}`, choice: i === 1 ? DEFAULT_DECK_CHOICE : P2_CHOICE }).state;
  }
  for (let i = 1; i <= n; i++) s = applyAction(s, { type: 'READY', playerId: `p${i}` }).state;
  expect(s.phase).toBe('playing');
  return s;
}

/** 액션이 입력 상태를 변이하지 않는지 확인하고 결과를 돌려준다 */
function pure(s: GameState, a: Action) {
  const snap = JSON.stringify(s);
  const r = applyAction(s, a);
  expect(JSON.stringify(s)).toBe(snap);
  return r;
}

describe('로비 · 덱 선택 · 준비', () => {
  it('플레이어를 추가하고 중복 참여는 무시한다', () => {
    const s = lobby();
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(joinPlayer(s, createPlayer('p1', 'x')).state).toBe(s);
  });

  it('정원을 넘기면 거부한다', () => {
    const s = lobby(MAX_PLAYERS);
    const r = joinPlayer(s, createPlayer('extra', '추가'));
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });

  it('게임 중에는 참여할 수 없다', () => {
    const s = playing();
    expect(joinPlayer(s, createPlayer('p3', '늦참')).error).toBeDefined();
  });

  it('방에 없는 플레이어의 액션은 거부한다', () => {
    const s = lobby();
    const r = pure(s, { type: 'READY', playerId: 'ghost' });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });

  it('특수 카드가 아닌 id 로는 덱을 고를 수 없다 (F016)', () => {
    const s = lobby();
    const r = pure(s, { type: 'SELECT_DECK', playerId: 'p1', choice: { buildingId: 'mine', unitId: 'titan', magicId: 'supernova' } });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });

  it('덱을 고르지 않으면 준비할 수 없다', () => {
    expect(pure(lobby(), { type: 'READY', playerId: 'p1' }).error).toBeDefined();
  });

  it('덱을 다시 고르면 준비가 해제되고, 그 상태에서는 게임이 시작되지 않는다', () => {
    let s = lobby();
    s = pure(s, { type: 'SELECT_DECK', playerId: 'p1', choice: DEFAULT_DECK_CHOICE }).state;
    s = pure(s, { type: 'SELECT_DECK', playerId: 'p2', choice: DEFAULT_DECK_CHOICE }).state;
    s = pure(s, { type: 'READY', playerId: 'p1' }).state;
    s = pure(s, { type: 'SELECT_DECK', playerId: 'p1', choice: P2_CHOICE }).state;
    expect(s.players[0]?.isReady).toBe(false);
    s = pure(s, { type: 'READY', playerId: 'p2' }).state;
    expect(s.phase).toBe('lobby');
  });

  it('혼자서는 준비해도 시작되지 않는다', () => {
    let s = lobby(1);
    s = pure(s, { type: 'SELECT_DECK', playerId: 'p1', choice: DEFAULT_DECK_CHOICE }).state;
    s = pure(s, { type: 'READY', playerId: 'p1' }).state;
    expect(s.phase).toBe('lobby');
    expect(s.players[0]?.isReady).toBe(true);
  });

  it('모두 준비되면 게임이 시작된다', () => {
    expect(playing().phase).toBe('playing');
  });

  it('startGame 은 예외 대신 error 를 돌려준다', () => {
    expect(startGame(lobby(1)).error).toBeDefined();
    expect(startGame(playing()).error).toBeDefined();
  });
});

describe('게임 시작 (F018, F019)', () => {
  it('메인 기지를 대칭 위치에 자동 배치한다', () => {
    const s = playing();
    const bases = s.buildings.filter((b) => b.specId === 'main-base');
    expect(bases.map((b) => b.pos)).toEqual(MAIN_BASE_POSITIONS[2]);
    expect(bases.map((b) => b.ownerId)).toEqual(['p1', 'p2']);
    expect(s.players.map((p) => p.mainBaseId)).toEqual(bases.map((b) => b.id));
    expect(bases[0]?.hp).toBe(getBuildingSpec('main-base')?.hp);
  });

  it('3인·4인도 인원수에 맞는 위치에 배치되고 각자 영토 9칸을 갖는다', () => {
    for (const n of [3, 4]) {
      const s = playing(n);
      expect(s.buildings.map((b) => b.pos)).toEqual(MAIN_BASE_POSITIONS[n]);
      const t = computeTerritory(s);
      for (const p of s.players) expect(t[p.id]).toHaveLength(9);
    }
  });

  it('초기 자원·마나·손패·덱을 기준표대로 세팅한다', () => {
    const s = playing();
    for (const p of s.players) {
      expect(p.resources).toBe(INITIAL_RESOURCES);
      expect(p.mana).toBe(INITIAL_MANA);
      expect(p.hand).toHaveLength(INITIAL_HAND_SIZE);
      expect(p.hand.length + p.deck.length).toBe(BASE_DECK.length + 3);
    }
    expect(s.turn).toBe(1);
    expect(s.currentPlayerId).toBe('p1');
    expect(s.rngSeed).not.toBe(42);
  });

  it('선택한 특수 카드가 덱에 정확히 한 장씩 들어간다', () => {
    const p2 = playing().players[1]!;
    const all = [...p2.hand, ...p2.deck];
    expect(all.filter((c) => c.specId === 'nexus')).toHaveLength(1);
    expect(all.filter((c) => c.specId === 'phantom')).toHaveLength(1);
    expect(all.filter((c) => c.specId === 'rally')).toHaveLength(1);
    expect(all.some((c) => c.specId === 'titan')).toBe(false);
  });

  it('플레이어 덱의 카드 객체는 BASE_DECK 상수와 공유되지 않는다', () => {
    const s = playing();
    for (const p of s.players) for (const c of [...p.hand, ...p.deck]) expect(BASE_DECK.includes(c)).toBe(false);
  });

  it('같은 시드면 같은 결과, 다른 시드면 다른 셔플 (결정성)', () => {
    expect(JSON.stringify(playing())).toBe(JSON.stringify(playing()));
    expect(JSON.stringify(playing(2, 7).players[0]?.hand)).not.toBe(JSON.stringify(playing().players[0]?.hand));
  });
});

describe('RNG 고정값 (Python 시뮬레이션과 공유)', () => {
  it('mulberry32 기대값', () => {
    const r = nextRandom(42);
    expect(r.seed).toBe((42 + 0x6d2b79f5) >>> 0);
    expect(r.value).toBeCloseTo(0.6011037519201636, 12);
    expect(shuffle([1, 2, 3, 4, 5], 42).items).toEqual([1, 5, 3, 2, 4]);
  });
});

describe('턴 진행 · 생산 · 드로우 (F020, F021)', () => {
  it('1턴은 모든 플레이어가 생산·드로우 없이 시작 자원으로 진행한다 (대칭)', () => {
    const s = playing();
    const r = pure(s, { type: 'END_TURN', playerId: 'p1' });
    const p2 = r.state.players[1]!;
    expect(p2.resources).toBe(INITIAL_RESOURCES);
    expect(p2.mana).toBe(INITIAL_MANA);
    expect(p2.hand).toHaveLength(INITIAL_HAND_SIZE);
    expect(r.state.turn).toBe(1);
    expect(r.state.currentPlayerId).toBe('p2');
    expect(r.state.log.some((l) => l.kind === 'production')).toBe(false);
  });

  it('2턴부터 턴 시작 시 건물 생산량만큼 자원·마나를 얻고 1장 뽑는다', () => {
    let s = playing();
    s = pure(s, { type: 'END_TURN', playerId: 'p1' }).state;
    const before = s.players[0]!;
    s = pure(s, { type: 'END_TURN', playerId: 'p2' }).state;
    const after = s.players[0]!;
    const base = getBuildingSpec('main-base')!;
    expect(s.turn).toBe(2);
    expect(s.currentPlayerId).toBe('p1');
    expect(after.resources).toBe(before.resources + base.production.resources);
    expect(after.mana).toBe(before.mana + base.production.mana);
    expect(after.hand).toHaveLength(before.hand.length + 1);
    expect(after.deck).toHaveLength(before.deck.length - 1);
    expect(s.log.some((l) => l.kind === 'production')).toBe(true);
  });

  it('3인 로테이션: 마지막 플레이어가 끝내면 턴이 오르고 첫 플레이어로 돌아간다', () => {
    let s = playing(3);
    s = pure(s, { type: 'END_TURN', playerId: 'p1' }).state;
    s = pure(s, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(s.turn).toBe(1);
    s = pure(s, { type: 'END_TURN', playerId: 'p3' }).state;
    expect(s.turn).toBe(2);
    expect(s.currentPlayerId).toBe('p1');
  });

  it('건물이 없어지면 생산량이 즉시 줄어든다 (F021)', () => {
    const s = playing();
    const withMine: GameState = {
      ...s,
      buildings: [...s.buildings, { id: 'b-x', specId: 'mine', ownerId: 'p1', pos: { x: 2, y: 2 }, hp: 6 }],
    };
    expect(computeProduction(withMine, 'p1').resources).toBe(3);
    const destroyed = { ...withMine, buildings: withMine.buildings.filter((b) => b.id !== 'b-x') };
    expect(computeProduction(destroyed, 'p1').resources).toBe(1);
  });

  it('건물이 없거나 스펙을 모르는 건물은 생산 0', () => {
    const s = playing();
    expect(computeProduction({ ...s, buildings: [] }, 'p1')).toEqual({ resources: 0, mana: 0 });
    const unknown = { ...s, buildings: [{ id: 'u', specId: 'nope', ownerId: 'p1', pos: { x: 0, y: 0 }, hp: 1 }] };
    expect(computeProduction(unknown, 'p1')).toEqual({ resources: 0, mana: 0 });
  });

  it('덱이 비면 드로우 없이 생산만 하고 로그를 남긴다', () => {
    let s = playing();
    s = { ...s, turn: 5, players: s.players.map((p) => (p.id === 'p2' ? { ...p, deck: [] } : p)) };
    const before = s.players[1]!;
    const r = pure(s, { type: 'END_TURN', playerId: 'p1' });
    expect(r.error).toBeUndefined();
    expect(r.state.phase).toBe('playing');
    expect(r.state.players[1]?.hand).toHaveLength(before.hand.length);
    expect(r.state.players[1]?.resources).toBe(before.resources + 1);
    expect(r.state.log.at(-1)?.message).toContain('덱이 비어');
  });

  it('자신의 턴이 아니면 거부하고 상태를 바꾸지 않는다', () => {
    const s = playing();
    const r = pure(s, { type: 'END_TURN', playerId: 'p2' });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
});

describe('점수 정산 (F025)', () => {
  it('제한 턴을 마지막 플레이어까지 다 진행하면 종료되고 turn 은 turnLimit 로 남는다', () => {
    let s: GameState = { ...playing(), turn: TURN_LIMIT };
    s = { ...s, buildings: [...s.buildings, { id: 'b-o', specId: 'outpost', ownerId: 'p2', pos: { x: 6, y: 6 }, hp: 8 }] };
    s = pure(s, { type: 'END_TURN', playerId: 'p1' }).state;
    expect(s.phase).toBe('playing');
    s = pure(s, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(s.phase).toBe('finished');
    expect(s.turn).toBe(TURN_LIMIT);
    expect(s.result?.reason).toBe('turn-limit');
    expect(s.result?.winnerId).toBe('p2');
    expect(s.result?.scores['p2']?.buildings).toBe(2);
    expect(s.log.at(-1)?.turn).toBe(TURN_LIMIT);
    expect(s.log.at(-1)?.message).toContain('제한 턴');
  });

  it('한 바퀴가 끝났을 때 모든 덱이 비어 있으면 종료된다', () => {
    let s = playing();
    s = { ...s, turn: 10, players: s.players.map((p) => ({ ...p, deck: [] })) };
    s = pure(s, { type: 'END_TURN', playerId: 'p1' }).state;
    expect(s.phase).toBe('playing'); // 아직 바퀴가 안 끝남
    s = pure(s, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('deck-exhausted');
    expect(s.log.at(-1)?.message).toContain('덱 소진');
  });

  it('한 명이라도 덱이 남아 있으면 계속된다', () => {
    let s = playing();
    s = { ...s, turn: 10, players: s.players.map((p) => (p.id === 'p1' ? { ...p, deck: [] } : p)) };
    s = pure(s, { type: 'END_TURN', playerId: 'p1' }).state;
    s = pure(s, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(s.phase).toBe('playing');
  });

  it('동점이면 무승부', () => {
    let s: GameState = { ...playing(), turn: TURN_LIMIT };
    s = pure(s, { type: 'END_TURN', playerId: 'p1' }).state;
    s = pure(s, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(s.phase).toBe('finished');
    expect(s.result?.winnerId).toBeNull();
  });

  it('3인: 최고 1명이면 승리, 상위 2명이 동점이면 무승부', () => {
    const base: GameState = { ...playing(3), turn: TURN_LIMIT };
    const finish = (s: GameState) => {
      for (const id of ['p1', 'p2', 'p3']) s = pure(s, { type: 'END_TURN', playerId: id }).state;
      return s;
    };
    const outpost = (owner: string, x: number, y: number) => ({ id: `o-${owner}`, specId: 'outpost', ownerId: owner, pos: { x, y }, hp: 8 });
    const oneTop = finish({ ...base, buildings: [...base.buildings, outpost('p2', 5, 5)] });
    expect(oneTop.result?.winnerId).toBe('p2');
    const twoTop = finish({ ...base, buildings: [...base.buildings, outpost('p2', 5, 5), outpost('p3', 1, 5)] });
    expect(twoTop.result?.winnerId).toBeNull();
  });

  it('끝난 게임에는 어떤 액션도 받지 않는다', () => {
    let s: GameState = { ...playing(), turn: TURN_LIMIT };
    s = pure(s, { type: 'END_TURN', playerId: 'p1' }).state;
    s = pure(s, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(pure(s, { type: 'END_TURN', playerId: 'p1' }).error).toBeDefined();
  });
});

describe('영토 (F025)', () => {
  it('2인 시작 상태에서 각 기지 주변 3×3 이 자기 영토', () => {
    const t = computeTerritory(playing());
    expect(t['p1']).toHaveLength(9);
    expect(t['p2']).toHaveLength(9);
  });

  it('경합 칸은 누구의 영토도 아니다', () => {
    const s = playing();
    const contested: GameState = {
      ...s,
      buildings: [
        ...s.buildings,
        { id: 'a', specId: 'outpost', ownerId: 'p1', pos: { x: 4, y: 4 }, hp: 8 },
        { id: 'b', specId: 'outpost', ownerId: 'p2', pos: { x: 5, y: 5 }, hp: 8 },
      ],
    };
    const t = computeTerritory(contested);
    // 각 전초 기지 3×3 = 9칸 중 (4..5, 4..5) 4칸이 겹침 → 각자 5칸 + 기지 9칸
    expect(t['p1']).toHaveLength(14);
    expect(t['p2']).toHaveLength(14);
    const scores = computeScores(contested);
    expect(scores['p1']).toEqual({ territory: 14, buildings: 2, total: 16 });
  });
});

describe('공용 픽스처 (Python 과 같은 기준)', () => {
  const load = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as GameState;

  it('started-state.json 은 시드 42 시나리오의 엔진 출력과 같다', () => {
    let s = createInitialState('fixture-room', 42);
    s = joinPlayer(s, createPlayer('p1', '철수')).state;
    s = joinPlayer(s, createPlayer('ai-1', 'AI', 'ai')).state;
    s = applyAction(s, { type: 'SELECT_DECK', playerId: 'p1', choice: DEFAULT_DECK_CHOICE }).state;
    s = applyAction(s, { type: 'SELECT_DECK', playerId: 'ai-1', choice: P2_CHOICE }).state;
    s = applyAction(s, { type: 'READY', playerId: 'p1' }).state;
    s = applyAction(s, { type: 'READY', playerId: 'ai-1' }).state;
    expect(s).toEqual(load('started-state.json'));
    let t = applyAction(s, { type: 'END_TURN', playerId: 'p1' }).state;
    t = applyAction(t, { type: 'END_TURN', playerId: 'ai-1' }).state;
    expect(t).toEqual(load('after-end-turn.json'));
  });
});
