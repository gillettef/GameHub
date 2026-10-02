/**
 * shared/src/data 가 notes/Rules.md 10~12절 표와 일치하는지 검증한다.
 * 기대값은 Rules.md 를 그대로 옮긴 것이다. 규칙을 바꾸면 Rules.md → 이 표 → 데이터 순으로 고친다.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_CARDS_BY_RACE,
  BASE_DECK_SIZE,
  CONSTANTS,
  CORE_SPEC,
  DECK_SIZE,
  FIXED_DECKS,
  MAPS,
  RACES,
  SPECIAL_CARDS_BY_RACE,
  buildDeck,
  getMap,
  getSpec,
  specialCardsOf,
} from './index.js';
import { cellsInRadius, hexDistance } from '../engine/index.js';
import type { CardSpec, Position, RaceId } from '../types/index.js';

type Row = [id: string, kind: CardSpec['kind'], cost: number, sight: number, hp: number, attack: number, range: number, production: number, score: number, copies: number];

function expectRow(spec: CardSpec, row: Row, race: RaceId) {
  const [id, kind, cost, sight, hp, attack, range, production, score, copies] = row;
  expect(spec.id).toBe(id);
  expect(spec.kind).toBe(kind);
  expect(spec.race).toBe(race);
  expect(spec.cost).toBe(cost);
  expect(spec.sight).toBe(sight);
  expect(spec.hp).toBe(hp);
  expect(spec.attack).toBe(attack);
  expect(spec.range).toBe(range);
  expect(spec.production).toBe(production);
  expect(spec.score).toBe(score);
  expect(spec.copies).toBe(copies);
}

// Rules.md 10.2 (인류 연합, 변경 없음)
const COALITION_BASE: Row[] = [
  ['extractor', 'building', 2, 1, 4, 0, 0, 1, 2, 4],
  ['outpost', 'building', 3, 2, 7, 0, 0, 0, 3, 3],
  ['turret', 'building', 4, 1, 6, 3, 2, 0, 2, 2],
  ['scout', 'unit', 1, 2, 2, 1, 1, 0, 1, 3],
  ['fighter', 'unit', 3, 1, 4, 2, 1, 0, 1, 3],
  ['artillery', 'unit', 4, 1, 3, 3, 3, 0, 1, 2],
  ['cruiser', 'unit', 5, 1, 7, 3, 2, 0, 2, 1],
  ['meteor', 'magic', 3, 0, 0, 0, 0, 0, 0, 1],
  ['shield', 'magic', 2, 0, 0, 0, 0, 0, 0, 1],
  ['energy-cell', 'magic', 0, 0, 0, 0, 0, 0, 0, 2],
];
const COALITION_SPECIAL: Row[] = [
  ['refinery', 'building', 5, 1, 5, 0, 0, 3, 4, 2],
  ['observatory', 'building', 4, 3, 4, 0, 0, 0, 3, 2],
  ['fortress', 'building', 6, 2, 12, 2, 2, 0, 5, 2],
  ['battleship', 'unit', 8, 2, 12, 4, 2, 0, 3, 2],
  ['stealth', 'unit', 5, 1, 4, 3, 1, 0, 1, 2],
  ['repair-drone', 'unit', 3, 1, 2, 0, 0, 0, 1, 2],
  ['gravity-wave', 'magic', 5, 0, 0, 0, 0, 0, 0, 2],
  ['warp-gate', 'magic', 3, 3, 2, 0, 0, 0, 0, 2],
  ['energy-storm', 'magic', 2, 0, 0, 0, 0, 0, 0, 2],
];

// 크릴 군락
const SWARM_BASE: Row[] = [
  ['larva-nest', 'building', 1, 1, 4, 0, 0, 1, 1, 3],
  ['bio-spire', 'building', 3, 2, 5, 0, 0, 0, 3, 3],
  ['spike-turret', 'building', 4, 1, 5, 3, 1, 0, 2, 1],
  ['drone', 'unit', 1, 1, 3, 1, 1, 0, 1, 3],
  ['stalker', 'unit', 2, 1, 4, 2, 1, 0, 1, 5],
  ['spitter', 'unit', 3, 1, 4, 2, 2, 0, 1, 2],
  ['brood-queen', 'unit', 5, 1, 7, 2, 1, 0, 2, 1],
  ['acid-spray', 'magic', 2, 0, 0, 0, 0, 0, 0, 2],
  ['swarm-call', 'magic', 0, 0, 0, 0, 0, 0, 0, 1],
  ['frenzy', 'magic', 1, 0, 0, 0, 0, 0, 0, 1],
];
const SWARM_SPECIAL: Row[] = [
  ['hive-fortress', 'building', 6, 2, 14, 3, 1, 0, 5, 2],
  ['chitin-refinery', 'building', 5, 1, 5, 0, 0, 3, 4, 2],
  ['spore-tower', 'building', 4, 3, 4, 0, 0, 0, 3, 2],
  ['alpha-brood', 'unit', 7, 2, 10, 4, 1, 0, 3, 2],
  ['burrower', 'unit', 4, 1, 4, 2, 1, 0, 1, 2],
  ['nurse-drone', 'unit', 2, 1, 2, 0, 0, 0, 1, 2],
  ['plague-burst', 'magic', 5, 0, 0, 0, 0, 0, 0, 2],
  ['pheromone-beacon', 'magic', 3, 3, 2, 0, 0, 0, 0, 2],
  ['overgrowth', 'magic', 2, 0, 0, 0, 0, 0, 0, 2],
];

// 오토마타 집정체
const AUTOMATA_BASE: Row[] = [
  ['fab-node', 'building', 3, 1, 7, 0, 0, 1, 3, 3],
  ['sentry-pylon', 'building', 4, 3, 5, 0, 0, 0, 3, 2],
  ['bastion', 'building', 4, 1, 10, 2, 2, 0, 3, 2],
  ['probe', 'unit', 1, 2, 2, 0, 0, 0, 1, 4],
  ['sentinel', 'unit', 4, 1, 6, 2, 1, 0, 1, 3],
  ['railgun-frame', 'unit', 5, 1, 5, 4, 3, 0, 2, 2],
  ['dreadnought-core', 'unit', 5, 1, 10, 3, 2, 0, 3, 1],
  ['overload-pulse', 'magic', 4, 0, 0, 0, 0, 0, 0, 2],
  ['nanite-repair', 'magic', 3, 0, 0, 0, 0, 0, 0, 1],
  ['power-surge', 'magic', 0, 0, 0, 0, 0, 0, 0, 2],
];
const AUTOMATA_SPECIAL: Row[] = [
  ['singularity-forge', 'building', 7, 1, 10, 0, 0, 4, 6, 2],
  ['deep-scanner', 'building', 5, 4, 4, 0, 0, 0, 4, 2],
  ['citadel', 'building', 8, 2, 16, 3, 2, 0, 6, 2],
  ['titan', 'unit', 8, 2, 14, 5, 2, 0, 4, 2],
  ['cloak-unit', 'unit', 6, 1, 5, 3, 1, 0, 2, 2],
  ['repair-node', 'unit', 4, 1, 3, 0, 0, 0, 1, 2],
  ['graviton-lance', 'magic', 6, 0, 0, 0, 0, 0, 0, 2],
  ['stasis-field', 'magic', 4, 4, 3, 0, 0, 0, 0, 2],
  ['core-surge', 'magic', 3, 0, 0, 0, 0, 0, 0, 2],
];

// 그림자 결사
const SHADE_BASE: Row[] = [
  ['null-collector', 'building', 2, 1, 4, 0, 0, 1, 2, 4],
  ['dead-relay', 'building', 3, 2, 6, 0, 0, 0, 3, 3],
  ['ambush-node', 'building', 4, 1, 5, 2, 2, 0, 2, 2],
  ['wisp', 'unit', 1, 2, 2, 1, 1, 0, 1, 3],
  ['shade-blade', 'unit', 2, 1, 3, 2, 1, 0, 1, 3],
  ['phase-striker', 'unit', 3, 1, 3, 3, 2, 0, 1, 2],
  ['wraith', 'unit', 5, 1, 5, 3, 1, 0, 2, 1],
  ['void-burst', 'magic', 3, 0, 0, 0, 0, 0, 0, 1],
  ['mirage-field', 'magic', 2, 0, 0, 0, 0, 0, 0, 1],
  ['dark-cell', 'magic', 0, 0, 0, 0, 0, 0, 0, 2],
];
const SHADE_SPECIAL: Row[] = [
  ['black-market', 'building', 5, 1, 5, 0, 0, 3, 4, 2],
  ['veiled-array', 'building', 4, 3, 4, 0, 0, 0, 3, 2],
  ['shroud-bastion', 'building', 6, 2, 11, 3, 2, 0, 5, 2],
  ['nightmare', 'unit', 7, 1, 9, 4, 1, 0, 3, 2],
  ['phantom-agent', 'unit', 5, 1, 3, 3, 1, 0, 1, 2],
  ['medic-wisp', 'unit', 3, 1, 2, 0, 0, 0, 1, 2],
  ['eclipse-wave', 'magic', 5, 0, 0, 0, 0, 0, 0, 2],
  ['false-signal', 'magic', 3, 3, 2, 0, 0, 0, 0, 2],
  ['entropy-surge', 'magic', 2, 0, 0, 0, 0, 0, 0, 2],
];

// 노바 포병단
const SIEGE_BASE: Row[] = [
  ['strip-mine', 'building', 2, 1, 4, 0, 0, 1, 2, 4],
  ['relay-spire', 'building', 3, 2, 6, 0, 0, 0, 3, 3],
  ['flak-tower', 'building', 4, 1, 6, 3, 3, 0, 2, 2],
  ['spotter', 'unit', 1, 3, 2, 0, 0, 0, 1, 3],
  ['gunner', 'unit', 3, 1, 3, 2, 3, 0, 1, 3],
  ['howitzer', 'unit', 5, 1, 4, 2, 3, 0, 1, 2],
  ['dreadshell', 'unit', 6, 1, 8, 3, 2, 0, 3, 1],
  ['orbital-strike', 'magic', 3, 0, 0, 0, 0, 0, 0, 1],
  ['repair-field', 'magic', 2, 0, 0, 0, 0, 0, 0, 1],
  ['charge-cell', 'magic', 0, 0, 0, 0, 0, 0, 0, 2],
];
const SIEGE_SPECIAL: Row[] = [
  ['heavy-foundry', 'building', 5, 1, 5, 0, 0, 3, 4, 2],
  ['far-scope', 'building', 4, 4, 4, 0, 0, 0, 3, 2],
  ['siege-bastion', 'building', 6, 2, 10, 4, 4, 0, 5, 2],
  ['titan-cannon', 'unit', 8, 2, 10, 5, 4, 0, 4, 2],
  ['saboteur', 'unit', 5, 1, 4, 3, 2, 0, 1, 2],
  ['field-medic', 'unit', 3, 1, 2, 0, 0, 0, 1, 2],
  ['barrage-shell', 'magic', 6, 0, 0, 0, 0, 0, 0, 2],
  ['designator-beacon', 'magic', 4, 4, 3, 0, 0, 0, 0, 2],
  ['overcharge-round', 'magic', 3, 0, 0, 0, 0, 0, 0, 2],
];

const RACE_TABLES: Record<RaceId, { base: Row[]; special: Row[] }> = {
  coalition: { base: COALITION_BASE, special: COALITION_SPECIAL },
  swarm: { base: SWARM_BASE, special: SWARM_SPECIAL },
  automata: { base: AUTOMATA_BASE, special: AUTOMATA_SPECIAL },
  shade: { base: SHADE_BASE, special: SHADE_SPECIAL },
  siege: { base: SIEGE_BASE, special: SIEGE_SPECIAL },
};

/** 종족별 고정 덱(Rules.md 10.7절)의 특수 필러 3장: 건물 1·유닛 1·마법 1 */
const FIXED_FILLERS: Record<RaceId, [building: string, unit: string, magic: string]> = {
  coalition: ['refinery', 'battleship', 'gravity-wave'],
  swarm: ['chitin-refinery', 'nurse-drone', 'overgrowth'],
  automata: ['deep-scanner', 'repair-node', 'core-surge'],
  shade: ['black-market', 'medic-wisp', 'entropy-surge'],
  siege: ['heavy-foundry', 'field-medic', 'overcharge-round'],
};

describe('카드 기준표 (Rules.md 10절)', () => {
  it('코어: 시야 1, 체력 20, 공격 0, 생산 1, 점수 0, 종족 없음', () => {
    expect(CORE_SPEC.kind).toBe('core');
    expect(CORE_SPEC.race).toBeNull();
    expect(CORE_SPEC.sight).toBe(1);
    expect(CORE_SPEC.hp).toBe(20);
    expect(CORE_SPEC.attack).toBe(0);
    expect(CORE_SPEC.production).toBe(CONSTANTS.CORE_BASE_INCOME);
    expect(CORE_SPEC.score).toBe(0);
    expect(CORE_SPEC.copies).toBe(0);
  });

  it('종족은 5개다', () => {
    expect(RACES.map((r) => r.id)).toEqual(['coalition', 'swarm', 'automata', 'shade', 'siege']);
  });

  for (const race of RACES.map((r) => r.id)) {
    const { base, special } = RACE_TABLES[race];

    it(`${race}: 기본 덱 10종 수치가 표와 같고, 합계 ${BASE_DECK_SIZE}장`, () => {
      const cards = BASE_CARDS_BY_RACE[race];
      expect(cards).toHaveLength(base.length);
      base.forEach((row, i) => expectRow(cards[i] as CardSpec, row, race));
      for (const c of cards) expect(c.special).toBe(false);
      expect(cards.reduce((s, c) => s + c.copies, 0)).toBe(BASE_DECK_SIZE);
    });

    it(`${race}: 특수 카드 9종(건물3·유닛3·마법3) 수치가 표와 같다`, () => {
      const cards = SPECIAL_CARDS_BY_RACE[race];
      expect(cards).toHaveLength(special.length);
      special.forEach((row, i) => expectRow(cards[i] as CardSpec, row, race));
      for (const c of cards) expect(c.special).toBe(true);
      expect(specialCardsOf(race, 'building')).toHaveLength(3);
      expect(specialCardsOf(race, 'unit')).toHaveLength(3);
      expect(specialCardsOf(race, 'magic')).toHaveLength(3);
    });

    it(`${race}: 마법 카드만 효과를 갖는다`, () => {
      for (const c of [...BASE_CARDS_BY_RACE[race], ...SPECIAL_CARDS_BY_RACE[race]]) {
        if (c.kind !== 'magic') expect(c.effect).toBeNull();
        else expect(c.effect).not.toBeNull();
      }
    });

    it(`${race}: 고정 덱은 기본 22장 전부 + 특수 필러(건물1·유닛1·마법1) = ${DECK_SIZE}장이다 (Rules.md 10.7절)`, () => {
      const [building, unit, magic] = FIXED_FILLERS[race];
      const deck = FIXED_DECKS[race];
      for (const c of BASE_CARDS_BY_RACE[race]) expect(deck[c.id]).toBe(c.copies);
      expect(deck[building]).toBe(1);
      expect(deck[unit]).toBe(1);
      expect(deck[magic]).toBe(1);
      expect(specialCardsOf(race, 'building').some((c) => c.id === building)).toBe(true);
      expect(specialCardsOf(race, 'unit').some((c) => c.id === unit)).toBe(true);
      expect(specialCardsOf(race, 'magic').some((c) => c.id === magic)).toBe(true);
      expect(Object.values(deck).reduce((a, b) => a + b, 0)).toBe(DECK_SIZE);
      expect(buildDeck(race)).toHaveLength(DECK_SIZE);
    });
  }

  it('키워드: 침투·정비·과부하·은신·다중 포격이 각 종족에 있다', () => {
    expect(getSpec('stealth').keywords).toEqual(['infiltrate']);
    expect(getSpec('repair-drone').keywords).toEqual(['repair']);
    expect(getSpec('drone').keywords).toEqual(['infiltrate']);
    expect(getSpec('nurse-drone').keywords).toEqual(['repair']);
    expect(getSpec('fab-node').keywords).toEqual(['overclock']);
    expect(getSpec('singularity-forge').keywords).toEqual(['overclock']);
    expect(getSpec('wisp').keywords).toEqual(['veil']);
    expect(getSpec('shade-blade').keywords).toEqual(['veil', 'infiltrate']);
    expect(getSpec('spitter').keywords).toEqual(['infiltrate']);
    expect(getSpec('howitzer').keywords).toEqual(['barrage']);
    expect(getSpec('titan-cannon').keywords).toEqual(['barrage']);
  });

  it('종족마다 고정 덱의 카드 id는 전부 그 종족 소속이다', () => {
    for (const race of RACES.map((r) => r.id)) {
      for (const id of Object.keys(FIXED_DECKS[race])) {
        expect(getSpec(id).race).toBe(race);
      }
    }
  });

  it('상수표 (Rules.md 12절)', () => {
    expect(CONSTANTS.STARTING_ENERGY).toBe(5);
    expect(CONSTANTS.CORE_BASE_INCOME).toBe(1);
    expect(CONSTANTS.CORE_HP).toBe(20);
    expect(CONSTANTS.CORE_SIGHT).toBe(1);
    expect(CONSTANTS.INITIAL_HAND_SIZE).toBe(4);
    expect(CONSTANTS.HAND_LIMIT).toBe(5);
    expect(CONSTANTS.DRAW_PER_TURN).toBe(1);
    expect(CONSTANTS.BASE_DECK_SIZE).toBe(22);
    expect(CONSTANTS.DECK_SIZE).toBe(25);
    expect(CONSTANTS.VEIN_PRODUCTION_BONUS).toBe(1);
    expect(CONSTANTS.SCORE_PER_TERRITORY).toBe(1);
    expect(CONSTANTS.TERRITORY_RADIUS).toBe(1);
    expect(CONSTANTS.KOMI_PER_SEAT).toBe(1);
    expect(CONSTANTS.MIN_PLAYERS).toBe(2);
    expect(CONSTANTS.MAX_PLAYERS).toBe(4);
    expect(CONSTANTS.OVERCLOCK_RADIUS).toBe(1);
    expect(CONSTANTS.OVERCLOCK_BONUS_PER_NEIGHBOR).toBe(1);
    expect(CONSTANTS.NEBULA_SIGHT_PENALTY).toBe(1);
    expect(CONSTANTS.DEBRIS_FIELD_HP_PENALTY).toBe(1);
    expect(CONSTANTS.ION_STORM_DAMAGE).toBe(1);
    expect(CONSTANTS.RELIC_SITE_SCORE_BONUS).toBe(1);
    expect(CONSTANTS.GRAVITY_RIFT_SCORE_PENALTY).toBe(1);
    expect(CONSTANTS.GUN_EMPLACEMENT_ATTACK_BONUS).toBe(1);
    expect(CONSTANTS.JAMMING_FIELD_RANGE_PENALTY).toBe(1);
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

// 좌표는 scripts/hexmap 계산 결과 (odd-r 오프셋, 2026-09-23 10x10 재설계). 좌석별 공정성은
// 아래 '좌석 공정성' describe 가 검증한다.
const MAP_TABLE: MapRow[] = [
  { id: 'binary-star', players: 2, size: 10, roundLimit: 20, cores: [p(3, 2), p(7, 7)], veins: [p(1, 1), p(6, 3), p(6, 8)], asteroids: [] },
  {
    id: 'asteroid-belt', players: 2, size: 10, roundLimit: 20, cores: [p(1, 4), p(8, 5)],
    veins: [p(1, 2), p(8, 7), p(2, 6), p(7, 3)],
    asteroids: [p(4, 0), p(4, 1), p(4, 2), p(4, 3), p(5, 6), p(5, 7), p(5, 8), p(5, 9)],
  },
  { id: 'triangle-nebula', players: 3, size: 10, roundLimit: 18, cores: [p(1, 3), p(7, 1), p(6, 8)], veins: [p(3, 5), p(5, 2), p(6, 5)], asteroids: [] },
  {
    id: 'interstellar-route', players: 3, size: 10, roundLimit: 18, cores: [p(2, 3), p(7, 2), p(5, 7)],
    veins: [p(3, 5), p(5, 2), p(6, 5)],
    asteroids: [p(6, 4), p(7, 4), p(8, 4), p(4, 5), p(4, 6), p(3, 7), p(4, 3), p(4, 2), p(3, 1)],
  },
  {
    id: 'quadrant', players: 4, size: 10, roundLimit: 16, cores: [p(4, 1), p(8, 4), p(5, 8), p(1, 5)],
    veins: [p(2, 0), p(9, 1), p(0, 8), p(7, 9)],
    asteroids: [p(4, 4), p(5, 4), p(4, 5), p(5, 5)],
  },
  {
    id: 'event-horizon', players: 4, size: 10, roundLimit: 16, cores: [p(6, 1), p(8, 4), p(3, 8), p(1, 5)],
    veins: [p(0, 0), p(9, 1), p(0, 8), p(9, 9)],
    asteroids: [p(4, 3), p(4, 4), p(5, 4), p(4, 5), p(5, 5), p(5, 6)],
  },
];

/** 새 지형 7종(2026-09-28 신설)의 맵별 좌표. 배치는 120°/180° 회전·점대칭으로 좌석 공정성을 맞췄다
 * (4인 맵 2곳은 기존 코어처럼 완전 대칭이 없어, 각 코어에서 육각 거리 1인 바깥쪽 칸으로 맞췄다) */
const EXTRA_TERRAIN_TABLE: Record<string, Partial<Record<'nebulas' | 'debrisFields' | 'ionStorms' | 'relicSites' | 'gravityRifts' | 'gunEmplacements' | 'jammingFields', Position[]>>> = {
  'binary-star': { nebulas: [p(2, 4), p(8, 5)], relicSites: [p(1, 5), p(9, 4)] },
  'asteroid-belt': { debrisFields: [p(1, 1), p(8, 8)], gravityRifts: [p(8, 2), p(1, 7)] },
  'triangle-nebula': { ionStorms: [p(3, 2), p(7, 3), p(7, 6)] },
  'interstellar-route': { gunEmplacements: [p(1, 4), p(7, 0), p(9, 4)] },
  quadrant: { jammingFields: [p(4, 0), p(9, 4), p(5, 9), p(0, 5)] },
  'event-horizon': { nebulas: [p(6, 0), p(9, 4), p(3, 9), p(0, 5)] },
};

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

  for (const [id, extra] of Object.entries(EXTRA_TERRAIN_TABLE)) {
    it(`${id}: 새 지형 7종 좌표`, () => {
      const m = getMap(id);
      const keys = ['nebulas', 'debrisFields', 'ionStorms', 'relicSites', 'gravityRifts', 'gunEmplacements', 'jammingFields'] as const;
      for (const key of keys) {
        expect(sortPos(m[key])).toEqual(sortPos(extra[key] ?? []));
      }
    });
  }

  it('코어·광맥·소행성·새 지형은 서로 겹치지 않고 보드 안이다', () => {
    for (const m of MAPS) {
      const all = [
        ...m.corePositions,
        ...m.veins,
        ...m.asteroids,
        ...m.nebulas,
        ...m.debrisFields,
        ...m.ionStorms,
        ...m.relicSites,
        ...m.gravityRifts,
        ...m.gunEmplacements,
        ...m.jammingFields,
      ];
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

/**
 * 육각 전환 후 좌석 공정성. 대칭 모양이 아니라 계산된 값으로 보장한다 (Rules.md 11절 서두).
 * 좌표는 정사각이 아닌 odd-r 오프셋 육각 거리(hexDistance)로 잰다.
 */
/** MapDef → Board. 새 지형 7종은 배치를 막지 않으므로(소행성만 막음) 공정성 계산에 넣지 않는다 */
function boardOf(m: ReturnType<typeof getMap>) {
  return {
    width: m.size,
    height: m.size,
    asteroids: m.asteroids,
    veins: m.veins,
    nebulas: m.nebulas,
    debrisFields: m.debrisFields,
    ionStorms: m.ionStorms,
    relicSites: m.relicSites,
    gravityRifts: m.gravityRifts,
    gunEmplacements: m.gunEmplacements,
    jammingFields: m.jammingFields,
  };
}

describe('맵 6개: 좌석 공정성 (odd-r 오프셋 육각 거리)', () => {
  /** 코어 시야(반경 1) 안, 코어 자신을 뺀 칸 중 보드 안이고 다른 코어·소행성이 없는 칸 수 */
  function legalNeighbors(m: ReturnType<typeof getMap>, core: Position): number {
    const others = new Set(
      [...m.corePositions.filter((c) => c !== core), ...m.asteroids].map((q) => `${q.x},${q.y}`),
    );
    const board = boardOf(m);
    return cellsInRadius(board, core, 1).filter((q) => q.x !== core.x || q.y !== core.y).filter(
      (q) => !others.has(`${q.x},${q.y}`),
    ).length;
  }
  function nearestVein(m: ReturnType<typeof getMap>, core: Position): number {
    return Math.min(...m.veins.map((v) => hexDistance(core, v)));
  }
  function within3(points: Position[], core: Position): number {
    return points.filter((q) => hexDistance(core, q) <= 3).length;
  }
  function edgeDistance(m: ReturnType<typeof getMap>, core: Position): number {
    const board = boardOf(m);
    let r = 0;
    while (r < 10 && cellsInRadius(board, core, r + 1).length === 3 * (r + 1) * (r + 2) + 1) r++;
    return r;
  }
  function pairDistances(m: ReturnType<typeof getMap>, core: Position): number[] {
    return m.corePositions
      .filter((c) => c !== core)
      .map((c) => hexDistance(core, c))
      .sort((a, b) => a - b);
  }

  for (const id of MAPS.map((m) => m.id)) {
    it(`${id}: 좌석마다 배치 가능 칸·최근접 광맥·경계 여유·코어 거리 프로필이 동일`, () => {
      const m = getMap(id);
      const legal = m.corePositions.map((c) => legalNeighbors(m, c));
      const nearest = m.corePositions.map((c) => nearestVein(m, c));
      const veins3 = m.corePositions.map((c) => within3(m.veins, c));
      const asteroids3 = m.corePositions.map((c) => within3(m.asteroids, c));
      const edges = m.corePositions.map((c) => edgeDistance(m, c));
      const profiles = m.corePositions.map((c) => pairDistances(m, c));

      expect(new Set(legal).size).toBe(1);
      expect(new Set(nearest).size).toBe(1);
      expect(new Set(veins3).size).toBe(1);
      expect(new Set(asteroids3).size).toBe(1);
      expect(new Set(edges).size).toBe(1);
      const firstProfile = JSON.stringify(profiles[0]);
      for (const pr of profiles) expect(JSON.stringify(pr)).toBe(firstProfile);
    });
  }
});
