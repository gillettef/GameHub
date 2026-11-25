/**
 * 옛 엔진과 같은지: 옮기기 전 엔진(사람 0번 + AI, 사람 차례마다 시드 정책으로 고른 행동, 거절되는 행동 포함)으로
 * 여러 시드·인원의 판을 끝까지 두며 행동마다 상태 해시를 남긴 기록(fixtures/legacy-games.json)을 새 엔진으로 다시 둔다.
 * 해시는 옛 상태에 있던 필드만 본다(새로 생긴 opStep·ready 는 제외). 생성 스크립트는 저장소 밖에 있다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dispatch, newGame, type Action } from '../src/engine/engine';
import type { GameState } from '../src/engine/types';

interface Fixture {
  games: { seed: number; ai: number; profiles?: string[]; start: string; steps: { a: Action; h: string }[]; final: number[] }[];
  sims: { seed: number; n: number; profiles: string[]; h: string }[];
}
const fx = JSON.parse(readFileSync(new URL('./fixtures/legacy-games.json', import.meta.url), 'utf8')) as Fixture;

function hash(str: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** 옛 상태와 새 상태에 모두 있는 필드만, 정해진 순서로 (생성 스크립트와 같다) */
function project(s: GameState) {
  return {
    round: s.round, maxRounds: s.maxRounds, phase: s.phase, step: s.step, first: s.first, startFirst: s.startFirst, turn: s.turn,
    passed: s.passed, market: s.market, facilityDeck: s.facilityDeck, groupDeck: s.groupDeck, groupRow: s.groupRow,
    pickOrder: s.pickOrder, pickTurn: s.pickTurn, pickDone: s.pickDone, eventDeck: s.eventDeck,
    event: s.event?.id ?? null, nextEvent: s.nextEvent?.id ?? null, rng: s.rng, log: s.log, notice: s.notice,
    players: s.players.map((p) => ({
      id: p.id, name: p.name, isAI: p.isAI, ai: p.ai ?? null, money: p.money, vp: p.vp, endBonus: p.endBonus ?? null,
      facilities: p.facilities, staff: p.staff, trash: p.trash, built: p.built, hired: p.hired, bid: p.bid, fee: p.fee,
      groups: p.groups, place: p.place, report: p.report,
    })),
  };
}
const H = (s: GameState) => hash(JSON.stringify(project(s)));

describe('옛 엔진과 같은 진행', () => {
  it('기록이 충분하다', () => {
    expect(fx.games.length).toBeGreaterThanOrEqual(20);
    expect(fx.games.reduce((n, g) => n + g.steps.length, 0)).toBeGreaterThan(2000);
  });

  for (const g of fx.games) {
    it(`사람 1 + AI ${g.ai} · 시드 ${g.seed}${g.profiles ? ` · ${g.profiles.join(',')}` : ''}`, () => {
      const opts = { aiCount: g.ai, seed: g.seed, ...(g.profiles ? { profiles: g.profiles } : {}) };
      let s = newGame(opts);
      expect(H(s)).toBe(g.start);
      g.steps.forEach((st, i) => {
        s = dispatch(s, st.a);
        if (H(s) !== st.h) throw new Error(`${i}번째 행동 ${JSON.stringify(st.a)} 뒤 상태가 다르다 (${s.phase}/${s.step}, 알림 ${s.notice})`);
      });
      expect(s.phase).toBe('gameOver');
      expect(s.players.map((p) => p.vp)).toEqual(g.final);
    });
  }

  it('사람 없는 판(밸런스 시뮬레이션)의 끝 상태', () => {
    for (const m of fx.sims) expect(H(newGame({ humans: 0, aiCount: m.n, seed: m.seed, profiles: m.profiles }))).toBe(m.h);
  });

  it('seats 로 만든 같은 구성은 옛 방식과 같다', () => {
    const a = newGame({ aiCount: 3, seed: 5 });
    const b = newGame({ seed: 5, seats: [{ ai: false }, { ai: true }, { ai: true }, { ai: true }] });
    expect(H(b)).toBe(H(a));
  });
});
