/**
 * 일과 6장 (Rules.md 5.3, v7 「골목 일과」 2026-11-26). 표 순서 = 데이터 순서. 수치는 constants.ts.
 * name·description 은 화면 문구(고양이 테마)다. 바꾸면 Rules.md 5.3 표와 data.test.ts 도 함께 고친다.
 */
import type { ChoreId, ChoreSpec } from '../types.js';

export const CHORES: readonly ChoreSpec[] = [
  { id: 'bread', name: '식빵 굽기', description: '명당을 놓고, 놓은 칸에 고양이 +1.', place: true },
  { id: 'peek', name: '생선 냄새', description: '주머니 맨 위 타일을 펼쳐 보고, 펼친 타일 3개 중 1개를 가져와 명당을 놓는다.', place: true },
  { id: 'roam', name: '마실', description: '내 칸에서 두 칸 안의 빈 골목길에도 명당을 놓을 수 있다.', place: true },
  { id: 'boss', name: '대장 방울', description: '명당을 놓고, 다음 라운드에 내가 선이 된다.', place: true },
  { id: 'move', name: '담 넘기', description: '명당을 놓지 않고, 내 칸의 고양이 1~2마리를 맞닿은 칸으로 두 번까지 옮긴다.', place: false },
  { id: 'call', name: '명당 부르기', description: '명당을 놓지 않고, 내 칸 위 명당 하나를 돌려 그 모양대로 고양이를 다시 부른다(그 칸 +1). 그다음 펼친 타일 1개를 가져온다.', place: false },
];

export const CHORE_IDS: readonly ChoreId[] = CHORES.map((c) => c.id);

const BY_ID = new Map(CHORES.map((c) => [c.id, c]));

export function getChore(id: ChoreId): ChoreSpec {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`없는 일과: ${id}`);
  return c;
}

export function isChoreId(v: unknown): v is ChoreId {
  return typeof v === 'string' && BY_ID.has(v as ChoreId);
}

/** 명당을 놓는 일과인가 (가져오기 → 심기) */
export const isPlaceChore = (id: ChoreId | null | undefined): boolean => !!id && getChore(id).place;
