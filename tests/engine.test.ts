import { describe, expect, it } from 'vitest';
import { CFG, baseCapacity, dispatch, newGame, operatePlayer, priceOf, probe, rankings, seatMoney, winners } from '../src/game/engine';
import { FACILITY_BY_ID } from '../src/game/data/facilities';
import { EVENTS } from '../src/game/data/events';
import type { Visitor } from '../src/game/types';

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
    expect(a).toEqual(b);
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

  /** 사람이 1라운드 선인 시드를 찾는다 (이때만 AI가 아직 아무 행동도 하지 않은 상태) */
  const humanFirst = (aiCount: number) => {
    for (let seed = 1; seed < 500; seed++) {
      const s = newGame({ aiCount, seed });
      if (s.startFirst === 0) return s;
    }
    throw new Error('사람이 선인 시드를 찾지 못함');
  };

  it('시작 자금: 1라운드 순서가 늦을수록 seatBonus만큼 더 받는다', () => {
    const s = humanFirst(2);
    const n = s.players.length;
    for (const p of s.players) {
      const pos = (p.id - s.startFirst + n) % n;
      expect(p.money).toBe(CFG.startMoney + seatMoney(n, pos));
    }
    expect(s.first).toBe(s.startFirst);
  });

  it('시장 카드 수는 플레이어 수 + marketExtra', () => {
    for (const ai of [1, 2, 3]) {
      const s = humanFirst(ai);
      expect(s.market.length).toBe(ai + 1 + CFG.marketExtra);
    }
  });

  it('수용 인원은 건설비 구간(capTiers)을 따른다', () => {
    expect(baseCapacity(FACILITY_BY_ID[1])).toBe(3); // 롤러코스터 (10)
    expect(baseCapacity(FACILITY_BY_ID[3])).toBe(2); // 바이킹 (5)
    expect(baseCapacity(FACILITY_BY_ID[5])).toBe(1); // 회전목마 (3)
  });

  it('게임 종료 시 남은 돈이 moneyPerVp 비율로 VP에 더해진다', () => {
    const s = newGame({ humans: 0, aiCount: 2, seed: 8 });
    expect(s.phase).toBe('gameOver');
    for (const p of s.players) expect(p.endBonus).toBe(Math.floor(p.money / CFG.moneyPerVp));
  });

  /** 사람이 1라운드 선인 2인 게임 */
  const myTurn = () => humanFirst(1);

  /* ───── 운영 계산 ───── */

  /** 사람 게임에서 운영 계산만 따로 해 보기 위한 상태 */
  const opState = (facilities: number[], visitors: Partial<Visitor>[], eventId?: number) => {
    const s = newGame({ aiCount: 1, seed: 1 });
    s.event = eventId ? EVENTS.find((e) => e.id === eventId)! : { id: 0, name: '평범한 날', desc: '', icon: 'sun', tags: [] };
    const p = s.players[0];
    p.facilities = Array(CFG.slots).fill(null);
    facilities.forEach((id, i) => (p.facilities[i] = { id, broken: false }));
    p.visitors = visitors.map((v, i) => ({ id: 1000 + i, kind: 'adult', fav: '교육형', budget: 4, ...v }) as Visitor);
    p.fee = 0;
    p.money = 50;
    p.vp = 0;
    p.satPool = 0;
    p.trash = 0;
    p.staff = { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 };
    return { s, p };
  };

  it('입장료를 낼 수 없는 관객은 입장하지 않는다', () => {
    const { s, p } = opState([26], [{ budget: 1 }, { budget: 3 }]);
    p.fee = 2;
    const r = operatePlayer(s, p);
    expect(r.entered).toBe(1);
    expect(r.feeIncome).toBe(2);
  });

  it('상점·부대시설은 놀이기구 2곳과 별도로 들른다', () => {
    // 트램폴린·클라이밍 벽(놀이형) + 푸드코트(상점) + 정보 안내 센터(부대시설): 성인 1명
    const { s, p } = opState([26, 27, 33, 36], [{}]);
    const r = operatePlayer(s, p);
    const names = r.visits.map((v) => v.facility);
    expect(names).toContain('트램폴린');
    expect(names).toContain('클라이밍 벽');
    expect(r.visits.filter((v) => v.facilityType === '상점' || v.facilityType === '부대시설')).toHaveLength(1);
  });

  it('시설을 하나도 못 쓴 관객은 만족도를 깎는다', () => {
    const { s, p } = opState([26], [{}, {}]); // 트램폴린 수용 1명
    const r = operatePlayer(s, p);
    expect(r.unserved).toBe(1);
    expect(r.unservedSat).toBe(CFG.unservedSat);
  });

  it('특수효과: 취향 일치 보너스와 입장 관객당 패시브 만족도', () => {
    // 자이로드롭: 스릴형을 좋아하는 관객 만족도 +2 (+ 기본 취향 일치 +1)
    const a = opState([2], [{ kind: 'adult', fav: '스릴형' }]);
    const ra = operatePlayer(a.s, a.p);
    expect(ra.visits[0].sat).toBe(FACILITY_BY_ID[2].sat[1] + 1 + 2);
    // 정보 안내 센터: 입장 관객 1명당 만족도 +1 (이용 여부와 무관)
    const b = opState([36], [{}, {}, {}]);
    const rb = operatePlayer(b.s, b.p);
    expect(rb.bonusSat).toBe(3);
  });

  it('특수효과: 롤러코스터는 악천후에만 유지비 +2', () => {
    const rain = opState([1], [], 2);
    expect(operatePlayer(rain.s, rain.p).upkeep).toBe(FACILITY_BY_ID[1].upkeep + 2);
    const snow = opState([1], [], 8);
    expect(operatePlayer(snow.s, snow.p).upkeep).toBe(FACILITY_BY_ID[1].upkeep + 2);
    const sun = opState([1], [], 1);
    expect(operatePlayer(sun.s, sun.p).upkeep).toBe(FACILITY_BY_ID[1].upkeep);
  });

  it('특수효과: 스윙 세트는 고장 나지 않는다', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { s, p } = opState([28], [{ kind: 'child' }]);
      s.rng = seed;
      expect(operatePlayer(s, p).broken).toHaveLength(0);
    }
  });

  it('적자 감점은 VP 0 아래로도 적용되고 돈은 0으로 복구된다', () => {
    const { s, p } = opState([1, 2], [], 1);
    p.money = 0; // 유지비 6 → 적자 $6 → VP -3
    const r = operatePlayer(s, p);
    expect(r.debtVp).toBe(3);
    expect(p.vp).toBe(-3);
    expect(p.money).toBe(0);
  });

  it('쓰레기 대란의 쓰레기도 보고서 trashAdded에 포함된다', () => {
    const { s, p } = opState([], [], 10);
    const r = operatePlayer(s, p);
    expect(r.trashAdded).toBe(2);
    expect(p.trash).toBe(2);
  });

  it('치우지 않은 쓰레기는 라운드가 끝날 때마다 다시 감점된다', () => {
    let s = myTurn();
    s.players[0].trash = 4;
    s.players[0].money = 0;
    s = dispatch(s, { type: 'pass' });
    s = dispatch(s, { type: 'donePicking' });
    s = dispatch(s, { type: 'confirmFee' });
    s = dispatch(s, { type: 'continue' });
    const trash = s.players[0].trash;
    const vp = s.players[0].vp;
    s = dispatch(s, { type: 'endManage' });
    expect(trash).toBeGreaterThanOrEqual(4);
    expect(s.players[0].vp).toBe(vp - Math.floor(trash / CFG.trashPerVp));
    expect(s.players[0].trash).toBe(trash); // 쓰레기는 남는다
  });

  /* ───── 행동 검증 ───── */

  it('축제: $festivalCost로 VP를 얻고 라운드당 한 번만 열 수 있다', () => {
    let s = myTurn();
    s.players[0].money = 20;
    s = dispatch(s, { type: 'festival' });
    expect(s.notice).toBeNull();
    expect(s.players[0].money).toBe(20 - CFG.festivalCost);
    expect(s.players[0].vp).toBe(CFG.festivalVp);
    expect(s.players[0].festival).toBe(true);
    if (s.turn === 0 && s.phase === 'construct') {
      const t = dispatch(s, { type: 'festival' });
      expect(t.notice).toBeTruthy();
    }
  });

  it('잘못된 입력(소수 부지, NaN 입장료)을 거절하고 입장료는 정수로 맞춘다', () => {
    const s = myTurn();
    s.players[0].money = 50;
    const a = dispatch(s, { type: 'buy', cardId: s.market[0], slot: 1.5 });
    expect(a.notice).toBeTruthy();
    expect(Object.keys(a.players[0].facilities)).toHaveLength(CFG.slots);
    let t = dispatch(s, { type: 'pass' });
    t = dispatch(t, { type: 'donePicking' });
    const b = dispatch(t, { type: 'setFee', fee: NaN });
    expect(b.notice).toBeTruthy();
    expect(b.players[0].fee).toBe(t.players[0].fee);
    const c = dispatch(t, { type: 'setFee', fee: 2.6 });
    expect(c.players[0].fee).toBe(3);
  });

  it('dispatch는 이전 상태를 바꾸지 않는다', () => {
    const s = myTurn();
    const before = structuredClone(s);
    dispatch(s, { type: 'buy', cardId: s.market[0], slot: 0 });
    dispatch(s, { type: 'pass' });
    expect(s).toEqual(before);
  });

  it('연구원 할인 후에도 건설비는 최소 minPrice', () => {
    const s = myTurn();
    s.players[0].staff.researcher = 3;
    expect(priceOf(s.players[0], FACILITY_BY_ID[26])).toBe(CFG.minPrice); // 트램폴린 (원본 $1)
  });

  /* ───── 인원·덱·순위 ───── */

  it('인원 수를 지원 범위로 맞추고 AI 성향은 AI 순번으로 읽는다', () => {
    expect(newGame({ aiCount: 0, seed: 1 }).players).toHaveLength(CFG.minPlayers);
    expect(newGame({ aiCount: 9, seed: 1 }).players).toHaveLength(CFG.maxPlayers);
    const s = newGame({ aiCount: 4, seed: 1, profiles: ['builder', 'frugal'] });
    expect(s.players.every((p) => !p.name.includes('undefined'))).toBe(true);
    expect(s.players[1].ai).toBe('builder');
    expect(s.players[2].ai).toBe('frugal');
  });

  it('5인 게임에서도 같은 시설 카드가 두 공원에 동시에 지어지지 않는다', () => {
    let dup = 0;
    probe.roundEnd = (s) => {
      const ids = s.players.flatMap((p) => p.facilities.filter(Boolean).map((f) => f!.id));
      if (new Set(ids).size !== ids.length) dup++;
    };
    for (let seed = 1; seed <= 60; seed++) newGame({ humans: 0, aiCount: 5, seed });
    probe.roundEnd = undefined;
    expect(dup).toBe(0);
  });

  it('VP와 잔액이 모두 같으면 공동 1위', () => {
    const s = newGame({ humans: 0, aiCount: 3, seed: 2 });
    for (const p of s.players) {
      p.vp = 10;
      p.money = 5;
    }
    expect(winners(s)).toHaveLength(3);
    s.players[1].money = 6;
    expect(winners(s).map((p) => p.id)).toEqual([1]);
    expect(rankings(s)[0].id).toBe(1);
  });
});
