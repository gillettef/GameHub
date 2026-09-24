/**
 * 설정 화면 전용 "랜덤" 버튼이 쓰는 무작위 선택. 게임 상태의 결정성 RNG(shared/src/engine/rng.ts)와는
 * 무관하다 — 여긴 그냥 사람이 고르는 걸 대신해 주는 UI 편의 기능이라 Math.random 을 그대로 쓴다.
 */
import type { MapDef, MapId, RaceId } from '@astraltab/shared';
import { RACES } from '@astraltab/shared';

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

/** 0..n-1 의 무작위 순열 (Fisher-Yates). 핫시트 턴 순서(좌석) 무작위 배정에 쓴다(2026-09-23 사용자 지시) */
export function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as number, arr[i] as number];
  }
  return arr;
}

export function randomMapId(candidates: MapDef[]): MapId {
  return pickOne(candidates).id;
}

export function randomRaceId(): RaceId {
  return pickOne(RACES).id;
}
