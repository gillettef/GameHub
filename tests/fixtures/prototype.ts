/**
 * 프로토타입(docs/election-mancala-standalone.html)의 규칙·AI 함수를 원본 그대로 불러온다.
 * 파일을 복사하지 않고 테스트 시점에 <script>의 규칙·AI 구간을 잘라 평가하므로 원본과 항상 같다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_PLACE_PER_TURN } from '../../src/core/constants';
import type { GameState, Player } from '../../src/core/types';

export interface ProtoState {
  h: number[][];
  r: number[];
  su: number[];
  p: number;
  ph: string;
  bus: number[];
  ptr: number;
  src: number;
  n: number;
  pc: number;
  hl?: number;
}

export interface ProtoPlan {
  pl: number[];
  i: number;
  o: number[];
  res: ProtoState;
}

export interface Proto {
  CAP: number[];
  init(): ProtoState;
  cl(s: ProtoState): ProtoState;
  put(s: ProtoState, i: number): void;
  pick(s: ProtoState, i: number): void;
  drop(s: ProtoState, c: number): void;
  step(s: ProtoState): void;
  fin(s: ProtoState): void;
  nxt(s: ProtoState): number;
  full(s: ProtoState): number;
  score(s: ProtoState): number[];
  winner(s: ProtoState): number;
  canPlace(s: ProtoState): boolean;
  ev(s: ProtoState, m: number): number;
  moves(s: ProtoState, fast?: boolean): ProtoPlan[];
  aiPlan(s: ProtoState): ProtoPlan | null;
}

const htmlPath = fileURLToPath(new URL('../../docs/election-mancala-standalone.html', import.meta.url));

export function loadPrototype(): Proto {
  const html = readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.indexOf('/* ---------- 흐름');
  if (start < 8 || end < 0) throw new Error('프로토타입 스크립트 구간을 찾지 못했습니다');
  // 의도적으로 바꾼 규칙: 턴당 투입 상한(프로토타입 2 → 본 구현 MAX_PLACE_PER_TURN). 나머지는 원본 그대로
  const PROTO_PLACE_LIMIT = 's.ph=(s.pc<2&&canPlace(s))';
  if (!html.includes(PROTO_PLACE_LIMIT)) throw new Error('프로토타입 투입 상한 코드를 찾지 못했습니다');
  const src = html.slice(start, end).replace(PROTO_PLACE_LIMIT, `s.ph=(s.pc<${MAX_PLACE_PER_TURN}&&canPlace(s))`);
  const names = 'CAP,init,cl,put,pick,drop,step,fin,nxt,full,score,winner,canPlace,ev,moves,aiPlan';
  return new Function(`${src}\nreturn {${names}};`)() as Proto;
}

/** 본 구현 상태 → 프로토타입 상태 */
export function toProto(s: GameState): ProtoState {
  return {
    h: s.holes.map((x) => x.slice()),
    r: s.reserves.slice(),
    su: s.setupLeft.slice(),
    p: s.current,
    ph: s.phase,
    bus: s.bus.slice(),
    ptr: s.busPos,
    src: s.source,
    n: 0,
    pc: s.placedThisTurn,
  };
}

/** 비교용 정규화 (UI 전용 hl, 동기화용 버전 제외) */
export function normProto(s: ProtoState) {
  return {
    holes: s.h.map((x) => x.slice()),
    reserves: s.r.slice(),
    setupLeft: s.su.slice(),
    current: s.p,
    phase: s.ph,
    bus: s.bus.slice(),
    busPos: s.ptr,
    source: s.src,
    placedThisTurn: s.pc || 0,
  };
}

export function normCore(s: GameState) {
  return {
    holes: s.holes.map((x) => x.slice() as number[]),
    reserves: s.reserves.slice() as number[],
    setupLeft: s.setupLeft.slice() as number[],
    current: s.current as number,
    phase: s.phase as string,
    bus: s.bus.slice() as number[],
    busPos: s.busPos,
    source: s.source,
    placedThisTurn: s.placedThisTurn,
  };
}

export type { Player };
