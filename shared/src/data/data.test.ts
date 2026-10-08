import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GOALS, PLAYER_COUNT_RULES, SPECIES, TILE_LIBRARY, getSpecies } from './index.js';

const RULES = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'notes', 'Rules.md'), 'utf8');

/** Rules.md 의 표 행을 `|` 로 나눠 셀 목록으로 */
function tableRows(startHeading: string): string[][] {
  const start = RULES.indexOf(startHeading);
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

describe('Rules.md 7절 식물 표와 데이터 일치', () => {
  const rows = tableRows('## 7. 식물 12종').filter((r) => /^\d+$/.test(r[0] ?? ''));

  it('12종, 표 순서 = 데이터 순서', () => {
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r[2]?.replace(/`/g, ''))).toEqual(SPECIES.map((s) => s.id));
  });

  it('이름·자기·거리 1 수치', () => {
    for (const r of rows) {
      const sp = getSpecies(r[2]!.replace(/`/g, '') as never);
      expect(r[1]).toBe(sp.name);
      expect(Number(r[3])).toBe(sp.self);
      expect(Number(r[4])).toBe(sp.ring1);
    }
  });

  it('특수 효과 수치', () => {
    expect(getSpecies('kudzu')).toMatchObject({ line: 2, lineLength: 2 });
    expect(getSpecies('fern')).toMatchObject({ star2: 1 });
    expect(getSpecies('dandelion')).toMatchObject({ seed: 2 });
    expect(getSpecies('rapeseed')).toMatchObject({ fertileRing: 2 }); // 거리 1이 1+2 = 3
    expect(getSpecies('lotus')).toMatchObject({ pondPlanting: true });
    expect(getSpecies('ivy')).toMatchObject({ ivy: 1 });
    expect(getSpecies('bamboo')).toMatchObject({ cluster: 2 });
    expect(getSpecies('mushroom')).toMatchObject({ wither: 2 });
    expect(getSpecies('mugunghwa')).toMatchObject({ bloomBonus: 1 });
  });
});

describe('Rules.md 8절 목표 표와 데이터 일치', () => {
  const rows = tableRows('## 8. 목표 카드 18장').filter((r) => /^\d+$/.test(r[0] ?? ''));
  it('18장, id·이름·순서', () => {
    expect(rows.map((r) => r[1]?.replace(/`/g, ''))).toEqual(GOALS.map((g) => g.id));
    expect(rows.map((r) => r[2])).toEqual(GOALS.map((g) => g.name));
  });
  it('종 연계 목표는 6장', () => {
    expect(GOALS.filter((g) => g.species).map((g) => g.species)).toEqual(['pine', 'kudzu', 'fern', 'grass', 'mushroom', 'dandelion']);
  });
});

describe('Rules.md 4절 자리 보정 표와 데이터 일치', () => {
  const rows = tableRows('### 좌석 보정').filter((r) => /인$/.test(r[0] ?? ''));
  it('인원별 덤', () => {
    for (const r of rows) {
      const n = Number(r[0]!.replace('인', ''));
      expect(r[1]!.split(',').map((x) => Number(x.trim()))).toEqual(PLAYER_COUNT_RULES[n]!.komi);
    }
    expect(rows).toHaveLength(3);
  });
  it('인원별 이번 판 식물 수·장수 (Rules.md 10절): 식물 수 × 장수 = 인원 × 각자 두는 횟수', () => {
    expect(PLAYER_COUNT_RULES[2]).toMatchObject({ gardenSize: 6, copies: 5 });
    expect(PLAYER_COUNT_RULES[3]).toMatchObject({ gardenSize: 8, copies: 6 });
    expect(PLAYER_COUNT_RULES[4]).toMatchObject({ gardenSize: 8, copies: 8 });
    for (const [n, turns] of [[2, 15], [3, 16], [4, 16]] as const) expect(PLAYER_COUNT_RULES[n]!.gardenSize * PLAYER_COUNT_RULES[n]!.copies).toBe(n * turns);
  });
});

describe('정원 조각 (Rules.md 3.2)', () => {
  it('일반 12장, 연못·돌밭 합 12칸', () => {
    expect(TILE_LIBRARY).toHaveLength(12);
    const blocked = TILE_LIBRARY.flat().filter(([, t]) => t === 'pond' || t === 'rock').length;
    expect(blocked).toBe(12);
  });
});
