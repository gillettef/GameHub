import { describe, expect, it } from 'vitest';
import { cards } from '@server/engine/cards';
import { startFriday, submitLineup } from '@server/engine/friday';
import { autoPlace, buildLineup, eligiblePlayers, previewField, validatePlacements } from '@server/engine/lineup';
import { gameAtMonday, seededRng, settlePending, skipTacticEffects } from '@server/engine/test-utils';

// 경기 준비 화면이 쓰는 헬퍼가 서버 검증을 통과하는 라인업을 만드는지 확인 (클라이언트 alias 경로로 실행)
describe('lineup helpers', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('시드 %i: buildLineup 결과를 서버가 받아들인다', (seed) => {
    let s = gameAtMonday(undefined, seed);
    startFriday(s);
    for (const id of s.seats) {
      const p = s.players[id]!;
      p.resources = { money: 5, fandom: 2, ops: 2, stamina: 10 };
      p.pending = [];
      const tacticCardId = p.tacticCards[0]!;
      const lineup = buildLineup(p, tacticCardId, cards.tactic(tacticCardId).formations[0]!, eligiblePlayers(p));
      expect(lineup).not.toBeNull();
      s = settlePending(submitLineup(s, id, { ...lineup!, fandomInStands: 1 }, seededRng(seed)), seededRng(seed));
    }
    expect(s.phase.kind).toBe('friday.match');
    expect(skipTacticEffects(s, seededRng(seed)).phase.kind).toBe('friday.aftermath');
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
