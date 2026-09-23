/**
 * 설정 화면 전용 "랜덤" 버튼이 쓰는 무작위 선택. 게임 상태의 결정성 RNG(shared/src/engine/rng.ts)와는
 * 무관하다 — 여긴 그냥 사람이 고르는 걸 대신해 주는 UI 편의 기능이라 Math.random 을 그대로 쓴다.
 */
import type { CardId, DeckChoice, MapDef, MapId, RaceId } from '@astraltab/shared';
import { DECK_SIZE, RACES, cardPoolOf } from '@astraltab/shared';

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

/** items 를 무작위 순서로 섞은 새 배열 (Fisher-Yates) */
function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * 종족의 카드 풀(기본·특수 구분 없이)에서 무작위로 DECK_SIZE 장을 채운다. 카드마다 상한(copies)을
 * 넘지 않도록, 카드 순서를 섞고 한 바퀴씩 돌며 1장씩 더해 여러 카드에 고루 퍼지게 한다.
 */
export function randomCardCounts(race: RaceId): Record<CardId, number> {
  const pool = shuffled(cardPoolOf(race));
  const counts: Record<CardId, number> = {};
  let remaining = DECK_SIZE;
  while (remaining > 0) {
    let progressed = false;
    for (const spec of pool) {
      if (remaining <= 0) break;
      const current = counts[spec.id] ?? 0;
      if (current >= spec.copies) continue;
      counts[spec.id] = current + 1;
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break; // 이론상 풀 전체 상한 합이 DECK_SIZE 보다 크므로 여기 도달하지 않는다
  }
  return counts;
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

/** 종족까지 무작위로 고르고, 그 종족의 카드로 덱 전체(DECK_SIZE 장)를 무작위로 채운다 */
export function randomDeckChoice(): DeckChoice {
  const race = randomRaceId();
  return { race, cards: randomCardCounts(race) };
}
