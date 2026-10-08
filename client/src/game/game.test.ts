import { describe, expect, it } from 'vitest';
import type { GameState, RoomInfo } from '@rootbound/shared';
import { START_HAND, applyAction, autoAction, computeScores, legalPlantCells, maskState } from '@rootbound/shared';
import { formatRemaining, localDeadline, turnTimeLabel } from '../lib/turnClock';
import { buildCells, buildPlayerSummaries, legalKeys, previewPlant } from './derived';
import { confirmAllHotseat, createHotseatGame, hotseatPlayerId } from './hotseat';
import { tutorialBotAction } from './tutorialBot';

/** 공개 단계를 모두 확인해 1라운드 가져오기 차례(자리 0)에서 시작한 2인 판 */
const twoPlayers = () => confirmAllHotseat(createHotseatGame({ nicknames: ['나', '연습 봇'], seed: 20261007 })).state;

/** 자동 수로 p0 의 심기 차례까지 진행한다 */
function toPlantStage(start: GameState): GameState {
  let s = start;
  for (let i = 0; i < 10 && !(s.stage === 'plant' && s.currentPlayerId === 'p0'); i++) s = applyAction(s, autoAction(s, s.currentPlayerId!)!).state;
  return s;
}


describe('핫시트 어댑터', () => {
  it('2~4명이 앉아 모두 준비하면 이번 판 식물 공개 단계가 되고, 한 번에 모두 확인하면 1라운드 가져오기가 시작된다', () => {
    for (const n of [2, 3, 4]) {
      const s = createHotseatGame({ nicknames: Array.from({ length: n }, (_, i) => `P${i}`), seed: n });
      expect(s.phase).toBe('reveal');
      expect(s.currentPlayerId).toBeNull();
      expect(s.players).toHaveLength(n);
      expect(s.players.every((p) => p.hand.length === START_HAND && !p.isReady)).toBe(true);
      const r = confirmAllHotseat(s);
      expect(r.error).toBeUndefined();
      expect(r.state.phase).toBe('playing');
      expect(r.state.stage).toBe('take');
      expect(r.state.currentPlayerId).toBe(hotseatPlayerId(0));
      expect(r.state.market).toHaveLength(n);
    }
    expect(() => createHotseatGame({ nicknames: ['혼자'], seed: 1 })).toThrow();
  });

  it('빈 닉네임은 "플레이어 N" 으로 채운다', () => {
    const s = createHotseatGame({ nicknames: ['갑', ' '], seed: 1 });
    expect(s.players.map((p) => p.nickname)).toEqual(['갑', '플레이어 2']);
  });
});

describe('튜토리얼 연습 봇', () => {
  it('처음부터 끝까지 항상 엔진이 받아 주는 수를 둔다 (사람 좌석도 봇으로 대신)', () => {
    let s = createHotseatGame({ nicknames: ['나', '연습 봇'], seed: 20261007 });
    for (const p of s.players) {
      const confirm = tutorialBotAction(s, p.id);
      expect(confirm?.type).toBe('CONFIRM');
      s = applyAction(s, confirm!).state;
    }
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

  it('가져오기 차례에는 TAKE, 심기 차례에는 take 없는 PLANT 를 보낸다', () => {
    const s = twoPlayers();
    const action = tutorialBotAction(s, s.currentPlayerId!);
    expect(action?.type).toBe('TAKE');
    expect(applyAction(s, action!).error).toBeUndefined();
    const plant = toPlantStage(s);
    const a2 = tutorialBotAction(plant, 'p0');
    expect(a2?.type).toBe('PLANT');
    expect(a2 && 'take' in a2).toBe(false);
    expect(applyAction(plant, a2!).error).toBeUndefined();
  });
});

describe('화면용 파생값', () => {
  it('칸 목록은 보드 칸 수와 같고, 입구에는 좌석이 표시된다', () => {
    const s = twoPlayers();
    const cells = buildCells(maskState(s, 'p0'));
    expect(cells).toHaveLength(49);
    expect(cells.filter((c) => c.entranceSeat >= 0)).toHaveLength(2);
  });

  it('심을 수 있는 칸 key 는 엔진 legalPlantCells 와 같다', () => {
    const s = twoPlayers();
    const me = s.players[0]!;
    const keys = legalKeys(maskState(s, 'p0'), 'p0', me.hand[0]!);
    expect(keys.size).toBe(legalPlantCells(s, 'p0', me.hand[0]!).length);
  });

  it('미리보기: 심었을 때 점수 변화가 실제 엔진 결과와 같다', () => {
    const s = toPlantStage(twoPlayers());
    const action = autoAction(s, 'p0')!;
    if (action.type !== 'PLANT') throw new Error('심기가 아님');
    const pv = previewPlant(s, 'p0', action.species, action.pos, action.direction ?? null, null)!;
    const before = computeScores(s);
    const after = computeScores(applyAction(s, action).state);
    expect(pv.scoreDelta[0]).toBe(after['p0']!.total - before['p0']!.total);
    expect(pv.landDelta[0]).toBe(after['p0']!.land - before['p0']!.land);
  });

  it('플레이어 요약: 좌석 순, 점수 포함, 가려진 손패는 장수만', () => {
    const s = twoPlayers();
    const rows = buildPlayerSummaries(maskState(s, 'p0'));
    expect(rows.map((r) => r.seat)).toEqual([0, 1]);
    expect(rows[1]!.handCount).toBe(START_HAND);
    expect(rows[0]!.plantedSpecies).toEqual([]);
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

describe('핫시트 상태 보존 (2026-10-07 리뷰)', () => {
  it('maskState(null) 을 거쳐 다시 엔진에 넣어도 카드 더미가 남아 끝까지 15번씩 둔다', () => {
    let s = maskState(twoPlayers(), null) as unknown as GameState;
    for (let i = 0; i < 300 && s.phase !== 'finished'; i++) {
      const a = autoAction(s, s.currentPlayerId!)!;
      s = maskState(applyAction(s, a).state, null) as unknown as GameState;
    }
    expect(s.phase).toBe('finished');
    expect(s.plants.length + s.log.filter((e) => e.kind === 'discard').length).toBe(30);
  });
});
