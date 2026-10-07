import { describe, expect, it } from 'vitest';
import type { GameState, RoomInfo } from '@rootbound/shared';
import { applyAction, autoAction, computeScores, legalPlantCells, maskState } from '@rootbound/shared';
import { formatRemaining, localDeadline, turnTimeLabel } from '../lib/turnClock';
import { buildCells, buildPlayerSummaries, legalKeys, previewPlant } from './derived';
import { createHotseatGame, hotseatPlayerId } from './hotseat';
import { tutorialBotAction } from './tutorialBot';

const twoPlayers = () => createHotseatGame({ nicknames: ['나', '연습 봇'], seed: 20261007 });

function finishDraft(s: GameState): GameState {
  while (s.phase === 'drafting') s = applyAction(s, autoAction(s, s.currentPlayerId!)!).state;
  return s;
}

describe('핫시트 어댑터', () => {
  it('2~4명이 앉아 모두 준비하면 드래프트가 시작된다', () => {
    for (const n of [2, 3, 4]) {
      const s = createHotseatGame({ nicknames: Array.from({ length: n }, (_, i) => `P${i}`), seed: n });
      expect(s.phase).toBe('drafting');
      expect(s.players).toHaveLength(n);
    }
    expect(() => createHotseatGame({ nicknames: ['혼자'], seed: 1 })).toThrow();
  });

  it('빈 닉네임은 "플레이어 N" 으로 채운다', () => {
    const s = createHotseatGame({ nicknames: ['갑', ' '], seed: 1 });
    expect(s.players.map((p) => p.nickname)).toEqual(['갑', '플레이어 2']);
  });
});

describe('튜토리얼 연습 봇', () => {
  it('드래프트부터 끝까지 항상 엔진이 받아 주는 수를 둔다 (사람 좌석도 봇으로 대신)', () => {
    let s = twoPlayers();
    for (let i = 0; i < 200 && s.phase !== 'finished'; i++) {
      const action = tutorialBotAction(s, s.currentPlayerId!);
      expect(action).not.toBeNull();
      const r = applyAction(s, action!);
      expect(r.error).toBeUndefined();
      s = r.state;
    }
    expect(s.phase).toBe('finished');
    expect(s.plants.some((p) => p.ownerId === hotseatPlayerId(1))).toBe(true);
  });

  it('드래프트에서는 공개 목표의 연계 종을 먼저 고른다', () => {
    const s = twoPlayers();
    const action = tutorialBotAction(s, s.currentPlayerId!);
    expect(action?.type).toBe('DRAFT');
  });
});

describe('화면용 파생값', () => {
  it('칸 목록은 보드 칸 수와 같고, 입구에는 좌석이 표시된다', () => {
    const s = finishDraft(twoPlayers());
    const cells = buildCells(maskState(s, 'p0'));
    expect(cells).toHaveLength(49);
    expect(cells.filter((c) => c.entranceSeat >= 0)).toHaveLength(2);
  });

  it('심을 수 있는 칸 key 는 엔진 legalPlantCells 와 같다', () => {
    const s = finishDraft(twoPlayers());
    const me = s.players[0]!;
    const keys = legalKeys(maskState(s, 'p0'), 'p0', me.hand[0]!);
    expect(keys.size).toBe(legalPlantCells(s, 'p0', me.hand[0]!).length);
  });

  it('미리보기: 심었을 때 점수 변화가 실제 엔진 결과와 같다', () => {
    const s = finishDraft(twoPlayers());
    const action = autoAction(s, 'p0')!;
    if (action.type !== 'PLANT') throw new Error('심기가 아님');
    const pv = previewPlant(s, 'p0', action.species, action.pos, action.direction ?? null, null)!;
    const before = computeScores(s);
    const after = computeScores(applyAction(s, action).state);
    expect(pv.scoreDelta[0]).toBe(after['p0']!.total - before['p0']!.total);
    expect(pv.landDelta[0]).toBe(after['p0']!.land - before['p0']!.land);
  });

  it('플레이어 요약: 좌석 순, 점수 포함, 가려진 손패는 장수만', () => {
    const s = finishDraft(twoPlayers());
    const rows = buildPlayerSummaries(maskState(s, 'p0'));
    expect(rows.map((r) => r.seat)).toEqual([0, 1]);
    expect(rows[1]!.handCount).toBe(3);
    expect(rows[0]!.score?.total).toBe(computeScores(s)['p0']!.total);
  });
});

describe('제한 시간 표시 (Rules.md 6.3)', () => {
  const room = (deadline: number | null, serverNow: number): RoomInfo => ({
    roomId: 'r',
    hostId: 'p1',
    hasPassword: false,
    createdAt: 0,
    connected: [],
    turnTimeLimitSec: 90,
    turnDeadline: deadline,
    serverNow,
    autopilot: [],
  });

  it('서버 시계와의 차이를 보정해 내 시계 기준 마감을 낸다', () => {
    expect(localDeadline(room(105_000, 75_000), 70_000)).toBe(100_000);
    expect(localDeadline(room(null, 75_000), 70_000)).toBeNull();
    expect(localDeadline(null, 70_000)).toBeNull();
  });

  it('표기', () => {
    expect(turnTimeLabel(90)).toBe('90초');
    expect(turnTimeLabel(180)).toBe('3분');
    expect(turnTimeLabel(null)).toBe('없음');
    expect(formatRemaining(75)).toBe('1:15');
    expect(formatRemaining(9)).toBe('9초');
  });
});
