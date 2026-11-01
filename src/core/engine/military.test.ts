// 습격·분쟁 카드(Rules 10·11절) 단위 테스트
import { describe, expect, it } from 'vitest';
import { createGame } from './setup';
import { applyAction } from './turn';
import { cardTakeBlock } from './quest';
import { commandMax } from './derive';
import { CARD_DEFS, ringDeckIds } from '../data/cards';
import { QUEST_DEFS } from '../data/quests';
import { RAID_DEFENSE } from '../data/constants';
import type { Action, GameState } from '../types';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true }));

/** 2라운드 대외 단계(첫 라운드 지휘 제한 없음) */
function ready(n = 2): GameState {
  const s = createGame(1, seats(n));
  s.round = 2;
  s.phase = 'external';
  for (const p of s.players) p.units.guard = [0, 0, 0, 0];
  return s;
}

function act(s: GameState, a: Action, actor = s.current): GameState {
  const r = applyAction(s, actor, a);
  if (r.error) throw new Error(r.error);
  return r.state;
}

describe('습격 카드', () => {
  it('판정에 져도 카드를 버리고 방위 행동을 쓴다', () => {
    let s = ready();
    const me = s.current;
    const t = 1 - me;
    s.players[t].units.guard = [0, 0, 0, 3];
    s.players[me].hand = [{ id: 'r1a', fresh: false }];
    s = act(s, { type: 'raid', card: 0, target: t, effect: 'lootFood' });
    expect(s.players[me].hand).toEqual([]);
    expect(s.players[me].defenseUsed).toBe(RAID_DEFENSE);
    expect(s.log.at(-1)?.text).toContain('습격 실패');
  });

  it('검증 오류면 손패와 입력 상태가 그대로다', () => {
    const s = ready();
    const me = s.current;
    s.players[me].hand = [{ id: 'r1a', fresh: false }];
    s.players[me].defenseUsed = 1; // 방위 행동 부족
    const r = applyAction(s, me, { type: 'raid', card: 0, target: 1 - me, effect: 'lootFood' });
    expect(r.error).toBe('방위 행동이 부족합니다');
    expect(r.state).toBe(s);
    expect(s.players[me].hand).toHaveLength(1);
  });

  it('무리 몰이는 카드 보정을 쓰지 않고 카드 효과와 무관하다', () => {
    let s = ready();
    const me = s.current;
    const t = 1 - me;
    s.players[me].doctrine.symbiont = 8; // 단계 2
    s.players[me].hand = [{ id: 'r1b', fresh: false }]; // 과학 탈취 전용
    s.players[t].buildings.farm = [0, 1, 0, 0];
    s = act(s, { type: 'raid', card: 0, target: t, effect: 'lootFood', swarm: true });
    expect(s.log.at(-1)?.text).toContain('무리 몰이');
    expect(s.players[me].hand).toEqual([]);
  });

  it('납치는 방주 단계 2면 어떤 습격 카드로든 고를 수 있다', () => {
    let s = ready();
    const me = s.current;
    const t = 1 - me;
    s.players[me].doctrine.ark = 8;
    s.players[me].hand = [{ id: 'r1b', fresh: false }];
    s.players[me].units.guard = [0, 0, 0, 2];
    s.players[t].idle = 1;
    const pool = s.players[me].pool;
    s = act(s, { type: 'raid', card: 0, target: t, effect: 'abduct' });
    expect(s.players[t].idle).toBe(0);
    expect(s.players[me].pool).toBe(pool + 1);
  });

  it('자원 팟 사용 행동으로 습격 카드를 쓸 수 없다', () => {
    const s = ready();
    s.phase = 'actions';
    s.players[s.current].hand = [{ id: 'r1a', fresh: false }];
    expect(applyAction(s, s.current, { type: 'useSupply', index: 0 }).error).toBe('자원 팟 카드가 아닙니다');
  });
});

describe('분쟁 카드', () => {
  it('판정 때 카드의 공격 보정을 더한다', () => {
    let s = ready();
    const me = s.current;
    const t = 1 - me;
    s.era = 3;
    s.players[me].charters.defense = 2; // 방위 행동 +1 → 3
    s.players[me].hand = [{ id: 'c3a', fresh: false }]; // 문화, 공격 +2
    s.players[t].res.culture = 10;
    s = act(s, { type: 'declareConflict', card: 0, target: t });
    expect(s.players[me].conflict).toMatchObject({ loss: 'culture', atk: 2 });
    s = act(s, { type: 'endTurn' });
    s.questRow[0] = 's1f';
    s = act(s, { type: 'pickQuest', slot: 0 }, t);
    s = act(s, { type: 'endTurn' }, t);
    s.players[t].guard = 0; // 방위 태세 보너스 제외
    s.questRow[0] = 's1p';
    s = act(s, { type: 'pickQuest', slot: 0 }, me);
    // 방위력 0 대 0, 카드 +2 → d = 2 → 문화 4 잃음
    expect(s.players[t].res.culture).toBe(10 - 4);
  });
});

describe('손패와 덱', () => {
  it('습격·분쟁 카드도 자원 팟과 같은 손 한도에 센다', () => {
    const s = ready();
    const p = s.players[s.current];
    p.hand = Array.from({ length: commandMax(s, p) }, () => ({ id: 'r1a', fresh: false }));
    expect(cardTakeBlock(s, p, CARD_DEFS.s1f)).toBe('손패가 가득 찼습니다');
    expect(cardTakeBlock(s, p, CARD_DEFS.c2a)).toBe('손패가 가득 찼습니다');
    p.hand.pop();
    expect(cardTakeBlock(s, p, CARD_DEFS.r1b)).toBeNull();
  });

  it('시대 덱은 38·46·46장이고 분쟁 카드는 2고리부터', () => {
    const events = (ring: number) => Object.values(QUEST_DEFS).filter((q) => 'era' in q && q.era === ring).length;
    expect([1, 2, 3].map((r) => ringDeckIds(r as 1 | 2 | 3).length + events(r))).toEqual([38, 46, 46]);
    expect(ringDeckIds(1).some((id) => CARD_DEFS[id].type === 'conflict')).toBe(false);
    expect([1, 2, 3].map((r) => ringDeckIds(r as 1 | 2 | 3).filter((id) => CARD_DEFS[id].type === 'raid').length)).toEqual([4, 4, 4]);
  });
});

describe('손패 비공개', () => {
  it('다른 사람의 손패는 장수만 보이고 본인 손패는 보인다', async () => {
    const { maskFor, HIDDEN } = await import('../mask');
    const s = ready(3);
    s.players[1].hand = [{ id: 'r1a', fresh: true }, { id: 's1f', fresh: false }];
    expect(maskFor(s, 1).players[1].hand.map((h) => h.id)).toEqual(['r1a', 's1f']);
    expect(maskFor(s, 0).players[1].hand).toEqual([{ id: HIDDEN, fresh: true }, { id: HIDDEN, fresh: false }]);
    expect(maskFor(s, null).players[1].hand.every((h) => h.id === HIDDEN)).toBe(true);
  });

  it('뒷면 칸에서 손패로 가져간 카드는 다른 사람 기록에 이름이 안 나온다', async () => {
    const { maskFor } = await import('../mask');
    let s = createGame(1, seats(2));
    s.round = 2;
    const me = s.current;
    s.questRow[2] = 'r1c';
    s = act(s, { type: 'pickQuest', slot: 2 });
    expect(s.players[me].hand.map((h) => h.id)).toEqual(['r1c']);
    const mine = maskFor(s, me).log.map((e) => e.text).join('\n');
    const theirs = maskFor(s, 1 - me).log.map((e) => e.text).join('\n');
    expect(mine).toContain('전지 약탈');
    expect(theirs).not.toContain('전지 약탈');
    expect(theirs).toContain('비공개');
    expect(maskFor(s, 1 - me).log.every((e) => e.pub === undefined)).toBe(true);
  });

  it('칸 1(앞면)에서 가져간 카드는 모두에게 공개된다', async () => {
    const { maskFor } = await import('../mask');
    let s = createGame(1, seats(2));
    s.round = 2;
    const me = s.current;
    s.questRow[0] = 'r1c';
    s = act(s, { type: 'pickQuest', slot: 0 });
    expect(maskFor(s, 1 - me).log.map((e) => e.text).join('\n')).toContain('전지 약탈');
  });
});
