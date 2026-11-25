import { describe, expect, it } from 'vitest';
import {
  CFG,
  bestPlacement,
  bidOrder,
  computeReport,
  dispatch,
  newGame,
  placeSat,
  placementError,
  rankings,
  seatMoney,
  winners,
} from '../src/engine/engine';
import { CARDS, CARD_BY_ID } from '../src/engine/data/cards';
import { EVENT_BY_ID } from '../src/engine/data/events';
import { GROUPS, GROUP_BY_ID } from '../src/engine/data/groups';
import type { GameState, Player } from '../src/engine/types';

/** 사람 1 + AI 1 게임을 홍보 입찰 단계까지 진행 */
function toBid(seed: number) {
  let s = newGame({ aiCount: 1, seed });
  while (s.phase === 'construct') s = dispatch(s, { type: 'pass' });
  return s;
}

/** 테스트용: 사람 플레이어 공원을 직접 세팅 */
function park(s: GameState, ids: number[]): Player {
  const p = s.players[0];
  p.facilities = Array(CFG.slots).fill(null);
  ids.forEach((id, i) => (p.facilities[i] = { id, repair: false }));
  return p;
}
const byName = (name: string) => CARDS.find((c) => c.name === name)!;
const groupOf = (name: string, fav?: string) => GROUPS.find((g) => g.name === name && (!fav || g.fav === fav))!;

describe('카드 데이터', () => {
  it('시설 50장, 관객 그룹 28장(취향마다 4장), 인쇄값은 작은 정수', () => {
    expect(CARDS).toHaveLength(50);
    expect(GROUPS).toHaveLength(28);
    for (const c of CARDS) {
      expect(c.cost).toBeGreaterThanOrEqual(2);
      if (c.kind === 'ride') {
        expect([2, 3, 4]).toContain(c.cap);
        expect([2, 3]).toContain(c.sat);
      }
    }
    for (const g of GROUPS) {
      expect(g.kids + g.adults).toBeGreaterThanOrEqual(1);
      expect(g.kids + g.adults).toBeLessThanOrEqual(4);
      expect(g.budget).toBeGreaterThanOrEqual(1);
      expect(g.budget).toBeLessThanOrEqual(CFG.maxFee);
    }
  });

  it('놀이기구 대상: 원본 어린이/성인 만족도 차이 3 이상이면 전용', () => {
    expect(byName('롤러코스터').target).toBe('adult');
    expect(byName('미끄럼틀').target).toBe('child');
    expect(byName('범퍼카').target).toBe('all');
  });
});

describe('게임 흐름', () => {
  it('AI끼리 8라운드를 끝까지 진행하고 순위가 나온다', () => {
    for (const n of [2, 3, 4, 5]) {
      const s = newGame({ humans: 0, aiCount: n, seed: 42 + n });
      expect(s.phase).toBe('gameOver');
      expect(s.round).toBe(CFG.rounds);
      expect(rankings(s)).toHaveLength(n);
    }
  });

  it('같은 시드는 같은 결과를 낸다 (재현성)', () => {
    expect(newGame({ humans: 0, aiCount: 3, seed: 7 })).toEqual(newGame({ humans: 0, aiCount: 3, seed: 7 }));
  });

  it('한 라운드: 건설 → 홍보(입찰·모집) → 운영(입장료·배치·결과) → 관리 → 다음 라운드', () => {
    let s = toBid(5);
    expect(s.phase).toBe('promote');
    expect(s.step).toBe('bid');
    expect(s.groupRow.length).toBe(2 * CFG.rowPerPlayer); // 입찰 전에 관객 줄이 공개된다
    s = dispatch(s, { type: 'bid', amount: 0 });
    expect(s.step).toBe('pick');
    while (s.phase === 'promote') s = dispatch(s, { type: 'donePicking' });
    expect(s.phase).toBe('operate');
    expect(s.step).toBe('fee');
    s = dispatch(s, { type: 'confirmFee' });
    expect(s.step).toBe('place');
    s = dispatch(s, { type: 'confirmPlace' });
    expect(s.step).toBe('result');
    s = dispatch(s, { type: 'continue' });
    expect(s.phase).toBe('manage');
    s = dispatch(s, { type: 'endManage' });
    expect(s.round).toBe(2);
    expect(s.phase).toBe('construct');
  });

  it('잘못된 단계의 행동은 상태를 바꾸지 않고 notice만 남긴다', () => {
    const s = newGame({ aiCount: 1, seed: 3 });
    const t = dispatch(s, { type: 'confirmPlace' });
    expect(t.notice).toBeTruthy();
    expect({ ...t, notice: null }).toEqual({ ...s, notice: null });
  });

  it('dispatch는 이전 상태를 바꾸지 않는다', () => {
    const s = newGame({ aiCount: 1, seed: 9 });
    const snap = structuredClone(s);
    dispatch(s, { type: 'pass' });
    expect(s).toEqual(snap);
  });

  it('건설은 라운드당 buildsPerRound장까지', () => {
    let s = newGame({ aiCount: 1, seed: 21 });
    if (s.turn !== 0) s = dispatch(s, { type: 'pass' }); // 혹시 차례가 아니면 이번 라운드는 넘긴다
    s.players[0].money = 99;
    for (let i = 0; i < CFG.buildsPerRound && s.phase === 'construct'; i++) {
      if (s.turn !== 0) break;
      s = dispatch(s, { type: 'buy', cardId: s.market[0], slot: i });
    }
    expect(s.players[0].built).toBeLessThanOrEqual(CFG.buildsPerRound);
    expect(s.passed[0] || s.phase !== 'construct').toBe(true);
  });

  it('시작 자금: 1라운드 순서가 늦을수록 seatMoney씩 더 받는다', () => {
    expect(seatMoney(0)).toBe(0);
    expect(seatMoney(3)).toBe(3 * CFG.seatMoney);
    // 사람이 선인 시드를 찾아 시작 자금 확인 (첫 행동 전)
    for (let seed = 1; seed < 50; seed++) {
      const s = newGame({ aiCount: 2, seed });
      if (s.startFirst !== 0) continue;
      expect(s.players[0].money).toBe(CFG.startMoney);
      return;
    }
    throw new Error('사람이 선인 시드를 찾지 못함');
  });
});

describe('홍보 입찰', () => {
  it('많이 낸 순서, 동점이면 선 플레이어에서 먼 쪽이 먼저', () => {
    const s = newGame({ humans: 0, aiCount: 3, seed: 4 });
    s.first = 0;
    s.players[0].bid = 2;
    s.players[1].bid = 2;
    s.players[2].bid = 5;
    expect(bidOrder(s)).toEqual([2, 1, 0]);
  });

  it('입찰액은 은행으로 가고, 가진 돈보다 많이 낼 수 없다', () => {
    let s = toBid(12);
    const money = s.players[0].money;
    expect(dispatch(s, { type: 'bid', amount: money + 1 }).notice).toBeTruthy();
    s = dispatch(s, { type: 'bid', amount: 1 });
    expect(s.players[0].money).toBe(money - 1);
  });

  it('모집 수만큼 가져오면 내 모집이 끝난다', () => {
    let s = toBid(11);
    s = dispatch(s, { type: 'bid', amount: 0 });
    while (s.phase === 'promote' && !s.pickDone[0]) {
      const open = s.groupRow.find((r) => r.by === null)!;
      s = dispatch(s, { type: 'pickGroup', groupId: open.g });
    }
    expect(s.players[0].groups.length).toBeLessThanOrEqual(CFG.baseGroups + (s.event?.groupDelta ?? 0));
  });
});

describe('운영 계산', () => {
  function opState(cards: number[], groups: number[], fee = 0, eventId = 8) {
    const s = newGame({ humans: 0, aiCount: 2, seed: 1 });
    s.phase = 'operate';
    s.step = 'place';
    s.event = EVENT_BY_ID[eventId]; // 기본: 인플루언서 방문(놀이기구 보정 없음)
    const p = park(s, cards);
    p.staff = { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 };
    p.groups = groups;
    p.place = groups.map(() => null);
    p.fee = fee;
    p.money = 10;
    return { s, p };
  }

  it('만족도 = 1명당 만족도 × 대상 인원 + 취향 일치 보너스', () => {
    const { s, p } = opState([byName('범퍼카').id], []);
    const c = byName('범퍼카'); // 정원 3, 모두, 2
    const couple = groupOf('커플', '공포형');
    expect(placeSat(s, p, c, couple)).toBe(2 * 2);
    const thrillCouple = groupOf('커플', '스릴형');
    expect(placeSat(s, p, c, thrillCouple)).toBe(2 * 2 + CFG.favBonus + 2); // 범퍼카: 취향 일치 +2 추가
  });

  it('전용 놀이기구는 대상 인원만 센다', () => {
    const { s, p } = opState([], []);
    const kid = byName('미끄럼틀'); // 어린이 전용
    const parent = groupOf('부모와 아이', '어드벤처형');
    expect(placeSat(s, p, kid, parent)).toBe(kid.sat * 1);
  });

  it('정원 초과 배치 불가, 안내 직원이 있으면 정원 +1명까지', () => {
    const big = groupOf('가족', '패밀리형'); // 4명
    const { s, p } = opState([byName('범퍼카').id], [big.id]);
    expect(placementError(s, p, [0])).toBeTruthy();
    p.staff.guide = 1;
    expect(placementError(s, p, [0])).toBeNull();
  });

  it('놀이기구 1곳에는 그룹 1개만', () => {
    const a = groupOf('혼자 온 손님', '스릴형');
    const b = groupOf('혼자 온 손님', '공포형');
    const { s, p } = opState([byName('범퍼카').id], [a.id, b.id]);
    expect(placementError(s, p, [0, 0])).toBeTruthy();
  });

  it('지불 한도가 입장료보다 낮은 그룹은 돌아가고, 입장료는 인원 × 1인 요금', () => {
    const fam = groupOf('가족', '패밀리형'); // $2, 4명
    const solo = groupOf('혼자 온 손님', '스릴형'); // $3, 1명
    const { s, p } = opState([], [fam.id, solo.id], 3);
    const r = computeReport(s, p);
    expect(r.turnedBack.map((g) => g.id)).toEqual([fam.id]);
    expect(r.feeIncome).toBe(3 * 1);
  });

  it('놀이기구를 못 탄 그룹은 만족도 -unplacedSat', () => {
    const solo = groupOf('혼자 온 손님', '스릴형');
    const { s, p } = opState([], [solo.id]);
    const r = computeReport(s, p);
    expect(r.unplaced).toHaveLength(1);
    expect(r.sat).toBe(-CFG.unplacedSat);
  });

  it('상점: 입장 그룹 1개당 수익, 돈을 번 상점마다 쓰레기 1개', () => {
    const shop = byName('맛있는 푸드코트');
    const g1 = groupOf('커플', '스릴형');
    const g2 = groupOf('커플', '공포형');
    const { s, p } = opState([shop.id], [g1.id, g2.id]);
    const r = computeReport(s, p);
    expect(r.shopIncome).toBe(shop.income * 2);
    expect(r.trashAdded).toBe(1);
  });

  it('정원을 꽉 채운 놀이기구는 수리 토큰을 받고, 다음 라운드에 쓸 수 없다', () => {
    let s = toBid(31);
    s = dispatch(s, { type: 'bid', amount: 0 });
    while (s.phase === 'promote') s = dispatch(s, { type: 'donePicking' });
    // 사람 공원에 정원 2 놀이기구를 두고 2명 그룹을 직접 배치
    const p = park(s, [byName('구름 놀이터').id]);
    const pair = groupOf('형제자매', '놀이형');
    p.groups = [pair.id];
    p.fee = 0;
    s = dispatch(s, { type: 'confirmFee' });
    s = dispatch(s, { type: 'place', index: 0, slot: 0 });
    expect(s.notice).toBeNull();
    s = dispatch(s, { type: 'confirmPlace' });
    expect(s.players[0].report!.places[0].wear).toBe(true);
    expect(s.players[0].facilities[0]!.repair).toBe(true);
  });

  it('스윙 세트는 수리 토큰을 받지 않는다', () => {
    const swing = byName('스윙 세트');
    expect(swing.fx.noRepair).toBe(true);
  });

  it('추천 배치는 규칙에 맞고 만족도를 최대로 한다', () => {
    const fam = groupOf('가족', '패밀리형');
    const solo = groupOf('혼자 온 손님', '스릴형');
    const { s, p } = opState([byName('범퍼카').id, byName('수중 미끄럼틀').id], [fam.id, solo.id]);
    const best = bestPlacement(s, p);
    expect(placementError(s, p, best.place)).toBeNull();
    expect(best.place[0]).toBe(1); // 가족(4명)은 정원 4인 수중 미끄럼틀에만 들어간다
    expect(best.place[1]).toBe(0);
  });

  it('이벤트: 맑은 날씨는 야외 놀이기구 배치마다 +1, 실내는 그대로', () => {
    const { s, p } = opState([], [], 0, 1);
    const g = groupOf('커플', '어드벤처형');
    expect(placeSat(s, p, byName('범퍼카'), g)).toBe(2 * 2 + 1);
    expect(placeSat(s, p, byName('유령의 집'), g)).toBe(2 * 2);
  });

  it('유지비를 다 못 내면 모자란 $1마다 만족도 -1, 돈은 0', () => {
    const { s, p } = opState([byName('롤러코스터').id], []);
    p.money = 1;
    const r = computeReport(s, p);
    expect(r.debtSat).toBe(byName('롤러코스터').upkeep - 1);
  });
});

describe('관리·종료', () => {
  it('인력은 라운드당 1명만 고용할 수 있다', () => {
    let s = toBid(41);
    s = dispatch(s, { type: 'bid', amount: 0 });
    while (s.phase === 'promote') s = dispatch(s, { type: 'donePicking' });
    s = dispatch(s, { type: 'confirmFee' });
    s = dispatch(s, { type: 'confirmPlace' });
    s = dispatch(s, { type: 'continue' });
    s.players[0].money = 50;
    s = dispatch(s, { type: 'hire', staff: 'marketer' });
    expect(s.players[0].staff.marketer).toBe(1);
    s = dispatch(s, { type: 'hire', staff: 'engineer' });
    expect(s.notice).toBeTruthy();
    expect(s.players[0].staff.engineer).toBe(0);
  });

  it('남은 쓰레기 1개마다 만족도 -1, 치우지 않으면 다음 라운드에도 다시 감점', () => {
    let s = toBid(51);
    s = dispatch(s, { type: 'bid', amount: 0 });
    while (s.phase === 'promote') s = dispatch(s, { type: 'donePicking' });
    s = dispatch(s, { type: 'confirmFee' });
    s = dispatch(s, { type: 'confirmPlace' });
    s = dispatch(s, { type: 'continue' });
    s.players[0].trash = 3;
    const vp = s.players[0].vp;
    s = dispatch(s, { type: 'endManage' });
    expect(s.players[0].vp).toBe(vp - 3);
    expect(s.players[0].trash).toBe(3);
  });

  it('게임 종료 시 남은 돈 moneyPerVp마다 만족도 +1', () => {
    const s = newGame({ humans: 0, aiCount: 3, seed: 77 });
    for (const p of s.players) expect(p.endBonus).toBe(Math.floor(p.money / CFG.moneyPerVp));
  });

  it('만족도와 잔액이 모두 같으면 공동 1위', () => {
    const s = newGame({ humans: 0, aiCount: 3, seed: 8 });
    s.players.forEach((p) => {
      p.vp = 50;
      p.money = 5;
    });
    expect(winners(s)).toHaveLength(3);
  });

  it('인원 수를 지원 범위로 맞추고 AI 성향은 AI 순번으로 읽는다', () => {
    expect(newGame({ aiCount: 9, seed: 1 }).players).toHaveLength(CFG.maxPlayers);
    expect(newGame({ humans: 0, aiCount: 1, seed: 1 }).players).toHaveLength(CFG.minPlayers);
    const s = newGame({ humans: 1, aiCount: 2, seed: 1, profiles: ['frugal', 'promoter'] });
    expect(s.players.map((p) => p.ai)).toEqual([undefined, 'frugal', 'promoter']);
  });

  it('5인 게임에서도 같은 시설 카드가 두 공원에 동시에 지어지지 않는다', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = newGame({ humans: 0, aiCount: 5, seed });
      const ids = s.players.flatMap((p) => p.facilities.filter(Boolean).map((f) => f!.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('그룹 카드와 카드 id 조회가 일치한다', () => {
    for (const g of GROUPS) expect(GROUP_BY_ID[g.id]).toBe(g);
    for (const c of CARDS) expect(CARD_BY_ID[c.id]).toBe(c);
  });
});
