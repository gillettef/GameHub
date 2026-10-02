import { describe, expect, it } from 'vitest';
import { CFG, dispatch, newGame, rankings } from '../src/game/engine';

describe('게임 엔진', () => {
  it('AI끼리 8라운드를 끝까지 진행하고 순위가 나온다', () => {
    const s = newGame({ humans: 0, aiCount: 3, seed: 42 });
    expect(s.phase).toBe('gameOver');
    expect(s.round).toBe(CFG.rounds);
    expect(rankings(s)).toHaveLength(3);
  });

  it('같은 시드는 같은 결과를 낸다 (재현성)', () => {
    const a = newGame({ humans: 0, aiCount: 2, seed: 7 });
    const b = newGame({ humans: 0, aiCount: 2, seed: 7 });
    expect(a.players.map((p) => p.vp)).toEqual(b.players.map((p) => p.vp));
  });

  it('사람 플레이어는 건설 단계에서 대기하고 돈이 부족하면 구매할 수 없다', () => {
    let s = newGame({ aiCount: 1, seed: 3 });
    expect(s.phase).toBe('construct');
    s.players[0].money = 0;
    s = dispatch(s, { type: 'buy', cardId: s.market[0], slot: 0 });
    expect(s.notice).toBeTruthy();
    expect(s.players[0].facilities[0]).toBeNull();
  });

  it('한 라운드 흐름: 건설→홍보→운영→관리→다음 라운드', () => {
    let s = newGame({ aiCount: 1, seed: 5 });
    s = dispatch(s, { type: 'pass' });
    expect(s.phase).toBe('promote');
    expect(s.promoteStep).toBe('pick');
    s = dispatch(s, { type: 'confirmFee' });
    expect(s.notice).toBeTruthy(); // 관객을 먼저 골라야 한다
    s = dispatch(s, { type: 'donePicking' });
    expect(s.promoteStep).toBe('fee');
    s = dispatch(s, { type: 'confirmFee' });
    expect(s.phase).toBe('operate');
    s = dispatch(s, { type: 'continue' });
    expect(s.phase).toBe('manage');
    s = dispatch(s, { type: 'endManage' });
    expect(s.round).toBe(2);
    expect(s.phase).toBe('construct');
  });

  it('관객 트랙: 공개된 관객을 차례로 가져가고 수용량을 넘길 수 없다', () => {
    let s = newGame({ aiCount: 1, seed: 11 });
    s = dispatch(s, { type: 'pass' });
    expect(s.visitorRow.length).toBe(CFG.baseVisitors * 2 + CFG.rowExtra);
    const open = () => s.visitorRow.filter((r) => r.by === null);
    const first = open()[0].v.id;
    s = dispatch(s, { type: 'pickVisitor', visitorId: first });
    expect(s.players[0].visitors.map((v) => v.id)).toContain(first);
    // 이미 가져간 관객은 다시 가져갈 수 없다
    const again = dispatch(s, { type: 'pickVisitor', visitorId: first });
    expect(again.notice).toBeTruthy();
    // 수용량(2명)을 채우면 입장료 단계로 넘어간다
    if (s.promoteStep === 'pick') s = dispatch(s, { type: 'pickVisitor', visitorId: open()[0].v.id });
    expect(s.players[0].visitors.length).toBeLessThanOrEqual(CFG.baseVisitors);
    expect(s.promoteStep).toBe('fee');
  });

  it('잘못된 단계의 행동은 상태를 바꾸지 않고 notice만 남긴다', () => {
    const s = newGame({ aiCount: 1, seed: 5 });
    const t = dispatch(s, { type: 'endManage' });
    expect(t.notice).toBeTruthy();
    expect(t.round).toBe(s.round);
  });
});
