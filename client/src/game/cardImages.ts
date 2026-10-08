/**
 * 카드 디자인 (2026-10-08 사용자가 넣음). 파일은 `client/public/cards/` 에 있다(client/public/cards/README.md).
 *  - 식물 카드 앞면: `plants/<종 id>.svg` (630×880 세로), 뒷면 `plants/back.svg`
 *  - 작은 카드 배경: `plants/art/<종 id>.webp` (앞면의 그림 부분만 자른 썸네일, scripts/card-thumbs.mjs 로 만든다)
 *  - 목표 카드 앞면: `goals/<목표 id>.svg` (880×630 가로), 뒷면 `goals/back.svg`
 * 파일 이름은 Rules.md 의 영문 id 그대로다. 빠진 파일이 없는지는 cardImages.test.ts 가 검사한다.
 */
import type { GoalId, SpeciesId } from '@rootbound/shared';

const base = `${import.meta.env.BASE_URL}cards/`;

export const PLANT_BACK_URL = `${base}plants/back.svg`;
export const GOAL_BACK_URL = `${base}goals/back.svg`;

export function plantCardUrl(species: SpeciesId): string {
  return `${base}plants/${species}.svg`;
}

/** 손패·마켓·카드 탭의 작은 카드 배경. 원본 SVG 는 필터가 무거워 확대 모달에서만 쓴다 */
export function plantArtUrl(species: SpeciesId): string {
  return `${base}plants/art/${species}.webp`;
}

export function goalCardUrl(goal: GoalId): string {
  return `${base}goals/${goal}.svg`;
}
