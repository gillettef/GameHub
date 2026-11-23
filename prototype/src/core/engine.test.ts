// 룰북 예시와 핵심 판정을 엔진으로 확인한다.
import { describe, expect, it } from 'vitest';
import {
  TILES,
  check,
  createGame,
  currentBot,
  designerOf,
  legalInterventions,
  line,
  playOut,
  playTurn,
  ranking,
  runSims,
  submitDesign,
  targetOf,
  type GameState,
} from './index';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind: 'bot' as const }));
const tileInst = (g: GameState, code: string, nth = 0) => {
  const kind = TILES.findIndex((t) => t.code === code);
  return g.tiles.map((k, i) => [k, i] as const).filter(([k]) => k === kind)[nth]![1];
};

/** 아레나를 비우고 로봇·코어를 원하는 곳에 놓는다. 로봇 p만 실행 차례로 만든다 */
function stage(n: number, bots: [number, number, 0 | 1 | 2 | 3][], cores: [number, number][], p = 0): GameState {
  const g = createGame(seats(n), 1, { first: 0 });
  bots.forEach(([x, y, dir], i) => (g.players[i]!.bot = { x, y, dir }));
  g.cores = cores.map(([x, y]) => ({ x, y }));
  g.phase = 'exec';
  g.first = p;
  g.turn = 0;
  return g;
}

describe('준비', () => {
  it('인원별 시작 칸과 에너지, 손패', () => {
    const g = createGame(seats(5), 42, { first: 2 });
    expect(g.players[2]!.bot).toEqual({ x: 2, y: 1, dir: 1 }); // 선 플레이어 C2 오른쪽
    expect(g.players[3]!.bot).toEqual({ x: 5, y: 2, dir: 2 }); // F3 아래
    expect(g.players.every((p) => p.energy === 2)).toBe(true); // 준비 1 + 1라운드 충전 1
    expect(g.players.every((p) => p.hand.length === 5)).toBe(true);
    expect(g.bag.length).toBe(45 - 25);
    expect(g.cores.length).toBe(5);
  });
  it('설계자는 왼쪽(다음) 플레이어', () => {
    const g = createGame(seats(4), 1);
    expect(designerOf(g, 0)).toBe(1);
    expect(targetOf(g, 1)).toBe(0);
  });
});

describe('판정 기준 (6.3 예시)', () => {
  it('앞줄은 처음 만난 로봇 칸에서 끊긴다', () => {
    // 빨강 B4 오른쪽, D4 코어, E4 파랑
    const g = stage(3, [[1, 3, 1], [4, 3, 0], [0, 6, 0]], [[3, 3]]);
    const l = line(g, 0);
    expect(l.cells.map((c) => c.x)).toEqual([2, 3, 4]);
    expect(l.bot).toBe(true);
    expect(check(g, 0, 'lineCore')).toBe(true);
  });
  it('앞 칸이 기둥이면 앞줄은 0칸', () => {
    const g = stage(3, [[1, 2, 0], [6, 6, 0], [0, 6, 0]], [[3, 3]]); // B3 위, B2 기둥
    expect(line(g, 0).cells.length).toBe(0);
    expect(check(g, 0, 'frontBlocked')).toBe(true);
    expect(check(g, 0, 'lineNoCore')).toBe(true);
  });
});

describe('실행 (6.4·8)', () => {
  it('슬롯 순서대로 처음 참인 타일만 발동하고 지나간 칸의 코어를 얻는다', () => {
    const g = stage(3, [[3, 0, 2], [6, 6, 0], [0, 6, 0]], [[3, 1], [3, 3]]); // D1 아래, D2·D4 코어
    g.players[0]!.brain = [tileInst(g, 'T09'), tileInst(g, 'T04'), tileInst(g, 'T19')];
    playTurn(g, { k: 'none' });
    expect(g.players[0]!.bot).toMatchObject({ x: 3, y: 3 });
    expect(g.players[0]!.cores).toBe(2);
    expect(g.players[designerOf(g, 0)]!.dp).toBe(0);
  });
  it('규칙으로 충돌하면 설계자 점수, 남은 행동은 취소', () => {
    const g = stage(3, [[2, 1, 1], [6, 6, 0], [0, 6, 0]], []); // C2 오른쪽 → 뒤(B2)는 기둥
    g.players[0]!.brain = [tileInst(g, 'T20'), null, null];
    playTurn(g, { k: 'none' });
    expect(g.players[0]!.bot).toMatchObject({ x: 2, y: 1 });
    expect(g.players[1]!.dp).toBe(1);
  });
  it('멈출 때까지 전진은 막힌 칸 앞에서 멈추며 충돌이 아니다', () => {
    const g = stage(3, [[3, 0, 2], [3, 4, 0], [0, 6, 0]], []); // D1 아래, D5 로봇
    g.players[0]!.brain = [tileInst(g, 'T07'), null, null];
    playTurn(g, { k: 'none' });
    expect(g.players[0]!.bot).toMatchObject({ x: 3, y: 3 });
    expect(g.players[1]!.dp).toBe(0);
  });
  it('차단한 슬롯은 건너뛰고, 아무것도 발동 안 하면 1칸 전진', () => {
    const g = stage(3, [[3, 2, 0], [6, 6, 0], [0, 6, 0]], []);
    g.players[0]!.brain = [tileInst(g, 'T19'), tileInst(g, 'T12'), tileInst(g, 'T16')];
    playTurn(g, { k: 'block', slot: 0 });
    expect(g.players[0]!.bot).toMatchObject({ x: 3, y: 1, dir: 0 });
    expect(g.players[0]!.spent).toBe(1);
  });
  it('막힌 추진은 충돌이지만 점수 없음, 이어서 검사한다', () => {
    const g = stage(3, [[2, 1, 3], [6, 6, 0], [0, 6, 0]], []); // C2 왼쪽 → B2 기둥
    g.players[0]!.brain = [tileInst(g, 'T02'), null, null];
    playTurn(g, { k: 'thrust' });
    expect(g.players[0]!.bot).toMatchObject({ x: 2, y: 1, dir: 0 });
    expect(g.players[1]!.dp).toBe(0);
  });
  it('쓴 에너지 2개마다 설계자 점수 1개 (7.3)', () => {
    const g = stage(3, [[3, 2, 0], [6, 6, 0], [0, 6, 0]], []);
    g.players[0]!.spent = 1;
    g.players[0]!.brain = [tileInst(g, 'T19'), null, null];
    playTurn(g, { k: 'turn', dir: 'L' });
    expect(g.players[0]!.spent).toBe(0);
    expect(g.players[1]!.dp).toBe(1);
  });
  it('에너지가 없으면 개입할 수 없다', () => {
    const g = stage(3, [[3, 2, 0], [6, 6, 0], [0, 6, 0]], []);
    g.players[0]!.energy = 0;
    expect(legalInterventions(g)).toEqual([{ k: 'none' }]);
  });
});

describe('라운드 진행', () => {
  it('설계 → 공개 → 실행 → 정리 → 다음 라운드', () => {
    const g = createGame(seats(3), 9, { first: 0 });
    for (let d = 0; d < 3; d++) submitDesign(g, d, g.players[d]!.hand.slice(0, 3));
    expect(g.phase).toBe('exec');
    expect(g.players[targetOf(g, 1)]!.brain).toEqual(g.players[1]!.hand.slice(0, 3));
    expect(currentBot(g)).toBe(0);
    for (let i = 0; i < 3; i++) playTurn(g, { k: 'none' });
    expect(g.round).toBe(2);
    expect(g.first).toBe(1);
    expect(g.phase).toBe('design');
    expect(g.bag.length + g.players.reduce((a, p) => a + p.hand.length, 0)).toBe(45);
  });
  it('봇끼리 끝까지 진행하면 8라운드 뒤 끝난다', () => {
    for (const n of [3, 4, 5]) {
      const g = playOut(createGame(seats(n), n * 31), n);
      expect(g.phase).toBe('done');
      expect(g.round).toBe(8);
      expect(ranking(g)[0]!.rank).toBe(1);
      const coresOut = g.players.reduce((a, p) => a + p.cores, 0) + g.cores.length + g.coreSupply;
      expect(coresOut).toBe(20);
    }
  });
  it('자동 대전 통계', () => {
    const r = runSims(4, 3, 5);
    expect(r.seatWin.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(r.dpShare).toBeGreaterThanOrEqual(0);
  });
});
