import { describe, expect, it } from 'vitest';
import { cards } from '@server/engine/cards';
import { startFriday, submitLineup } from '@server/engine/friday';
import { eligiblePlayers, gameAtMonday, seededRng } from '@server/engine/test-utils';
import { autoPlace, previewField, validatePlacements } from './lineup';

// 클라이언트의 자동 배치가 서버 검증을 통과하는 라인업을 만드는지 확인
describe('lineup helpers', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('시드 %i: autoPlace 결과를 서버가 받아들인다', (seed) => {
    let s = gameAtMonday(undefined, seed);
    startFriday(s);
    for (const id of s.seats) {
      const p = s.players[id]!;
      p.resources = { money: 5, fandom: 2, ops: 2, stamina: 10 };
      p.pending = [];
      const players = eligiblePlayers(p);
      const tacticCardId = p.tacticCards[0]!;
      const formation = cards.tactic(tacticCardId).formations[0]!;
      const field = previewField(p.uniforms, players);
      const placements = autoPlace(field, p.roster, players, formation);
      expect(validatePlacements(field, p.roster, players, formation, placements)).toEqual([]);
      s = submitLineup(s, id, { tacticCardId, formationIndex: 0, players, placements, fandomInStands: 1 }, seededRng(seed));
    }
    expect(s.phase.kind).toBe('friday.aftermath');
  });

  it('배치 오류를 사람이 읽을 수 있게 보고한다', () => {
    const s = gameAtMonday(undefined, 3);
    const p = s.players['a']!;
    const players = eligiblePlayers(p);
    const formation = { defenders: 4, midfielders: 4, forwards: 2 };
    const field = previewField(p.uniforms, players);
    const placements = autoPlace(field, p.roster, players, formation);
    delete placements[field[0]!.id];
    const issues = validatePlacements(field, p.roster, players, formation, placements);
    expect(issues.some((i) => i.includes('미배치'))).toBe(true);
  });
});
