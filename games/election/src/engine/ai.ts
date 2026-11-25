import { HOLE_COUNT, MAX_PLACE_PER_TURN } from './constants';
import type { Rng } from './rng';
import { applyUnchecked, busColors, countColor, isFull, other, score, winner } from './rules';
import type { Action, GameState, Player } from './types';

const WIN = 1e3;
/** 수 선택 동점을 깨는 노이즈 폭 (프로토타입 값) */
const PLAN_NOISE = 0.3;

/**
 * 상태 평가 (프로토타입 `ev`).
 * 종료면 승 +1000 / 무 0 / 패 -1000, 아니면 (점수차)×3 + 0.3×Σ(내 토큰×2 − 전체 토큰)
 */
export function evaluate(s: GameState, me: Player): number {
  if (s.phase === 'over') {
    const w = winner(s);
    return w === me ? WIN : w === null ? 0 : -WIN;
  }
  const t = score(s);
  let g = 0;
  for (const h of s.holes) g += countColor(h, me) * 2 - h.length;
  return (t[me] - t[other(me)]) * 3 + g * 0.3;
}

/** 한 턴의 수 하나를 끝까지 펼친 결과 */
export interface Line {
  /** 투입한 권역들 */
  placements: number[];
  /** 출발 권역 (sow 단계에서 시작했으면 -1) */
  pick: number;
  /** 갈림길(두 색이 섞인 버스)에서 고른 하차 색 순서 */
  drops: Player[];
  /** 위를 실제로 실행하는 액션 열 (자동 하차는 포함하지 않음) */
  actions: Action[];
  result: GameState;
}

/** 버스가 섞여 있는 동안 하차 색을 정해 순회를 끝낸다 */
function finishSow(s: GameState, me: Player, fast: boolean, line: Line): GameState {
  let b = s;
  while (b.phase === 'sow') {
    let c = b.bus[0];
    const colors = busColors(b);
    if (!fast && colors.length > 1) {
      // 매 갈림길에서 1수 앞을 보고 탐욕 선택
      let bv = -1e9;
      for (const k of colors) {
        const v = evaluate(applyUnchecked(b, { type: 'drop', color: k }), me);
        if (v > bv) {
          bv = v;
          c = k;
        }
      }
    } else if (fast && b.bus.includes(me)) {
      c = me;
    }
    line.drops.push(c);
    line.actions.push({ type: 'drop', color: c });
    b = applyUnchecked(b, { type: 'drop', color: c });
  }
  return b;
}

/** 이번 턴에 가능한 투입 조합. 순서는 프로토타입과 같다: [0],[0,0],[0,1],…,[1],[1,1],… */
function placementOptions(s: GameState, fast: boolean): number[][] {
  if (s.phase !== 'place') return [[]];
  const out: number[][] = [];
  // 이미 1개 이상 투입한 상태(턴 도중 복원)라면 그만 두는 선택지도 있다
  if (s.placedThisTurn >= 1) out.push([]);
  const twoMore = s.placedThisTurn + 1 < MAX_PLACE_PER_TURN;
  for (let i = 0; i < HOLE_COUNT; i++) {
    if (isFull(s, i)) continue;
    out.push([i]);
    if (fast || !twoMore) continue;
    const t = applyUnchecked(s, { type: 'place', hole: i });
    if (t.phase !== 'place') continue;
    for (let j = i; j < HOLE_COUNT; j++) if (!isFull(t, j)) out.push([i, j]);
  }
  return out;
}

/**
 * 현재 플레이어의 모든 수 (프로토타입 `moves`).
 * fast: 상대 응수용 간이 생성 — 투입 1개만, 하차는 자기 색 우선.
 */
export function generateLines(s: GameState, fast = false): Line[] {
  const me = s.current;
  const out: Line[] = [];
  if (s.phase === 'sow') {
    const line: Line = { placements: [], pick: -1, drops: [], actions: [], result: s };
    line.result = finishSow(s, me, fast, line);
    return [line];
  }
  for (const pl of placementOptions(s, fast)) {
    let a = s;
    const head: Action[] = [];
    for (const x of pl) {
      head.push({ type: 'place', hole: x });
      a = applyUnchecked(a, { type: 'place', hole: x });
    }
    if (a.phase === 'place') {
      head.push({ type: 'endPlace' });
      a = applyUnchecked(a, { type: 'endPlace' });
    }
    for (let i = 0; i < HOLE_COUNT; i++) {
      if (!a.holes[i].length) continue;
      const line: Line = {
        placements: pl,
        pick: i,
        drops: [],
        actions: [...head, { type: 'pick', hole: i }],
        result: s,
      };
      const b = applyUnchecked(a, { type: 'pick', hole: i });
      line.result = finishSow(b, me, fast, line);
      out.push(line);
    }
  }
  return out;
}

/** 셋업 배치 선택: ev + random() 최대 */
export function chooseSetup(s: GameState, rng: Rng): number {
  let bv = -1e9;
  let bi = 0;
  for (let i = 0; i < HOLE_COUNT; i++) {
    if (isFull(s, i)) continue;
    const v = evaluate(applyUnchecked(s, { type: 'setup', hole: i }), s.current) + rng();
    if (v > bv) {
      bv = v;
      bi = i;
    }
  }
  return bi;
}

/**
 * 본 턴 계획 (프로토타입 `aiPlan`): 내 모든 수에 대해 상대의 빠른 응수 중 최소 평가값을 취하고,
 * 노이즈를 더해 최대인 수를 고른다. 수가 없으면 null.
 */
export function planTurn(s: GameState, rng: Rng): Line | null {
  const me = s.current;
  let best: Line | null = null;
  let bv = -1e9;
  for (const mv of generateLines(s)) {
    let v: number;
    if (mv.result.phase === 'over') v = evaluate(mv.result, me);
    else {
      v = 1e9;
      for (const r of generateLines(mv.result, true)) {
        const x = evaluate(r.result, me);
        if (x < v) v = x;
      }
    }
    v += rng() * PLAN_NOISE;
    if (v > bv) {
      bv = v;
      best = mv;
    }
  }
  return best;
}

/** 현재 플레이어가 이번 차례에 둘 액션 열. 셋업이면 1개, 본 턴이면 턴 끝까지 */
export function chooseActions(s: GameState, rng: Rng): Action[] {
  if (s.phase === 'over') return [];
  if (s.phase === 'setup') return [{ type: 'setup', hole: chooseSetup(s, rng) }];
  const plan = planTurn(s, rng);
  if (plan) return plan.actions;
  // 방어 코드: 둘 수가 없을 때(정상 진행에서는 도달 불가)
  return s.phase === 'place' && s.placedThisTurn >= 1 ? [{ type: 'endPlace' }] : [];
}
