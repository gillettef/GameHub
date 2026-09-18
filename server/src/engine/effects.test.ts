import { describe, expect, it } from 'vitest';
import { PLAYER_CARDS } from '../data';
import { addToRoster, applyEffects, moveTrack, resolvePending } from './effects';
import { createRng } from './rng';
import type { Rng } from './rng';
import { createGame } from './setup';
import type { GameState } from './state';
import { GameError, emptyMods } from './state';

function game(): GameState {
  return createGame({ id: 'g', division: 3, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, createRng(1));
}
const rng: Rng = createRng(9);

describe('moveTrack (p.7)', () => {
  it('1~5 안에서 이동, 5 초과분은 보드에 표시된 자원으로, 1 미만은 표시된 자원 손실', () => {
    const s = game();
    const p = s.players['a']!;
    moveTrack(p, 'money', 2);
    expect(p.tracks.money).toBe(4);
    moveTrack(p, 'money', 3);
    expect(p.tracks.money).toBe(5);
    expect(p.resources.ops).toBe(2); // 돈 트랙 초과 → 운영
    p.resources.money = 1;
    moveTrack(p, 'fandom', -3);
    expect(p.tracks.fandom).toBe(1);
    expect(p.resources.money).toBe(0); // 팬덤 트랙 부족 → 돈 손실 (0 미만 불가)
  });
});

describe('applyEffects', () => {
  it('자원/승점/전술 카드/무료 유망주', () => {
    const s = game();
    const p = s.players['a']!;
    const tacticsBefore = s.decks.tactics.length;
    applyEffects(s, 'a', [
      { type: 'gainResource', resource: 'money', amount: 3 },
      { type: 'gainResource', resource: 'money', amount: -5 },
      { type: 'gainVP', amount: 2 },
      { type: 'drawTactic', count: 1 },
      { type: 'recruitProspectFree' },
    ], 'test');
    expect(p.resources.money).toBe(0);
    expect(p.vp).toBe(2);
    expect(p.tacticCards).toHaveLength(2);
    expect(s.decks.tactics).toHaveLength(tacticsBefore - 1);
    expect(p.roster).toHaveLength(3);
  });

  it('대상이 여럿이면 pending, resolvePending 으로 적용', () => {
    const s = game();
    const p = s.players['a']!;
    applyEffects(s, 'a', [{ type: 'trainPlayer', count: 1 }], 'coach');
    expect(p.pending).toHaveLength(1);
    const pending = p.pending[0]!;
    expect(pending.candidates).toHaveLength(2);
    expect(() => resolvePending(s, 'a', pending.id, 'nope', rng)).toThrow(GameError);
    resolvePending(s, 'a', pending.id, pending.candidates[0]!, rng);
    expect(p.pending).toHaveLength(0);
    expect(p.roster.find((r) => r.instanceId === pending.candidates[0])!.trained).toBe(true);
  });

  it('대상이 하나면 자동 적용, 없으면 무시', () => {
    const s = game();
    const p = s.players['a']!;
    p.roster[0]!.trained = true;
    applyEffects(s, 'a', [{ type: 'trainPlayer', count: 1 }], 'coach');
    expect(p.pending).toHaveLength(0);
    expect(p.roster.every((r) => r.trained)).toBe(true);
    applyEffects(s, 'a', [{ type: 'removePlayerToken', token: 'injury', count: 1 }], 'doc');
    expect(p.pending).toHaveLength(0);
  });

  it('spread 토큰 효과는 1개씩 대상을 골라 나눠 적용하고, 남은 대기 효과의 후보는 다시 계산한다', () => {
    const s = game();
    const p = s.players['a']!;
    addToRoster(p, s.decks.starters[0]!);
    const [x, y, z] = p.roster;
    x!.tokens.weaknessTemp = 1;
    y!.tokens.weaknessTemp = 2;
    // "[약점]을 3개까지 버립니다": 후보(x, y)가 둘이라 3번 모두 대기
    applyEffects(s, 'a', [{ type: 'removePlayerToken', token: 'weaknessTemp', count: 3, spread: true }], 'sponsor');
    expect(p.pending).toHaveLength(3);
    expect(p.pending[0]!.effect).toEqual({ type: 'removePlayerToken', token: 'weaknessTemp', count: 1 });
    expect(p.pending[0]!.candidates).toEqual([x!.instanceId, y!.instanceId]);
    resolvePending(s, 'a', p.pending[0]!.id, x!.instanceId, rng);
    expect(x!.tokens.weaknessTemp).toBe(0);
    // x 는 더 이상 후보가 아니므로 남은 2개는 y 에게 자동 적용된다
    expect(p.pending).toHaveLength(0);
    expect(y!.tokens.weaknessTemp).toBe(0);
    expect(z!.tokens.weaknessTemp).toBe(0);

    // spread 없이 count 2 는 한 카드에 2개
    applyEffects(s, 'a', [{ type: 'addPlayerToken', token: 'weaknessTemp', count: 2 }], 'board');
    expect(p.pending).toHaveLength(1);
    resolvePending(s, 'a', p.pending[0]!.id, z!.instanceId, rng);
    expect(z!.tokens.weaknessTemp).toBe(2);
  });

  it('훈련 2명: 첫 선수를 고르면 남은 대기 효과에서 그 선수가 빠진다', () => {
    const s = game();
    const p = s.players['a']!;
    addToRoster(p, s.decks.starters[0]!);
    applyEffects(s, 'a', [{ type: 'trainPlayer', count: 2 }], 'camp');
    expect(p.pending).toHaveLength(2);
    const first = p.pending[0]!.candidates[0]!;
    resolvePending(s, 'a', p.pending[0]!.id, first, rng);
    expect(p.pending).toHaveLength(1);
    expect(p.pending[0]!.candidates).not.toContain(first);
  });

  it('유망주 훈련 시 번호 토큰으로 갈아탄다 (p.16)', () => {
    const s = game();
    const p = s.players['a']!;
    const prospect = p.roster.find((r) => PLAYER_CARDS.find((c) => c.id === r.cardId)!.kind === 'prospect')!;
    const number = PLAYER_CARDS.find((c) => c.id === prospect.cardId)!.trained.number!;
    applyEffects(s, 'a', [{ type: 'addPlayerToken', token: 'strengthPerm', count: 1 }], 't');
    resolvePending(s, 'a', p.pending[0]!.id, prospect.instanceId, rng);
    expect(prospect.tokens.strengthPerm).toBe(1);
    p.roster.filter((r) => r !== prospect).forEach((r) => (r.trained = true));
    applyEffects(s, 'a', [{ type: 'trainPlayer', count: 1 }], 'coach');
    expect(prospect.trained).toBe(true);
    const token = p.uniforms.find((u) => u.cardInstanceId === prospect.instanceId)!;
    if (number <= 11) expect(token.number).toBe(number);
  });

  it('peekOpponent 는 본인만 다음 상대 카드 앞면을 보게 표시하고, 그 카드로 경기하면 풀린다', () => {
    const s = game();
    const p = s.players['a']!;
    expect(p.scouted).toBe(false);
    applyEffects(s, 'a', [{ type: 'peekOpponent' }], '분석가');
    expect(p.scouted).toBe(true);
    expect(s.log[s.log.length - 1]!.text).toContain('확인');
    p.opponentDeck = [];
    p.scouted = false;
    applyEffects(s, 'a', [{ type: 'peekOpponent' }], '분석가');
    expect(p.scouted).toBe(false);
  });

  it('요일 제한·유니폼 계약 파기·상시 효과·유지비 할인', () => {
    const s = game();
    const p = s.players['a']!;
    applyEffects(s, 'a', [{ type: 'restrictDay', day: 'thu', week: 'next', mode: 'cardActionOnly' }], '이사회');
    expect(p.restrictions).toEqual([{ week: s.week + 1, day: 'thu', mode: 'cardActionOnly' }]);

    // 유니폼 스폰서가 없으면 otherwise
    applyEffects(s, 'a', [{ type: 'breakNamingSponsor', otherwise: [{ type: 'gainResource', resource: 'money', amount: 2 }] }], '이사회');
    expect(p.resources.money).toBe(2);
    // 있으면 카드를 버리고 장내 방송 효과(sp-25: 돈 +3)로 보상, 그 카드의 상시 효과도 사라진다
    p.sponsors.naming = 'sp-25';
    p.passives.push({ passive: 'fandomOnWin', source: '왕관 호텔' });
    applyEffects(s, 'a', [{ type: 'breakNamingSponsor', otherwise: [] }], '이사회');
    expect(p.sponsors.naming).toBeUndefined();
    expect(s.decks.discards.sponsors).toContain('sp-25');
    expect(p.resources.money).toBe(5);
    expect(p.passives).toEqual([]);

    applyEffects(s, 'a', [{ type: 'passive', passive: 'extraStand' }, { type: 'upkeepDiscount', amount: 2 }], '스폰서');
    expect(p.passives).toEqual([{ passive: 'extraStand', source: '스폰서' }]);
    expect(p.upkeepDiscount).toBe(2);
  });

  it('직원 출장정지·시장 카드 버리기·방출은 각각 직원·시장·선수를 대상으로 고른다', () => {
    const s = game();
    const p = s.players['a']!;
    p.staff.push({ cardId: 'st-02', exhausted: false, suspension: 0 });
    applyEffects(s, 'a', [{ type: 'addStaffSuspension', count: 1 }], '이사회', {}, rng);
    expect(p.pending[0]!.target).toBe('staff');
    expect(p.pending[0]!.candidates).toEqual(['0', '1']);
    resolvePending(s, 'a', p.pending[0]!.id, '1', rng);
    expect(p.staff[1]!.suspension).toBe(1);

    const before = [...s.market.players];
    applyEffects(s, 'a', [{ type: 'discardMarketCard', row: 'players' }], '분석가', {}, rng);
    expect(p.pending[0]!.target).toBe('market');
    expect(p.pending[0]!.row).toBe('players');
    resolvePending(s, 'a', p.pending[0]!.id, '4', rng);
    expect(s.decks.discards.players).toContain(before[4]);
    expect(s.market.players).toHaveLength(5);
    expect(s.market.players.slice(1)).toEqual(before.slice(0, 4)); // 오른쪽으로 밀고 왼쪽 보충

    const money = p.resources.money;
    const target = p.roster[0]!;
    applyEffects(s, 'a', [{ type: 'releasePlayer' }], '이사회', {}, rng);
    expect(p.pending[0]!.target).toBe('player');
    resolvePending(s, 'a', p.pending[0]!.id, target.instanceId, rng);
    expect(p.roster).not.toContain(target);
    expect(p.resources.money).toBeGreaterThan(money);
  });

  it('경기 효과는 경기 맥락(mods) 없이 쓰면 기록만 남기고, 조건부는 경기 전에 미뤄진다', () => {
    const s = game();
    const p = s.players['a']!;
    applyEffects(s, 'a', [{ type: 'denyGoals', count: 1 }, { type: 'conditional', condition: { kind: 'cleanSheet' }, effects: [{ type: 'gainVP', amount: 1 }] }], '카드');
    expect(p.vp).toBe(0);
    expect(s.log.filter((l) => l.text.includes('경기 중에만'))).toHaveLength(2);

    const mods = emptyMods();
    const pre = { stage: 'pre' as const, myGoals: 0, theirGoals: 0, sectorGoals: {}, placements: {}, opponentTeamId: 't01' };
    applyEffects(s, 'a', [{ type: 'denyGoals', count: 1 }, { type: 'extraSaves', count: 1 }, { type: 'sectorSkill', sector: 'CM', delta: 1 }, { type: 'scoreGoal', team: 'self', amount: 1 }, { type: 'conditional', condition: { kind: 'cleanSheet' }, effects: [{ type: 'gainVP', amount: 1 }] }], '전술', { mods, match: pre });
    expect(mods).toMatchObject({ mine: 1, denyGoals: 1, extraSaves: 1, sectorSkill: { CM: 1 } });
    expect(mods.deferred).toHaveLength(1);
    // 경기 후 판정: 실점 0 → 승점
    const post = { ...pre, stage: 'post' as const, myGoals: 2, theirGoals: 0 };
    applyEffects(s, 'a', [mods.deferred[0]!.effect], '전술', { mods, match: post });
    expect(p.vp).toBe(1);
  });

  it('text 효과는 로그에만 남긴다', () => {
    const s = game();
    applyEffects(s, 'a', [{ type: 'text', text: '수동' }], 'x');
    expect(s.log.at(-1)?.text).toContain('수동');
    expect(s.log.at(-1)?.actor).toBe('a');
  });

  it('addToRoster 는 유니폼을 배정한다', () => {
    const s = game();
    const p = s.players['a']!;
    const inst = addToRoster(p, s.decks.starters[0]!);
    const card = PLAYER_CARDS.find((c) => c.id === inst.cardId)!;
    const token = p.uniforms.find((u) => u.cardInstanceId === inst.instanceId);
    if (card.untrained.goalkeeper) expect(token).toBeUndefined();
    else expect(token?.face).toBe(card.untrained.role);
  });
});
