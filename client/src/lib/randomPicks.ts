/**
 * 설정 화면 전용 "랜덤" 버튼이 쓰는 무작위 선택. 게임 상태의 결정성 RNG(shared/src/engine/rng.ts)와는
 * 무관하다 — 여긴 그냥 사람이 고르는 걸 대신해 주는 UI 편의 기능이라 Math.random 을 그대로 쓴다.
 */
import type { DeckChoice, MapDef, MapId, RaceId } from '@astraltab/shared';
import { RACES, specialCardsOf } from '@astraltab/shared';

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

export function randomMapId(candidates: MapDef[]): MapId {
  return pickOne(candidates).id;
}

export function randomRaceId(): RaceId {
  return pickOne(RACES).id;
}

/** 종족까지 무작위로 고르고, 그 종족의 특수 카드도 종류별로 1장씩 무작위로 채운다 */
export function randomDeckChoice(): DeckChoice {
  const race = randomRaceId();
  return {
    race,
    buildingId: pickOne(specialCardsOf(race, 'building')).id,
    unitId: pickOne(specialCardsOf(race, 'unit')).id,
    magicId: pickOne(specialCardsOf(race, 'magic')).id,
  };
}
