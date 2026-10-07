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
    expect(getSpecies('vine')).toMatchObject({ line: 2, lineLength: 2 });
    expect(getSpecies('fern')).toMatchObject({ star2: 1 });
    expect(getSpecies('dandelion')).toMatchObject({ seed: 2 });
    expect(getSpecies('sunflower')).toMatchObject({ fertileRing: 2 }); // 거리 1이 1+2 = 3
    expect(getSpecies('lotus')).toMatchObject({ pondPlanting: true });
    expect(getSpecies('ivy')).toMatchObject({ ivy: 1 });
    expect(getSpecies('bamboo')).toMatchObject({ cluster: 2 });
    expect(getSpecies('mushroom')).toMatchObject({ wither: 2 });
    expect(getSpecies('rose')).toMatchObject({ bloomBonus: 1 });
  });
});

describe('Rules.md 8절 목표 표와 데이터 일치', () => {
  const rows = tableRows('## 8. 목표 카드 18장').filter((r) => /^\d+$/.test(r[0] ?? ''));
  it('18장, id·이름·순서', () => {
    expect(rows.map((r) => r[1]?.replace(/`/g, ''))).toEqual(GOALS.map((g) => g.id));
    expect(rows.map((r) => r[2])).toEqual(GOALS.map((g) => g.name));
  });
  it('종 연계 목표는 6장', () => {
    expect(GOALS.filter((g) => g.species).map((g) => g.species)).toEqual(['cactus', 'vine', 'fern', 'grass', 'mushroom', 'dandelion']);
  });
});

describe('Rules.md 4절 좌석 보정 표와 데이터 일치', () => {
  const rows = tableRows('### 좌석 보정').filter((r) => /인$/.test(r[0] ?? ''));
  it('인원별 드래프트 첫 바퀴·덤', () => {
    for (const r of rows) {
      const n = Number(r[0]!.replace('인', ''));
      const rule = PLAYER_COUNT_RULES[n]!;
      expect(r[1]!.match(/\d/g)!.map(Number)).toEqual(rule.draftFirstRound);
      expect(r[2]!.split(',').map((x) => Number(x.trim()))).toEqual(rule.komi);
    }
    expect(rows).toHaveLength(3);
  });
  it('인원별 드래프트 종 수·장수 (Rules.md 10절)', () => {
    expect(PLAYER_COUNT_RULES[2]).toMatchObject({ picks: 5, copies: 3, maxTakers: 1 });
    expect(PLAYER_COUNT_RULES[3]).toMatchObject({ picks: 4, copies: 4, maxTakers: 1 });
    expect(PLAYER_COUNT_RULES[4]).toMatchObject({ picks: 4, copies: 4, maxTakers: 2 });
  });
});

describe('정원 조각 (Rules.md 3.2)', () => {
  it('일반 12장, 연못·돌밭 합 12칸', () => {
    expect(TILE_LIBRARY).toHaveLength(12);
    const blocked = TILE_LIBRARY.flat().filter(([, t]) => t === 'pond' || t === 'rock').length;
    expect(blocked).toBe(12);
  });
});
