import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import {
  applyAction,
  canPlace,
  fullCount,
  holeOwner,
  initialState,
  isLegal,
  legalActions,
  nextStop,
  resolveAction,
  score,
  winner,
} from '../src/core/rules';
import type { GameState, Player } from '../src/core/types';

const B: Player = 0;
const R: Player = 1;
const fill = (n: number, c: Player): Player[] => Array.from({ length: n }, () => c);

function mk(p: Partial<GameState>): GameState {
  return { ...initialState(), phase: 'place', setupLeft: [0, 0], ...p };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe('셋업', () => {
  it('초기 상태', () => {
    const s = initialState();
    expect(s.reserves).toEqual([10, 11]);
    expect(s.setupLeft).toEqual([4, 4]);
    expect(s.current).toBe(0);
    expect(s.phase).toBe('setup');
    expect(s.holes.every((h) => h.length === 0)).toBe(true);
  });

  it('번갈아 4개씩 놓고 끝나면 🔵 차례의 투입 단계가 된다', () => {
    let s = initialState();
    const order: Player[] = [];
    for (let k = 0; k < 8; k++) {
      order.push(s.current);
      s = applyAction(s, { type: 'setup', hole: k % 6 });
    }
    expect(order).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(s.current).toBe(0);
    expect(s.phase).toBe('place');
    expect(s.reserves).toEqual([10, 11]); // 셋업은 예비군을 쓰지 않는다
    expect(s.holes[0]).toEqual([B, B]); // k=0, k=6 모두 🔵
    expect(s.holes[1]).toEqual([R, R]);
  });
});

describe('① 예비군 투입', () => {
  const base = mk({ holes: [[B], [R], [], [], [], []] });

  it('최소 1개를 놓기 전에는 투입 완료할 수 없다', () => {
    expect(isLegal(base, { type: 'endPlace' })).toBe(false);
    const s = applyAction(base, { type: 'place', hole: 2 });
    expect(s.phase).toBe('place');
    expect(s.reserves[0]).toBe(9);
    expect(isLegal(s, { type: 'endPlace' })).toBe(true);
    expect(applyAction(s, { type: 'endPlace' }).phase).toBe('pick');
  });

  it('같은 권역에 두 번 놓을 수 있고, 2개 놓으면 출발 단계로 간다', () => {
    let s = applyAction(base, { type: 'place', hole: 4 });
    s = applyAction(s, { type: 'place', hole: 4 });
    expect(s.holes[4]).toEqual([B, B]);
    expect(s.phase).toBe('pick');
    expect(s.placedThisTurn).toBe(2);
  });

  it('포화 권역에는 놓을 수 없다', () => {
    const s = mk({ holes: [fill(8, R), [], [], [], [], []] });
    expect(isLegal(s, { type: 'place', hole: 0 })).toBe(false);
    expect(() => applyAction(s, { type: 'place', hole: 0 })).toThrow();
  });

  it('1개 놓은 뒤 예비군이 떨어지면 바로 출발 단계', () => {
    const s = applyAction(mk({ holes: [[B], [], [], [], [], []], reserves: [1, 3] }), { type: 'place', hole: 1 });
    expect(s.phase).toBe('pick');
  });

  it('턴 시작 시 예비군이 0이면 투입을 건너뛴다', () => {
    // 🔵가 마지막 하차로 턴을 끝내면 🔴(예비군 0) 차례 → 바로 pick
    const s = mk({ holes: [[B], [], [], [], [], []], reserves: [3, 0], phase: 'pick', placedThisTurn: 1 });
    const t = applyAction(s, { type: 'pick', hole: 0 });
    expect(t.current).toBe(1);
    expect(t.phase).toBe('pick');
    expect(canPlace(t)).toBe(false);
  });
});

describe('② 출발과 ③ 유세 순회', () => {
  it('다음 칸부터 포화 권역을 건너뛰며 1개씩 내리고, 색 순서는 플레이어가 고른다', () => {
    const s = mk({
      holes: [[B, R], fill(7, R), [], [B], [], []],
      reserves: [5, 5],
      phase: 'pick',
      placedThisTurn: 1,
    });
    const a = applyAction(s, { type: 'pick', hole: 0 });
    expect(a.phase).toBe('sow');
    expect(a.holes[0]).toEqual([]);
    expect(a.bus).toEqual([B, R]);
    expect(nextStop(a)).toBe(2); // B(포화) 건너뜀
    expect(legalActions(a)).toEqual([
      { type: 'drop', color: B },
      { type: 'drop', color: R },
    ]);

    const steps = resolveAction(a, { type: 'drop', color: R });
    // [선택 하차] → [자동 하차] → [턴 종료]
    expect(steps.map((x) => x.events.map((e) => e.type))).toEqual([['drop'], ['drop'], ['turnEnd']]);
    const end = steps[steps.length - 1].state;
    expect(end.holes[2]).toEqual([R]);
    expect(end.holes[3]).toEqual([B, B]);
    expect(end.current).toBe(1);
    expect(end.phase).toBe('place');
    expect(end).toEqual(applyAction(a, { type: 'drop', color: R }));
  });

  it('출발 권역 자신도 순회 대상이다', () => {
    // 출발 권역 외 모두 포화 → 6칸째인 출발 권역으로 돌아온다
    const s = mk({
      holes: [[B, B], fill(7, R), fill(6, R), fill(6, B), fill(4, R), fill(4, B)],
      phase: 'pick',
      placedThisTurn: 1,
    });
    const t = applyAction(s, { type: 'pick', hole: 0 });
    expect(t.holes[0]).toEqual([B, B]);
  });

  it('한 색만 탔으면 끝까지 자동 하차하고 각 하차가 박자로 나뉜다', () => {
    const s = mk({ holes: [[], [], [B, B, B], [], [], []], phase: 'pick', placedThisTurn: 1 });
    const steps = resolveAction(s, { type: 'pick', hole: 2 });
    expect(steps.length).toBe(5); // 출발 + 하차 3 + 턴 종료
    expect(steps[0].state.bus).toEqual([B, B, B]);
    expect(steps.slice(1, 4).map((x) => x.events[0])).toEqual([
      { type: 'drop', player: 0, hole: 3, color: B, auto: true },
      { type: 'drop', player: 0, hole: 4, color: B, auto: true },
      { type: 'drop', player: 0, hole: 5, color: B, auto: true },
    ]);
    expect(steps[4].events).toEqual([{ type: 'turnEnd', next: 1 }]);
  });

  it('상대 토큰만 있는 권역에서도 출발할 수 있다', () => {
    const s = mk({ holes: [[R], [], [], [], [], []], phase: 'pick', placedThisTurn: 1 });
    expect(isLegal(s, { type: 'pick', hole: 0 })).toBe(true);
    expect(isLegal(s, { type: 'pick', hole: 1 })).toBe(false);
  });

  it('하차 후 놓을 곳이 없으면 남은 버스 토큰은 낙선', () => {
    const s = mk({
      holes: [fill(8, B), fill(7, R), fill(6, R), fill(6, B), fill(4, R), fill(3, B)],
      phase: 'sow',
      bus: [B, R, R],
      busPos: 4,
      source: 4,
      placedThisTurn: 1,
    });
    const steps = resolveAction(s, { type: 'drop', color: B });
    expect(steps[0].events).toEqual([
      { type: 'drop', player: 0, hole: 5, color: B, auto: false },
      { type: 'lost', player: 0, tokens: [R, R] },
    ]);
    const end = steps[steps.length - 1].state;
    expect(end.bus).toEqual([]);
    expect(end.phase).toBe('over'); // 포화 6곳
  });

  it('하차 시점에 정차지가 없으면 그 토큰까지 모두 낙선', () => {
    const s = mk({
      holes: [fill(8, B), fill(7, R), fill(6, R), fill(6, B), fill(4, R), fill(4, B)],
      phase: 'sow',
      bus: [R, B],
      busPos: 0,
      placedThisTurn: 1,
    });
    const steps = resolveAction(s, { type: 'drop', color: B });
    expect(steps[0].events).toEqual([{ type: 'lost', player: 0, tokens: [B, R] }]);
  });
});

describe('종료 판정', () => {
  it('포화 4곳은 턴 종료 시점에만 검사한다', () => {
    const s = mk({
      holes: [fill(8, B), fill(7, R), fill(6, R), fill(5, B), [R], []],
      reserves: [5, 5],
    });
    const a = applyAction(s, { type: 'place', hole: 3 });
    expect(fullCount(a)).toBe(4);
    expect(a.phase).toBe('place'); // 아직 진행 중
    const b = applyAction(applyAction(a, { type: 'endPlace' }), { type: 'pick', hole: 4 });
    expect(b.phase).toBe('over');
    expect(b.current).toBe(0); // 종료 시 차례는 넘기지 않는다
  });

  it('예비군이 양쪽 모두 소진되면 종료', () => {
    const s = mk({ holes: [[B], [], [], [], [], []], reserves: [1, 0] });
    let t = applyAction(s, { type: 'place', hole: 0 });
    expect(t.phase).toBe('pick');
    t = applyAction(t, { type: 'pick', hole: 0 });
    expect(t.phase).toBe('over');
  });

  it('한쪽만 소진되면 계속 진행', () => {
    const s = mk({ holes: [[B], [], [], [], [], []], reserves: [1, 4] });
    const t = applyAction(applyAction(s, { type: 'place', hole: 0 }), { type: 'pick', hole: 0 });
    expect(t.phase).toBe('place');
    expect(t.current).toBe(1);
  });

  it('종료 후에는 둘 수 없다', () => {
    const s = mk({ phase: 'over' });
    expect(legalActions(s)).toEqual([]);
  });
});

describe('점수와 승패', () => {
  it('다수 색이 선거인단을, 동점이면 ⚑(맨 아래) 색이 가져간다', () => {
    const s = mk({ holes: [[B, R, R], [R, B], [B, R], [], [B], [R, R, B]] });
    expect(holeOwner(s, 0)).toBe(R);
    expect(holeOwner(s, 1)).toBe(R);
    expect(holeOwner(s, 2)).toBe(B);
    expect(holeOwner(s, 3)).toBe(null);
    expect(score(s)).toEqual([6 + 4, 8 + 7 + 4]);
  });

  it('총점 동점이면 남은 예비군 많은 쪽, 그것도 같으면 무승부', () => {
    // 🔵 8 vs 🔴 4 → 🔵 (예비군이 적어도 총점이 우선)
    expect(winner(mk({ holes: [[B], [], [], [], [], [R, R]], reserves: [0, 9] }))).toBe(B);
    const even = [[B], [], [], [], [R], [R]] as Player[][];
    expect(score(mk({ holes: even }))).toEqual([8, 8]);
    expect(winner(mk({ holes: even, reserves: [2, 3] }))).toBe(R);
    expect(winner(mk({ holes: even, reserves: [3, 3] }))).toBe(null);
  });
});

describe('불변성·직렬화·방어 코드', () => {
  it('applyAction/resolveAction은 입력을 바꾸지 않는다', () => {
    const rng = mulberry32(5);
    let s = initialState();
    while (s.phase !== 'over') {
      const legal = legalActions(s);
      const a = legal[Math.floor(rng() * legal.length)];
      const frozen = deepFreeze(JSON.parse(JSON.stringify(s)) as GameState);
      const next = applyAction(frozen, a);
      resolveAction(frozen, a);
      expect(frozen).toEqual(s);
      s = next;
    }
  });

  it('상태는 JSON 왕복 후에도 같다', () => {
    let s = initialState();
    for (let k = 0; k < 8; k++) s = applyAction(s, { type: 'setup', hole: k % 6 });
    s = applyAction(s, { type: 'place', hole: 0 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('액션마다 버전이 1씩 오른다', () => {
    const s = applyAction(initialState(), { type: 'setup', hole: 0 });
    expect(s.version).toBe(1);
  });

  it('정상 대국에서는 출발 단계에 항상 토큰이 있다 (보드 토큰 ≥ 8)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = mulberry32(seed);
      let s = initialState();
      while (s.phase !== 'over') {
        if (s.phase !== 'setup') expect(s.holes.flat().length + s.bus.length).toBeGreaterThanOrEqual(8);
        const legal = legalActions(s);
        expect(legal.length).toBeGreaterThan(0);
        s = applyAction(s, legal[Math.floor(rng() * legal.length)]);
      }
    }
  });
});

describe('감사에서 추가한 경계 사례', () => {
  it('순회 도중 포화 4곳이 되어도 버스를 다 내린 뒤에야 종료한다', () => {
    const s = mk({
      holes: [fill(8, B), fill(7, R), fill(6, R), fill(5, B), [], []],
      reserves: [5, 5],
      phase: 'sow',
      bus: [B, R],
      busPos: 2,
      source: 2,
      placedThisTurn: 1,
    });
    const steps = resolveAction(s, { type: 'drop', color: R });
    expect(fullCount(steps[0].state)).toBe(4);
    expect(steps[0].state.phase).toBe('sow');
    const end = steps[steps.length - 1].state;
    expect(end.holes[4]).toEqual([B]);
    expect(end.bus).toEqual([]);
    expect(end.phase).toBe('over');
  });

  it('F 다음 정차지는 A로 돌아가고, A가 포화면 B', () => {
    const open = mk({ phase: 'sow', bus: [B, R], busPos: 5, source: 5, placedThisTurn: 1 });
    expect(nextStop(open)).toBe(0);
    const fullA = { ...open, holes: [fill(8, R), [], [], [], [], []] };
    expect(nextStop(fullA)).toBe(1);
  });

  it('깃발 권역을 비웠다가 다시 채우면 먼저 내린 색이 새 ⚑가 된다', () => {
    const s = mk({
      holes: [fill(8, B), fill(7, R), [B, R], fill(6, B), fill(4, R), fill(4, B)],
      phase: 'pick',
      placedThisTurn: 1,
    });
    expect(holeOwner(s, 2)).toBe(B);
    const t = applyAction(applyAction(s, { type: 'pick', hole: 2 }), { type: 'drop', color: R });
    expect(t.holes[2]).toEqual([R, B]); // 다른 곳이 모두 포화라 출발 권역으로 되돌아온다
    expect(holeOwner(t, 2)).toBe(R);
  });

  it('버스에 없는 색은 내릴 수 없다', () => {
    const s = mk({ phase: 'sow', bus: [B, B], busPos: 0, source: 0, placedThisTurn: 1 });
    expect(isLegal(s, { type: 'drop', color: R })).toBe(false);
    expect(() => applyAction(s, { type: 'drop', color: R })).toThrow();
  });

  it('출발 단계에서는 투입 완료를 할 수 없다', () => {
    const s = mk({ holes: [[B], [], [], [], [], []], phase: 'pick', placedThisTurn: 2 });
    expect(isLegal(s, { type: 'endPlace' })).toBe(false);
    expect(() => applyAction(s, { type: 'endPlace' })).toThrow();
  });
});
