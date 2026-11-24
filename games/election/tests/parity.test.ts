import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateLines, planTurn, chooseSetup, evaluate } from '../src/core/ai';
import { mulberry32 } from '../src/core/rng';
import { applyAction, initialState, legalActions, nextStop, score, winner } from '../src/core/rules';
import type { Action, GameState } from '../src/core/types';
import { loadPrototype, normCore, normProto, toProto, type ProtoState } from './fixtures/prototype';

const P = loadPrototype();

/** 프로토타입 UI가 허용하는 입력(clickHole·skipPlace·clickDrop 조건)을 액션 목록으로 */
function protoLegal(s: ProtoState): string[] {
  const out: string[] = [];
  if (s.ph === 'setup' || s.ph === 'place') {
    s.h.forEach((a, i) => {
      if (a.length < P.CAP[i]) out.push(`${s.ph}:${i}`);
    });
    if (s.ph === 'place' && s.pc >= 1) out.push('endPlace');
  } else if (s.ph === 'pick') {
    s.h.forEach((a, i) => {
      if (a.length) out.push(`pick:${i}`);
    });
  } else if (s.ph === 'sow') {
    for (const c of new Set(s.bus)) out.push(`drop:${c}`);
  }
  return out;
}

const key = (a: Action) =>
  a.type === 'endPlace' ? 'endPlace' : a.type === 'drop' ? `drop:${a.color}` : `${a.type}:${a.hole}`;

/** 프로토타입 UI 흐름과 동일하게 적용 (pick/drop 뒤에는 자동 하차·턴 종료까지) */
function protoApply(s: ProtoState, a: Action): void {
  switch (a.type) {
    case 'setup':
    case 'place':
      P.put(s, a.hole);
      break;
    case 'endPlace':
      s.ph = 'pick';
      break;
    case 'pick':
      P.pick(s, a.hole);
      P.step(s);
      break;
    case 'drop':
      P.drop(s, a.color);
      P.step(s);
      break;
  }
}

/** 랜덤 대국을 양쪽에 똑같이 적용하며 매 수마다 상태를 비교. 지나간 상태들을 돌려준다 */
function playRandomGame(seed: number): GameState[] {
  const rng = mulberry32(seed);
  let core = initialState();
  const proto = P.init();
  const seen: GameState[] = [core];
  for (let ply = 0; ply < 500 && core.phase !== 'over'; ply++) {
    const legal = legalActions(core);
    expect(legal.map(key).sort()).toEqual(protoLegal(proto).sort());
    expect(legal.length).toBeGreaterThan(0);
    const a = legal[Math.floor(rng() * legal.length)];
    core = applyAction(core, a);
    protoApply(proto, a);
    expect(normCore(core)).toEqual(normProto(proto));
    seen.push(core);
  }
  expect(core.phase).toBe('over');
  expect(score(core)).toEqual(P.score(proto));
  expect(winner(core) ?? -1).toBe(P.winner(proto));
  return seen;
}

describe('프로토타입 패리티: 규칙', () => {
  it('랜덤 대국 300판에서 매 수 상태·합법 수·점수·승자가 일치한다', () => {
    for (let seed = 1; seed <= 300; seed++) playRandomGame(seed);
  });

  it('다음 정차지 계산이 일치한다', () => {
    const states = playRandomGame(777);
    for (const s of states) {
      if (s.phase !== 'sow') continue;
      expect(nextStop(s)).toBe(P.nxt(toProto(s)));
    }
  });
});

describe('프로토타입 패리티: AI', () => {
  afterEach(() => vi.restoreAllMocks());

  /** 같은 시드 난수를 양쪽에 공급 */
  function withSeed<T>(seed: number, fn: () => T): T {
    const r = mulberry32(seed);
    vi.spyOn(Math, 'random').mockImplementation(r);
    try {
      return fn();
    } finally {
      vi.restoreAllMocks();
    }
  }

  const sampleStates = (() => {
    const out: GameState[] = [];
    for (let seed = 1000; seed < 1012; seed++) out.push(...playRandomGame(seed));
    return out;
  })();

  /** 프로토타입 AI가 호출되는 시점: 턴 시작(아직 투입 전) */
  const isTurnStart = (s: GameState) => (s.phase === 'place' || s.phase === 'pick') && s.placedThisTurn === 0;

  it('평가 함수가 일치한다', () => {
    for (const s of sampleStates) {
      for (const m of [0, 1] as const) expect(evaluate(s, m)).toBe(P.ev(toProto(s), m));
    }
  });

  it('수 생성(전체·빠른)이 순서까지 일치한다', () => {
    const turnStarts = sampleStates.filter(isTurnStart).slice(0, 60);
    for (const s of turnStarts) {
      for (const fast of [false, true]) {
        const mine = generateLines(s, fast).map((l) => ({ pl: l.placements, i: l.pick, o: l.drops as number[], res: normCore(l.result) }));
        const theirs = P.moves(toProto(s), fast).map((m) => ({ pl: m.pl, i: m.i, o: m.o, res: normProto(m.res) }));
        expect(mine).toEqual(theirs);
      }
    }
  });

  it('같은 난수열이면 본 턴 계획이 일치한다', () => {
    const turnStarts = sampleStates.filter(isTurnStart);
    let n = 0;
    for (let k = 0; k < turnStarts.length && n < 40; k += 3, n++) {
      const s = turnStarts[k];
      const mine = planTurn(s, mulberry32(k));
      const theirs = withSeed(k, () => P.aiPlan(toProto(s)));
      expect(mine && { pl: mine.placements, i: mine.pick, o: mine.drops }).toEqual(theirs && { pl: theirs.pl, i: theirs.i, o: theirs.o });
    }
    expect(n).toBeGreaterThan(20);
  });

  it('셋업 배치 선택이 일치한다 (프로토타입은 🔴 기준)', () => {
    const setups = sampleStates.filter((s) => s.phase === 'setup' && s.current === 1);
    expect(setups.length).toBeGreaterThan(0);
    setups.forEach((s, k) => {
      const mine = chooseSetup(s, mulberry32(k));
      const theirs = withSeed(k, () => {
        // 프로토타입 aiGo의 셋업 분기와 동일
        const t0 = toProto(s);
        let bv = -1e9;
        let bi = 0;
        for (let i = 0; i < 6; i++) {
          if (t0.h[i].length >= P.CAP[i]) continue;
          const t = P.cl(t0);
          P.put(t, i);
          const v = P.ev(t, 1) + Math.random();
          if (v > bv) {
            bv = v;
            bi = i;
          }
        }
        return bi;
      });
      expect(mine).toBe(theirs);
    });
  });
});
