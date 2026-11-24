import { CAP, HOLE_COUNT, INITIAL_RESERVES, MAX_PLACE_PER_TURN, SETUP_TOKENS } from './constants';
import { legalActions } from './rules';
import type { Action, GameState, Phase, Player } from './types';

const PHASES: readonly Phase[] = ['setup', 'place', 'pick', 'sow', 'over'];

const isPlayer = (x: unknown): x is 0 | 1 => x === 0 || x === 1;
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isPair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every(isCount);

/** 외부(저장소·네트워크)에서 온 값이 GameState 모양인지 검사 */
function hasShape(x: unknown): x is GameState {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return (
    Array.isArray(s.holes) &&
    s.holes.length === HOLE_COUNT &&
    s.holes.every((h, i) => Array.isArray(h) && h.length <= CAP[i] && h.every(isPlayer)) &&
    isPair(s.reserves) &&
    isPair(s.setupLeft) &&
    isPlayer(s.current) &&
    PHASES.includes(s.phase as Phase) &&
    Array.isArray(s.bus) &&
    s.bus.every(isPlayer) &&
    Number.isInteger(s.busPos) &&
    (s.busPos as number) >= 0 &&
    (s.busPos as number) < HOLE_COUNT &&
    Number.isInteger(s.source) &&
    isCount(s.placedThisTurn) &&
    isCount(s.version)
  );
}

/** 단계와 내용이 서로 맞는지 (손상·변조된 저장 데이터로 진행이 멈추거나 규칙을 넘지 않도록) */
function isConsistent(s: GameState): boolean {
  // 색별 토큰 수는 처음 가진 양(배치 + 예비군)을 넘을 수 없다 (낙선으로 줄 수는 있음)
  for (const c of [0, 1] as Player[]) {
    let n = s.reserves[c] + s.setupLeft[c];
    for (const h of s.holes) for (const t of h) if (t === c) n++;
    for (const t of s.bus) if (t === c) n++;
    if (n > SETUP_TOKENS + INITIAL_RESERVES[c] || s.setupLeft[c] > SETUP_TOKENS) return false;
  }
  if (s.placedThisTurn > MAX_PLACE_PER_TURN) return false;
  switch (s.phase) {
    case 'setup':
      if (s.setupLeft[s.current] === 0 || s.bus.length) return false;
      break;
    case 'place':
      if (s.reserves[s.current] === 0 || s.placedThisTurn >= MAX_PLACE_PER_TURN || s.bus.length) return false;
      break;
    case 'pick':
      if (s.bus.length) return false;
      break;
    case 'sow':
    case 'over':
      break;
  }
  // 끝나지 않았다면 둘 수 있는 수가 있어야 한다 (빈 버스의 sow, 빈 보드의 pick 등)
  return s.phase === 'over' || legalActions(s).length > 0;
}

export function isGameState(x: unknown): x is GameState {
  return hasShape(x) && isConsistent(x);
}

/** 외부(네트워크)에서 온 값이 Action 모양인지 검사. 합법성은 검사하지 않는다(isLegal로 따로) */
export function isAction(x: unknown): x is Action {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  const isHole = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < HOLE_COUNT;
  switch (a.type) {
    case 'setup':
    case 'place':
    case 'pick':
      return isHole(a.hole);
    case 'endPlace':
      return true;
    case 'drop':
      return isPlayer(a.color);
    default:
      return false;
  }
}
