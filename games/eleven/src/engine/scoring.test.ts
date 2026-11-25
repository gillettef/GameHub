import { describe, expect, it } from 'vitest';
import { leagueRankPoints } from './scoring';

describe('leagueRankPoints (p.26)', () => {
  it('matches the rulebook table', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(leagueRankPoints)).toEqual([15, 10, 8, 6, 4, 2, 0, -2]);
  });

  it('gives -4 for rank 9 and below', () => {
    expect(leagueRankPoints(9)).toBe(-4);
    expect(leagueRankPoints(18)).toBe(-4);
  });

  it('rejects invalid ranks', () => {
    expect(() => leagueRankPoints(0)).toThrow(RangeError);
  });
});
