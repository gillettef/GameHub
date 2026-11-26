/// <reference types="node" />
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHORE_IDS, GOALS, SPECIES_IDS } from '../../engine';
import { CHORE_BACK_URL, GOAL_BACK_URL, SPOT_BACK_URL, choreArtUrl, goalCardUrl, spotTileUrl } from './cardImages';

const publicDir = fileURLToPath(new URL('../../../public/', import.meta.url));

describe('냥냥 골목 그림 파일 (public/art)', () => {
  it('명당 타일 9종·소문 카드 16장의 앞면과 두 뒷면이 모두 있다', () => {
    const urls = [...SPECIES_IDS.map(spotTileUrl), ...GOALS.map((g) => goalCardUrl(g.id)), SPOT_BACK_URL, GOAL_BACK_URL];
    expect(urls.every((u) => u.startsWith('./art/'))).toBe(true);
    expect(urls.filter((u) => !existsSync(publicDir + u.slice(2)))).toEqual([]);
  });

  it('골목 일과 6장의 앞면과 뒷면이 모두 있다 (v7)', () => {
    const urls = [...CHORE_IDS.map(choreArtUrl), CHORE_BACK_URL];
    expect(urls.every((u) => u.startsWith('./art/'))).toBe(true);
    expect(urls.filter((u) => !existsSync(publicDir + u.slice(2)))).toEqual([]);
  });
});
