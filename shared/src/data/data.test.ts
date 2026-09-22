/**
 * shared/src/data 가 notes/Rules.md 10~12절 표와 일치하는지 검증한다.
 * 기대값은 Rules.md 를 그대로 옮긴 것이다. 규칙을 바꾸면 Rules.md → 이 표 → 데이터 순으로 고친다.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_CARDS,
  BASE_DECK,
  BASE_DECK_SIZE,
  CONSTANTS,
  CORE_SPEC,
  DECK_SIZE,
  DEFAULT_DECK_CHOICE,
  MAPS,
  SPECIAL_CARDS,
  buildDeck,
  getMap,
  getSpec,
  isValidDeckChoice,
  specialCardsOf,
} from './index.js';
import type { CardSpec, Position } from '../types/index.js';

type Row = [id: string, kind: CardSpec['kind'], cost: number, sight: number, hp: number, attack: number, range: number, production: number, score: number, copies: number];

// Rules.md 10.2
const BASE_TABLE: Row[] = [
  ['extractor', 'building', 2, 1, 4, 0, 0, 1, 2, 4],
  ['outpost', 'building', 3, 2, 6, 0, 0, 0, 3, 3],
  ['turret', 'building', 4, 1, 6, 2, 2, 0, 2, 2],
  ['scout', 'unit', 1, 2, 2, 1, 1, 0, 1, 3],
  ['fighter', 'unit', 3, 1, 4, 2, 1, 0, 1, 3],
  ['artillery', 'unit', 4, 1, 3, 3, 3, 0, 1, 2],
  ['cruiser', 'unit', 5, 1, 7, 3, 2, 0, 2, 1],
  ['meteor', 'magic', 3, 0, 0, 0, 0, 0, 0, 1],
  ['shield', 'magic', 2, 0, 0, 0, 0, 0, 0, 1],
];

// Rules.md 10.3
const SPECIAL_TABLE: Row[] = [
  ['refinery', 'building', 5, 1, 5, 0, 0, 3, 4, 0],
  ['observatory', 'building', 4, 3, 4, 0, 0, 0, 3, 0],
  ['fortress', 'building', 6, 2, 12, 2, 2, 0, 5, 0],
  ['battleship', 'unit', 8, 2, 12, 4, 2, 0, 3, 0],
  ['stealth', 'unit', 5, 1, 4, 3, 1, 0, 1, 0],
  ['repair-drone', 'unit', 3, 1, 2, 0, 0, 0, 1, 0],
  ['gravity-wave', 'magic', 5, 0, 0, 0, 0, 0, 0, 0],
  ['warp-gate', 'magic', 3, 3, 2, 0, 0, 0, 0, 0],
  ['energy-storm', 'magic', 2, 0, 0, 0, 0, 0, 0, 0],
];

function expectRow(spec: CardSpec, row: Row) {
  const [id, kind, cost, sight, hp, attack, range, production, score, copies] = row;
  expect(spec.id).toBe(id);
  expect(spec.kind).toBe(kind);
  expect(spec.cost).toBe(cost);
  expect(spec.sight).toBe(sight);
  expect(spec.hp).toBe(hp);
  expect(spec.attack).toBe(attack);
  expect(spec.range).toBe(range);
  expect(spec.production).toBe(production);
  expect(spec.score).toBe(score);
  expect(spec.copies).toBe(copies);
}

describe('카드 기준표 (Rules.md 10절)', () => {
  it('코어: 시야 2, 체력 20, 공격 0, 생산 1, 점수 0', () => {
    expect(CORE_SPEC.kind).toBe('core');
    expect(CORE_SPEC.sight).toBe(2);
    expect(CORE_SPEC.hp).toBe(20);
    expect(CORE_SPEC.attack).toBe(0);
    expect(CORE_SPEC.production).toBe(1);
    expect(CORE_SPEC.score).toBe(0);
    expect(CORE_SPEC.copies).toBe(0);
  });

  it('기본 덱 9종 수치가 표와 같다', () => {
    expect(BASE_CARDS).toHaveLength(BASE_TABLE.length);
    BASE_TABLE.forEach((row, i) => expectRow(BASE_CARDS[i] as CardSpec, row));
    for (const c of BASE_CARDS) expect(c.special).toBe(false);
  });

  it('특수 카드 9종 수치가 표와 같다', () => {
    expect(SPECIAL_CARDS).toHaveLength(SPECIAL_TABLE.length);
    SPECIAL_TABLE.forEach((row, i) => expectRow(SPECIAL_CARDS[i] as CardSpec, row));
    for (const c of SPECIAL_CARDS) expect(c.special).toBe(true);
    expect(specialCardsOf('building').map((c) => c.id)).toEqual(['refinery', 'observatory', 'fortress']);
    expect(specialCardsOf('unit').map((c) => c.id)).toEqual(['battleship', 'stealth', 'repair-drone']);
    expect(specialCardsOf('magic').map((c) => c.id)).toEqual(['gravity-wave', 'warp-gate', 'energy-storm']);
  });

  it('마법 효과와 키워드', () => {
    expect(getSpec('meteor').effect).toEqual({ kind: 'damage', amount: 3, radius: 1 });
    expect(getSpec('shield').effect).toEqual({ kind: 'heal', amount: 3, radius: 1 });
    expect(getSpec('gravity-wave').effect).toEqual({ kind: 'damage', amount: 2, radius: 2 });
    expect(getSpec('warp-gate').effect).toEqual({ kind: 'persistent', durationTurns: 3 });
    expect(getSpec('energy-storm').effect).toEqual({ kind: 'energy', amount: 6 });
    expect(getSpec('stealth').keywords).toEqual(['infiltrate']);
    expect(getSpec('repair-drone').keywords).toEqual(['repair']);
    for (const c of [...BASE_CARDS, ...SPECIAL_CARDS]) {
      if (c.kind !== 'magic') expect(c.effect).toBeNull();
      else expect(c.effect).not.toBeNull();
    }
  });

  it('기본 덱은 20장, 덱은 기본 20 + 특수 3 = 23장', () => {
    expect(BASE_DECK).toHaveLength(BASE_DECK_SIZE);
    expect(BASE_DECK.filter((id) => id === 'extractor')).toHaveLength(4);
    expect(BASE_DECK.filter((id) => id === 'cruiser')).toHaveLength(1);
    expect(isValidDeckChoice(DEFAULT_DECK_CHOICE)).toBe(true);
    expect(buildDeck(DEFAULT_DECK_CHOICE)).toHaveLength(DECK_SIZE);
    expect(DECK_SIZE).toBe(BASE_DECK_SIZE + CONSTANTS.SPECIAL_PICKS);
    expect(DEFAULT_DECK_CHOICE).toEqual({
      buildingId: specialCardsOf('building')[0]!.id,
      unitId: specialCardsOf('unit')[0]!.id,
      magicId: specialCardsOf('magic')[0]!.id,
    });
    expect(isValidDeckChoice({ buildingId: 'extractor', unitId: 'battleship', magicId: 'warp-gate' })).toBe(false);
    expect(isValidDeckChoice({ buildingId: 'refinery', unitId: 'refinery', magicId: 'warp-gate' })).toBe(false);
  });

  it('상수표 (Rules.md 12절)', () => {
    expect(CONSTANTS.STARTING_ENERGY).toBe(3);
    expect(CONSTANTS.CORE_BASE_INCOME).toBe(1);
    expect(CONSTANTS.CORE_HP).toBe(20);
    expect(CONSTANTS.CORE_SIGHT).toBe(2);
    expect(CONSTANTS.INITIAL_HAND_SIZE).toBe(4);
    expect(CONSTANTS.HAND_LIMIT).toBe(5);
    expect(CONSTANTS.DRAW_PER_TURN).toBe(1);
    expect(CONSTANTS.BASE_DECK_SIZE).toBe(20);
    expect(CONSTANTS.SPECIAL_PICKS).toBe(3);
    expect(CONSTANTS.VEIN_PRODUCTION_BONUS).toBe(1);
    expect(CONSTANTS.SCORE_PER_TERRITORY).toBe(1);
    expect(CONSTANTS.MIN_PLAYERS).toBe(2);
    expect(CONSTANTS.MAX_PLAYERS).toBe(4);
  });

  it('알 수 없는 카드는 오류', () => {
    expect(() => getSpec('nope')).toThrow();
  });
});

// Rules.md 11절
interface MapRow {
  id: string;
  players: number;
  size: number;
  roundLimit: number;
  cores: Position[];
  veins: Position[];
  asteroids: Position[];
}

const p = (x: number, y: number): Position => ({ x, y });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const MAP_TABLE: MapRow[] = [
  { id: 'binary-star', players: 2, size: 11, roundLimit: 20, cores: [p(2, 2), p(8, 8)], veins: [p(5, 5), p(2, 8), p(8, 2)], asteroids: [] },
  {
    id: 'asteroid-belt', players: 2, size: 13, roundLimit: 20, cores: [p(1, 6), p(11, 6)],
    veins: [p(4, 2), p(4, 10), p(8, 2), p(8, 10)],
    asteroids: range(0, 12).filter((y) => ![2, 6, 10].includes(y)).map((y) => p(6, y)),
  },
  { id: 'triangle-nebula', players: 3, size: 13, roundLimit: 18, cores: [p(6, 1), p(1, 10), p(11, 10)], veins: [p(6, 6), p(3, 5), p(9, 5), p(6, 10)], asteroids: [] },
  {
    id: 'interstellar-route', players: 3, size: 15, roundLimit: 18, cores: [p(7, 1), p(1, 12), p(13, 12)],
    veins: [p(7, 10), p(3, 6), p(11, 6)],
    asteroids: [p(7, 3), p(7, 4), p(7, 5), p(7, 7), p(6, 8), p(5, 9), p(4, 10), p(8, 8), p(9, 9), p(10, 10)],
  },
  {
    id: 'quadrant', players: 4, size: 15, roundLimit: 16, cores: [p(2, 2), p(12, 2), p(12, 12), p(2, 12)],
    veins: [p(7, 7), p(7, 2), p(12, 7), p(7, 12), p(2, 7)],
    asteroids: [p(7, 5), p(7, 6), p(7, 8), p(7, 9), p(5, 7), p(6, 7), p(8, 7), p(9, 7)],
  },
  {
    id: 'event-horizon', players: 4, size: 15, roundLimit: 16, cores: [p(7, 1), p(13, 7), p(7, 13), p(1, 7)],
    veins: [p(3, 3), p(11, 3), p(11, 11), p(3, 11)],
    asteroids: range(6, 8).flatMap((y) => range(6, 8).map((x) => p(x, y))),
  },
];

const sortPos = (a: Position[]) => a.slice().sort((u, v) => u.y - v.y || u.x - v.x);

describe('맵 6개 (Rules.md 11절)', () => {
  it('2인 2 / 3인 2 / 4인 2', () => {
    expect(MAPS.map((m) => m.players)).toEqual([2, 2, 3, 3, 4, 4]);
  });

  for (const row of MAP_TABLE) {
    it(`${row.id}: 인원·크기·라운드·코어·광맥·소행성 좌표`, () => {
      const m = getMap(row.id);
      expect(m.players).toBe(row.players);
      expect(m.size).toBe(row.size);
      expect(m.roundLimit).toBe(row.roundLimit);
      expect(m.corePositions).toEqual(row.cores);
      expect(sortPos(m.veins)).toEqual(sortPos(row.veins));
      expect(sortPos(m.asteroids)).toEqual(sortPos(row.asteroids));
    });
  }

  it('코어·광맥·소행성은 서로 겹치지 않고 보드 안이다', () => {
    for (const m of MAPS) {
      const all = [...m.corePositions, ...m.veins, ...m.asteroids];
      const keys = all.map((q) => `${q.x},${q.y}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const q of all) {
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.y).toBeGreaterThanOrEqual(0);
        expect(q.x).toBeLessThan(m.size);
        expect(q.y).toBeLessThan(m.size);
      }
    }
  });

  it('라운드 제한: 2인 20 / 3인 18 / 4인 16 (Rules.md 12절)', () => {
    for (const m of MAPS) expect(m.roundLimit).toBe({ 2: 20, 3: 18, 4: 16 }[m.players]);
  });
});
