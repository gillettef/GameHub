import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BREAD_BONUS,
  CALL_BONUS,
  CHORES,
  CHORE_EXTRA,
  CHORE_IDS,
  FLOWER_SPECIES,
  FOREST_SPECIES,
  GOALS,
  HAND_MAX,
  MOVE_MAX,
  MOVE_TIMES,
  PLAYER_COUNT_RULES,
  ROAM_RANGE,
  SPECIES,
  TILE_LIBRARY,
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
  const rows = tableRows('## 7. 식물 9종').filter((r) => /^\d+$/.test(r[0] ?? ''));

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
  const rows = tableRows('## 8. 목표 카드 16장').filter((r) => /^\d+$/.test(r[0] ?? ''));
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
    expect(PLAYER_COUNT_RULES[4]).toMatchObject({ gardenSize: 8, copies: 5, market: 2, supply: 16 });
    for (const [n, turns] of [[2, 12], [3, 10], [4, 10]] as const) expect(PLAYER_COUNT_RULES[n]!.gardenSize * PLAYER_COUNT_RULES[n]!.copies).toBe(n * turns);
    expect(RULES).toContain('2인 16 / 3인 18 / 4인 16');
  });
});

describe('정원 조각 (Rules.md 3.2)', () => {
  it('일반 12장, 연못·돌밭 합 12칸', () => {
    expect(TILE_LIBRARY).toHaveLength(12);
    const blocked = TILE_LIBRARY.flat().filter(([, t]) => t === 'pond' || t === 'rock').length;
    expect(blocked).toBe(12);
  });
});

describe('Rules.md 5.3 일과 표와 데이터 일치 (v7)', () => {
  const rows = tableRows('### 5.3 일과 6장').filter((r) => /^`[a-z]+`$/.test(r[1] ?? ''));
  it('6장, 표 순서 = 데이터 순서, 이름·놓기 여부', () => {
    expect(rows.map((r) => strip(r[1]))).toEqual(CHORES.map((c) => c.id));
    expect(rows.map((r) => r[0])).toEqual(CHORES.map((c) => c.name));
    expect(rows.map((r) => r[2] === '놓는다')).toEqual(CHORES.map((c) => c.place));
    for (const r of rows) expect(['놓는다', '안 놓는다']).toContain(r[2]);
    expect(CHORE_IDS).toHaveLength(6);
  });
  it('효과 문구의 수치: 식빵·부르기 +1, 담 넘기 두 번까지 1~2개, 마실 두 칸', () => {
    const effect = (id: string) => rows.find((r) => strip(r[1]) === id)![3]!;
    expect(effect('bread')).toContain(`**+${BREAD_BONUS}**`);
    expect(effect('call')).toContain(`+${CALL_BONUS}`);
    expect(effect('move')).toContain('**두 번까지**');
    expect(effect('move')).toContain(`1~${MOVE_MAX}개`);
    expect(effect('roam')).toContain('두 칸 안');
    expect([MOVE_TIMES, ROAM_RANGE]).toEqual([2, 2]);
  });
});

describe('Rules.md 10절 v7 상수 표와 데이터 일치', () => {
  const rows = new Map(tableRows('## 10. 상수').map((r) => [r[0] ?? '', r[1] ?? '']));
  it('일과 공개 장수·라운드 수·손 최대·보너스·담 넘기', () => {
    expect(rows.get('일과 (v7)')).toBe(`${CHORES.length}장, 라운드마다 (인원 + ${CHORE_EXTRA})장 공개, 선부터 1장씩`);
    expect(rows.get('라운드 수 (v7)')).toBe(`2인 ${PLAYER_COUNT_RULES[2]!.rounds} / 3·4인 ${PLAYER_COUNT_RULES[3]!.rounds}`);
    expect(PLAYER_COUNT_RULES[4]!.rounds).toBe(PLAYER_COUNT_RULES[3]!.rounds);
    expect(rows.get('손 카드 최대 (v7)')).toBe(`${HAND_MAX}장`);
    expect(BREAD_BONUS).toBe(CALL_BONUS);
    expect(rows.get('식빵 굽기 · 명당 부르기 칸 보너스')).toBe(`+${BREAD_BONUS}`);
    expect(rows.get('담 넘기')).toBe(`${MOVE_TIMES}번, 한 번에 1~${MOVE_MAX}개`);
    // 5.4 라운드 수 문장과도 같다
    expect(RULES).toContain(`2인 **${PLAYER_COUNT_RULES[2]!.rounds}**, 3·4인 **${PLAYER_COUNT_RULES[3]!.rounds}** 라운드`);
  });
  it('카드 장수 = 인원 × 라운드 수 (명당만 놓으면 마지막 라운드에 더미가 빈다)', () => {
    for (const n of [2, 3, 4]) {
      const r = PLAYER_COUNT_RULES[n]!;
      expect(r.gardenSize * r.copies).toBe(n * r.rounds);
    }
  });
});
