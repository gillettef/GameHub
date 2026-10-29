/// <reference types="node" />
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GOALS, SPECIES_IDS } from '@rootbound/shared';

const cardsDir = fileURLToPath(new URL('../../public/cards/', import.meta.url));

describe('카드 디자인 파일', () => {
  it('식물 9종·목표 16장의 앞면, 식물 그림 썸네일, 두 뒷면이 모두 있다', () => {
    const files = [
      ...SPECIES_IDS.map((s) => `plants/${s}.svg`),
      ...SPECIES_IDS.map((s) => `plants/art/${s}.webp`),
      ...GOALS.map((g) => `goals/${g.id}.svg`),
      'plants/back.svg',
      'goals/back.svg',
    ];
    expect(files.filter((f) => !existsSync(cardsDir + f))).toEqual([]);
  });
});
