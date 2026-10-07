/**
 * 식물 카드 일러스트 (2026-10-07: 사용자가 나중에 직접 넣는다. 지금은 비어 있다).
 * 파일은 `client/public/cards/` 에 두고 여기에 `종 id: '파일명'` 을 추가한다(client/public/cards/README.md).
 * 등록되지 않은 종은 카드의 그림 칸을 비워 둔다.
 */
import type { SpeciesId } from '@rootbound/shared';

const CARD_IMAGES: Partial<Record<SpeciesId, string>> = {
  // 예: grass: 'grass.webp',
};

export function cardImageUrl(species: SpeciesId): string | null {
  const file = CARD_IMAGES[species];
  return file ? `${import.meta.env.BASE_URL}cards/${file}` : null;
}
