import { describe, expect, it } from 'vitest';
import { ALL_SPECS } from '@astraltab/shared';
import { CARD_GLYPH } from './cardArt';

describe('cardArt', () => {
  it('모든 카드(코어 포함)에 모티프가 매핑돼 있다', () => {
    for (const spec of ALL_SPECS) {
      expect(CARD_GLYPH[spec.id], `${spec.id} 에 카드 이미지 모티프가 없습니다`).toBeDefined();
    }
  });

  it('CARD_GLYPH 에 실재하지 않는 카드 id가 남아 있지 않다', () => {
    const knownIds = new Set(ALL_SPECS.map((s) => s.id));
    for (const id of Object.keys(CARD_GLYPH)) {
      expect(knownIds.has(id as never), `${id} 은 더 이상 존재하지 않는 카드입니다`).toBe(true);
    }
  });
});
