/**
 * 「냥냥 골목」 그림 (2026-11-26 클로드 디자인). 파일은 `public/art/` 에 있다.
 *  - 명당 타일(규칙 용어 식물 카드): `spot-<종 id>.svg` — 꼭짓점이 위인 육각 타일(viewBox -100..100, 1:1).
 *    타일 안에 이름·칸마다 모이는 고양이 수 배지·능력 칩이 그려져 있다. 뒷면(주머니) `spot-back.svg`
 *  - 소문 카드(규칙 용어 목표 카드): `goal-<목표 id>.svg` — 세로 630×880. 뒷면 `goal-back.svg`
 * 파일 이름은 Rules.md 의 영문 id 그대로다. 빠진 파일이 없는지는 cardImages.test.ts 가 검사한다.
 * 옛 카드 디자인(`public/cards/`)은 더는 이 파일에서 쓰지 않는다.
 */
import type { ChoreId, GoalId, SpeciesId } from '../../engine';
// 페이지 기준 상대경로(허브 /rootbound/ 아래에서도, 루트 직접 접속에서도 맞다)
const base = './art/';

/** 주머니(명당 타일 뒷면) */
export const SPOT_BACK_URL = `${base}spot-back.svg`;
/** 소문 카드 뒷면 */
export const GOAL_BACK_URL = `${base}goal-back.svg`;
/** 옛 이름(카드 더미 뒷면). 새 코드는 SPOT_BACK_URL 을 쓴다 */
export const PLANT_BACK_URL = SPOT_BACK_URL;

/** 명당 타일 앞면(육각). 작은 카드·확대 모달 모두 이 그림 하나를 쓴다 */
export function spotTileUrl(species: SpeciesId): string {
  return `${base}spot-${species}.svg`;
}

/** 옛 이름. 새 코드는 spotTileUrl 을 쓴다 */
export const plantCardUrl = spotTileUrl;


/** 소문 카드 앞면(세로 630×880) */
export function goalCardUrl(goal: GoalId): string {
  return `${base}goal-${goal}.svg`;
}

/** 명당 타일 그림 비율(가로/세로). 꼭짓점이 위인 육각형이라 그림 틀은 정사각형이다 */
export const SPOT_ASPECT = '1 / 1';
/** 소문 카드 비율(세로형) */
export const GOAL_ASPECT = '630 / 880';

/** 골목 일과 타일 앞면(가로 630×440, v7). id 는 data/chores.ts 의 ChoreId */
export function choreArtUrl(chore: ChoreId): string {
  return `${base}chore-${chore}.svg`;
}

/** 골목 일과 타일 뒷면 */
export const CHORE_BACK_URL = `${base}chore-back.svg`;

/** 일과 타일 비율(가로형) */
export const CHORE_ASPECT = '630 / 440';
