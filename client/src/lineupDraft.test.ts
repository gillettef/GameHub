import { afterEach, describe, expect, it, vi } from 'vitest';
import { cards } from '@server/engine/cards';
import { standsCount, startFriday, submitLineup } from '@server/engine/friday';
import { previewField, validatePlacements } from '@server/engine/lineup';
import { gameAtMonday, seededRng } from '@server/engine/test-utils';
import { viewFor } from '@server/engine/view';
import { initialDraft, saveDraft } from './lineupDraft';

// 경기 준비 초안: 첫 주 기본값과 "지난주 라인업을 기본값으로"가 서버가 받아들이는 라인업을 만드는지 확인
function memoryStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
}

function fridayState(seed: number) {
  const s = gameAtMonday(undefined, seed);
  startFriday(s);
  const p = s.players['a']!;
  p.resources = { money: 5, fandom: 3, ops: 2, stamina: 10 };
  p.pending = [];
  return s;
}

describe('lineup draft', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('저장된 초안이 없으면 체력이 닿는 출전 선수·자동 배치·관중석 최대치로 시작하고 서버가 받아들인다', () => {
    const s = fridayState(2);
    const view = viewFor(s, 'a');
    const me = view.players['a']!;
    const d = initialDraft('g:a', s.week, me, view.self.tacticCards);
    expect(d.played.length).toBeGreaterThan(0);
    expect(d.stands).toBe(Math.min(standsCount(me), 3));
    expect(d.step).toBe(0);
    const next = submitLineup(s, 'a', { tacticCardId: d.tacticCardId, formationIndex: d.formationIndex, players: d.played, placements: d.placements, fandomInStands: d.stands }, seededRng(2));
    expect(next.phase.kind === 'friday.prepare' && next.phase.submitted['a']).toBeTruthy();
  });

  it('지난주 초안을 기본값으로 쓰되 부상 선수·없어진 전술 카드는 걸러 내고 배치를 다시 잡는다', () => {
    memoryStorage();
    const s = fridayState(4);
    const view = viewFor(s, 'a');
    const me = view.players['a']!;
    const first = initialDraft('g:a', s.week, me, view.self.tacticCards);
    saveDraft('g:a', s.week, { ...first, tacticCardId: 'tc-없는카드', stands: 0, step: 3 });

    const injured = me.roster.find((r) => first.played.includes(r.instanceId))!;
    injured.tokens.injury = 1;
    const d = initialDraft('g:a', s.week + 1, me, view.self.tacticCards);
    expect(d.tacticCardId).toBe(view.self.tacticCards[0]);
    expect(d.played).toEqual(first.played.filter((id) => id !== injured.instanceId));
    expect(d.step).toBe(0); // 새 주는 첫 스텝부터
    expect(d.stands).toBe(Math.min(standsCount(me), 3)); // 관중석은 매주 최대치로 다시
    const formation = cards.tactic(d.tacticCardId).formations[d.formationIndex]!;
    expect(validatePlacements(previewField(me.uniforms, d.played), me.roster, d.played, formation, d.placements)).toEqual([]);
  });

  it('같은 주의 초안(새로고침)은 스텝과 관중석까지 그대로 되살리고, 다른 판의 초안은 버린다', () => {
    memoryStorage();
    const s = fridayState(5);
    const view = viewFor(s, 'a');
    const me = view.players['a']!;
    const first = initialDraft('g:a', s.week, me, view.self.tacticCards);
    saveDraft('g:a', s.week, { ...first, stands: 1, step: 2 });
    expect(initialDraft('g:a', s.week, me, view.self.tacticCards)).toMatchObject({ stands: 1, step: 2, played: first.played });
    expect(initialDraft('other:a', s.week, me, view.self.tacticCards).step).toBe(0);
  });
});
