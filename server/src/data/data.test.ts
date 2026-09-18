import { describe, expect, it } from 'vitest';
import { SECTORS, SECTOR_CAPACITY, TRACK_MAX, TRACK_MIN } from '../engine/types';
import type { Formation, PlayerSide } from '../engine/types';
import {
  BOARD_CARDS,
  BOARD_DATA,
  EXECUTIVE_CARDS,
  OBJECTIVE_CARDS,
  OPPONENT_CARDS,
  PLAYER_CARDS,
  SPONSOR_CARDS,
  STAFF_CARDS,
  TACTIC_CARDS,
} from './index';

function expectUniqueIds(cards: { id: string }[]) {
  expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
}

function expectValidFormation(f: Formation) {
  expect(f.defenders + f.midfielders + f.forwards).toBe(10);
  for (const n of [f.defenders, f.midfielders, f.forwards]) {
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(5);
  }
}

function expectValidSide(side: PlayerSide) {
  expect(side.cost).toBeGreaterThanOrEqual(1);
  expect(side.cost).toBeLessThanOrEqual(4);
  expect(side.skill).toBeGreaterThanOrEqual(0);
  expect(side.skill).toBeLessThanOrEqual(4);
  for (const z of side.zones) expect(SECTORS).toContain(z);
  if (side.goalkeeper) {
    expect(side.zones).toEqual([]);
    expect(side.goalkeeper.saves).toBeGreaterThanOrEqual(1);
  }
}

describe('구성물 수량 (p.2)', () => {
  it('선수 70 = 주전 36 + 유망주 18 + 베테랑 16 (베테랑은 시장 행이 생겨 원작 8장에서 늘림)', () => {
    const byKind = (k: string) => PLAYER_CARDS.filter((c) => c.kind === k).length;
    expect(byKind('starter')).toBe(36);
    expect(byKind('prospect')).toBe(18);
    expect(byKind('veteran')).toBe(16);
  });
  it('직원 36, 스폰서 36, 이사회 36, 임원 16, 전술 12, 목표 12, 상대 팀 64', () => {
    expect(STAFF_CARDS).toHaveLength(36);
    expect(SPONSOR_CARDS).toHaveLength(36);
    expect(BOARD_CARDS).toHaveLength(36);
    expect(EXECUTIVE_CARDS).toHaveLength(16);
    expect(TACTIC_CARDS).toHaveLength(12);
    expect(OBJECTIVE_CARDS).toHaveLength(12);
    expect(OPPONENT_CARDS).toHaveLength(64);
  });
  it('id 중복 없음', () => {
    for (const cards of [PLAYER_CARDS, STAFF_CARDS, SPONSOR_CARDS, BOARD_CARDS, EXECUTIVE_CARDS, TACTIC_CARDS, OBJECTIVE_CARDS, OPPONENT_CARDS]) {
      expectUniqueIds(cards);
    }
  });
});

describe('선수 카드 (p.15~16, p.22)', () => {
  it('역량 0~4, 비용 1~4, 구획 유효', () => {
    for (const c of PLAYER_CARDS) {
      expectValidSide(c.untrained);
      expectValidSide(c.trained);
    }
  });
  // 사용자 결정(2026-09): 유망주 미훈련 면은 역량 1·비용 1 고정, 공격/수비만 훈련 면과 같게 드러난다
  it('유망주 미훈련 면은 역량 1·비용 1·번호 없음, 역할은 훈련 면과 같고, 이름은 본명', () => {
    const prospects = PLAYER_CARDS.filter((c) => c.kind === 'prospect');
    const byRole = { attack: 0, defense: 0 };
    for (const p of prospects) {
      expect(p.untrained.cost).toBe(1);
      expect(p.untrained.skill).toBe(1);
      expect(p.untrained.number).toBeUndefined();
      expect(p.untrained.effect).toBeUndefined();
      expect(p.untrained.role).toBe(p.trained.role);
      expect(p.untrained.zones).toEqual(p.untrained.role === 'attack' ? ['CM', 'CF'] : ['CB', 'CM']);
      expect(p.name).not.toBe('유망주'); // 데이터는 본명, 화면은 훈련 전 '유망주' (playerName)
      expect(p.trained.number).toBeDefined();
      expect(p.trained.cost).toBe(1);
      expect(p.trained.skill >= 3 || p.trained.effect !== undefined).toBe(true); // 역량 중상 또는 상급 능력
      byRole[p.untrained.role]++;
    }
    expect(byRole).toEqual({ attack: 9, defense: 9 });
  });
  it('주전은 미훈련 역량이 대체로 2이고, 훈련하면 역량이 오르거나 효과가 생긴다', () => {
    const starters = PLAYER_CARDS.filter((c) => c.kind === 'starter');
    expect(starters.filter((c) => c.untrained.skill === 2).length).toBeGreaterThanOrEqual(starters.length / 2);
    for (const c of starters) {
      expect(c.untrained.skill).toBeGreaterThanOrEqual(1);
      expect(c.untrained.skill).toBeLessThanOrEqual(3);
      expect(c.trained.skill > c.untrained.skill || c.trained.effect !== undefined).toBe(true);
      expect(c.trained.cost).toBeLessThanOrEqual(c.untrained.cost);
    }
  });
  it('베테랑은 미훈련 면 역량이 높고(3~4), 페널티(강제 효과 또는 훈련 시 역량 −2 이상)가 있다', () => {
    for (const v of PLAYER_CARDS.filter((c) => c.kind === 'veteran')) {
      expect(v.untrained.skill).toBeGreaterThanOrEqual(3);
      expect(v.untrained.skill).toBeGreaterThan(v.trained.skill);
      const mandatory = v.untrained.effect?.mandatory === true;
      const trainingPenalty = v.untrained.skill - v.trained.skill >= 2;
      expect(mandatory || trainingPenalty).toBe(true);
    }
  });
  it('골키퍼는 양면 모두 골키퍼', () => {
    for (const c of PLAYER_CARDS) {
      expect(Boolean(c.untrained.goalkeeper)).toBe(Boolean(c.trained.goalkeeper));
    }
    expect(PLAYER_CARDS.filter((c) => c.untrained.goalkeeper).length).toBeGreaterThanOrEqual(2);
  });
});

describe('직원 카드 (p.17)', () => {
  it('첫 번째 트레이너 4장, 3+ 카드 존재, 세트 승점 표는 비감소', () => {
    expect(STAFF_CARDS.filter((s) => s.job === '첫 번째 트레이너')).toHaveLength(4);
    expect(STAFF_CARDS.some((s) => s.minPlayers === 3)).toBe(true);
    for (const s of STAFF_CARDS) {
      const [a, b, c, d] = s.setPoints;
      expect(a <= b && b <= c && c <= d).toBe(true);
    }
  });
});

describe('임원 카드 (p.7)', () => {
  it('주사위 6면 투표, 트랙 조정 범위', () => {
    for (const e of EXECUTIVE_CARDS) {
      expect(e.votes).toHaveLength(6);
      for (const d of Object.values(e.trackAdjust)) {
        expect(Math.abs(d)).toBeLessThanOrEqual(TRACK_MAX - TRACK_MIN);
      }
    }
  });
});

describe('이사회 카드 (p.13)', () => {
  it('세 가지 결정 모두 존재', () => {
    for (const b of BOARD_CARDS) {
      for (const color of ['yellow', 'blue', 'red'] as const) {
        expect(b.decisions[color].effects.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('전술 카드 (p.20, p.28)', () => {
  it('기본 전술 4장(포메이션 2개), 나머지 1개 + 효과', () => {
    const basic = TACTIC_CARDS.filter((t) => t.basic);
    expect(basic.length).toBeGreaterThanOrEqual(4);
    for (const t of TACTIC_CARDS) {
      expect(t.formations.length).toBe(t.basic ? 2 : 1);
      if (!t.basic) expect(t.effect).toBeDefined();
      t.formations.forEach(expectValidFormation);
    }
  });
});

describe('상대 팀 카드 (p.21, p.28)', () => {
  it('16팀 × 4장, 부 덱마다 8팀 × 2장 = 16장', () => {
    const teams = new Set(OPPONENT_CARDS.map((o) => o.teamId));
    expect(teams.size).toBe(16);
    for (const teamId of teams) {
      const tiers = OPPONENT_CARDS.filter((o) => o.teamId === teamId).map((o) => o.tier);
      expect(tiers).toHaveLength(4);
      expect(new Set(tiers).size).toBe(2);
    }
    for (const tier of ['3', '3/2', '2/1', '1'] as const) {
      const deck = OPPONENT_CARDS.filter((o) => o.tier === tier);
      expect(deck).toHaveLength(16);
      expect(new Set(deck.map((o) => o.teamId)).size).toBe(8);
    }
  });
  it('구획 배치가 포메이션·수용 인원과 일치', () => {
    for (const o of OPPONENT_CARDS) {
      expectValidFormation(o.formation);
      let total = 0;
      for (const s of SECTORS) {
        const slots = o.sectors[s];
        expect(slots.length).toBeLessThanOrEqual(SECTOR_CAPACITY[s]);
        total += slots.length;
        for (const slot of slots) {
          expect(slot.skill).toBeGreaterThanOrEqual(0);
          expect(slot.skill).toBeLessThanOrEqual(4);
        }
      }
      expect(total).toBe(10);
      expect(o.goalkeeper.saves).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('보드 수치', () => {
  it('사무실 트랙 (p.19)', () => {
    expect(BOARD_DATA.office.map((s) => s.vp)).toEqual([0, 2, 5, 9, 15]);
    expect(BOARD_DATA.office.map((s) => s.cost)).toEqual([3, 5, 5, 7, 0]);
  });
  it('조달 트랙은 위치 1~5, 기반 시설 7종 (p.19)', () => {
    for (const row of Object.values(BOARD_DATA.procurement)) expect(row).toEqual([1, 2, 3, 4, 5]); // 조달량 = 트랙 위치 (사용자 결정)
    expect(BOARD_DATA.infrastructure).toHaveLength(7);
    expect(BOARD_DATA.infrastructure.filter((i) => i.unique).map((i) => i.type).sort()).toEqual(['billboard3', 'stand3', 'stand4']);
  });
});
