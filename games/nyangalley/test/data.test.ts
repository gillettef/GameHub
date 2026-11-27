import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FLOWER_SPECIES,
  FOREST_SPECIES,
  GOALS,
  HAND_MAX,
  PLAYER_COUNT_RULES,
  SPECIES,
  TAKE_COUNT,
  TILE_LIBRARY,
  FOUR_PLAYER_TILE,
  getSpecies,
} from '../src/engine/index.js';

const RULES = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'notes', 'Rules.md'), 'utf8');

/** Rules.md 의 표 행을 `|` 로 나눠 셀 목록으로 */
function tableRows(startHeading: string): string[][] {
  const start = RULES.indexOf(startHeading);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = RULES.slice(start);
  const end = rest.indexOf('\n## ', 5);
  return rest
    .slice(0, end === -1 ? undefined : end)
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('|---'))
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
}

const strip = (s: string | undefined) => (s ?? '').replace(/`/g, '');

describe('Rules.md 7절 식물 표와 데이터 일치', () => {
  const rows = tableRows('## 7. 명당 9종').filter((r) => /^\d+$/.test(r[0] ?? ''));

  it('9종, 표 순서 = 데이터 순서', () => {
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => strip(r[2]))).toEqual(SPECIES.map((s) => s.id));
  });

  it('이름·뿌리 모양·큐브 합', () => {
    for (const r of rows) {
      const sp = getSpecies(strip(r[2]) as never);
      expect(r[1]).toBe(sp.name);
      const roots = strip(r[3])
        .split(' ')
        .map((t) => {
          const [xy, n] = t.split('×');
          const [dq, dr] = xy!.split(',').map(Number);
          return { dq, dr, n: Number(n) };
        });
      expect(roots).toEqual(sp.roots);
      expect(Number(r[4])).toBe(sp.roots.reduce((a, x) => a + x.n, 0));
      expect(sp.roots[0]).toMatchObject({ dq: 0, dr: 0 }); // 심은 칸 먼저
    }
  });

  it('능력 수치', () => {
    expect(getSpecies('dandelion')).toMatchObject({ seed: 1 });
    expect(getSpecies('lotus')).toMatchObject({ pondPlanting: true });
    expect(getSpecies('mushroom')).toMatchObject({ wither: 2 });
    expect(getSpecies('mugunghwa')).toMatchObject({ bloomBonus: 1 });
    const withAbility = SPECIES.filter((s) => s.seed || s.pondPlanting || s.wither || s.bloomBonus).map((s) => s.id);
    expect(withAbility).toEqual(['dandelion', 'lotus', 'mushroom', 'mugunghwa']);
  });

  it('꽃·나무', () => {
    expect(FLOWER_SPECIES).toEqual(['dandelion', 'lotus', 'mugunghwa']);
    expect(FOREST_SPECIES).toEqual(['oak', 'pine']);
  });
});

describe('Rules.md 8절 목표 표와 데이터 일치', () => {
  const rows = tableRows('## 8. 소문 카드 16장').filter((r) => /^\d+$/.test(r[0] ?? ''));
  it('16장, id·이름·순서', () => {
    expect(rows.map((r) => strip(r[1]))).toEqual(GOALS.map((g) => g.id));
    expect(rows.map((r) => r[2])).toEqual(GOALS.map((g) => g.name));
  });
  it('종 연계 목표는 6장', () => {
    expect(GOALS.filter((g) => g.species).map((g) => g.species)).toEqual(['pine', 'kudzu', 'fern', 'grass', 'mushroom', 'dandelion']);
  });
});

describe('Rules.md 4절 자리 보정 표와 데이터 일치', () => {
  const rows = tableRows('### 자리 보정').filter((r) => /인$/.test(r[0] ?? ''));
  it('인원별 덤', () => {
    for (const r of rows) {
      const n = Number(r[0]!.replace('인', ''));
      expect(r[1]!.split(',').map((x) => Number(x.trim()))).toEqual(PLAYER_COUNT_RULES[n]!.komi);
    }
    expect(rows).toHaveLength(3);
  });
  it('인원별 구성 (Rules.md 4·10절): 식물 수 × 장수 = 인원 × 각자 심는 횟수', () => {
    expect(PLAYER_COUNT_RULES[2]).toMatchObject({ gardenSize: 6, copies: 4, market: 2, supply: 16 });
    expect(PLAYER_COUNT_RULES[3]).toMatchObject({ gardenSize: 6, copies: 5, market: 2, supply: 18 });
    expect(PLAYER_COUNT_RULES[4]).toMatchObject({ gardenSize: 8, copies: 5, market: 2, supply: 18 });
    for (const [n, turns] of [[2, 12], [3, 10], [4, 10]] as const) expect(PLAYER_COUNT_RULES[n]!.gardenSize * PLAYER_COUNT_RULES[n]!.copies).toBe(n * turns);
    expect(RULES).toContain('2인 16 / 3인 18 / 4인 18');
  });
});

describe('정원 조각 (Rules.md 3.2)', () => {
  it('일반 12장, 연못·돌밭 합 12칸', () => {
    expect(TILE_LIBRARY).toHaveLength(12);
    const blocked = TILE_LIBRARY.flat().filter(([, t]) => t === 'pond' || t === 'rock').length;
    expect(blocked).toBe(12);
  });
  it('4인 전용 13번 조각은 모두 빈 땅', () => {
    expect(FOUR_PLAYER_TILE).toEqual([]);
  });
});

describe('Rules.md 10절 v8 상수 표와 데이터 일치', () => {
  const rows = new Map(tableRows('## 10. 상수').map((r) => [r[0] ?? '', r[1] ?? '']));
  it('가져오기 장수·손 최대·라운드 수', () => {
    expect(rows.get('가져오기 개수 (v8)')).toBe(`펼친 타일 1개 또는 주머니 ${TAKE_COUNT}개`);
    expect(rows.get('손 타일 최대 (v8)')).toBe(`${HAND_MAX}개`);
    expect(rows.get('라운드 수 (v8)')).toBe(`2인 ${PLAYER_COUNT_RULES[2]!.rounds} / 3·4인 ${PLAYER_COUNT_RULES[3]!.rounds}`);
    expect(PLAYER_COUNT_RULES[4]!.rounds).toBe(PLAYER_COUNT_RULES[3]!.rounds);
    // 5.1·5.2 문장과도 같다
    expect(RULES).toContain(`**주머니 맨 위에서 ${TAKE_COUNT}개**`);
    expect(RULES).toContain(`손 타일은 최대 **${HAND_MAX}개**다`);
    expect(RULES).toContain(`2인 **${PLAYER_COUNT_RULES[2]!.rounds}**, 3·4인 **${PLAYER_COUNT_RULES[3]!.rounds}** 라운드`);
  });
});
