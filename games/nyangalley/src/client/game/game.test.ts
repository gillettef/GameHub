import { describe, expect, it } from 'vitest';
import { tutorialBotAction } from '../../ai/tutorial';
import { def } from '../../def';
import type { GameState, Plant } from '../../engine';
import {
  START_HAND,
  applyAction,
  autoAction,
  computeScores,
  computeOwners,
  legalCallCells,
  legalPlantCells,
  maskState,
  rulesFor,
} from '../../engine';
import { formatRemaining, localDeadline, turnTimeLabel } from '../lib/turnClock';
import type { RoomInfo } from '../store/gameStore';
import { buildCells, buildPlayerSummaries, legalKeys, previewCall, previewPlant, roundStageLabel, stageName } from './derived';

const hotseatPlayerId = (seat: number) => `p${seat}`;

/** 한 기기 판의 시작 상태(사람 자리만, 이번 판 식물 공개 단계) — def.setup 이 옛 핫시트 어댑터를 대신한다 */
function createHotseatGame({ nicknames, seed }: { nicknames: string[]; seed: number }): GameState {
  return def.setup({ seats: nicknames.map((name) => ({ kind: 'human' as const, name })), seed, options: { turnTime: null, tutorial: false } }).game;
}

/** 공개 단계에서 아직 확인하지 않은 사람을 자리 순서로 모두 확인한다(한 기기의 '확인하고 시작') */
function confirmAllHotseat(state: GameState): { state: GameState; error?: string } {
  let s = state;
  for (const p of state.players) {
    if (s.phase !== 'reveal' || p.isReady || p.surrenderedOrder !== null) continue;
    const r = applyAction(s, { type: 'CONFIRM', playerId: p.id });
    if (r.error) return { state, error: r.error };
    s = r.state;
  }
  return { state: s };
}

/** 공개 단계를 모두 확인해 1라운드 행동 고르기 차례(자리 0)에서 시작한 2인 판 */
const twoPlayers = () => confirmAllHotseat(createHotseatGame({ nicknames: ['나', '연습 봇'], seed: 20261007 })).state;

/** p0 의 칸 위에 명당 하나(p1 이 놓은 것)를 둔 상태 */
function withPlantOnMyLand(s: GameState): GameState {
  const c = computeOwners(s).findIndex((o) => o === 0);
  const plant: Plant = { id: 't0', species: 'grass', ownerId: 'p1', pos: { q: s.board!.cells[c]!.q, r: s.board!.cells[c]!.r }, rotation: 0 };
  return { ...s, plants: [plant] };
}

describe('한 기기 판 시작 (def.setup)', () => {
  it('2~4명이 앉아 모두 준비하면 이번 판 식물 공개 단계가 되고, 한 번에 모두 확인하면 1라운드 행동 고르기가 시작된다', () => {
    for (const n of [2, 3, 4]) {
      const s = createHotseatGame({ nicknames: Array.from({ length: n }, (_, i) => `P${i}`), seed: n });
      expect(s.phase).toBe('reveal');
      expect(s.currentPlayerId).toBeNull();
      expect(s.players).toHaveLength(n);
      expect(s.players.every((p) => p.hand.length === START_HAND && !p.isReady)).toBe(true);
      const r = confirmAllHotseat(s);
      expect(r.error).toBeUndefined();
      expect(r.state.phase).toBe('playing');
      expect(r.state.stage).toBe('act');
      expect(r.state.round).toBe(1);
      expect(r.state.currentPlayerId).toBe(hotseatPlayerId(0));
      expect(r.state.market).toHaveLength(rulesFor(n).market);
    }
    expect(() => createHotseatGame({ nicknames: ['혼자'], seed: 1 })).toThrow();
  });
});

describe('튜토리얼 연습 봇', () => {
  it('처음부터 끝까지 항상 엔진이 받아 주는 수를 둔다 (사람 자리도 봇으로 대신)', () => {
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

  it('손 맨 앞 타일을 놓을 수 있으면 PLANT, 아니면 TAKE 를 보낸다', () => {
    const s = twoPlayers();
    const a = tutorialBotAction(s, 'p0');
    expect(a?.type).toBe(legalPlantCells(s, 'p0', s.players[0]!.hand[0]!).length ? 'PLANT' : 'TAKE');
    expect(applyAction(s, a!).error).toBeUndefined();
    const empty: GameState = { ...s, players: s.players.map((p) => (p.id === 'p0' ? { ...p, hand: [] } : p)) };
    const t = tutorialBotAction(empty, 'p0');
    expect(t?.type).toBe('TAKE');
    const second = applyAction(empty, t!).state;
    expect(second.stage).toBe('take');
    expect(tutorialBotAction(second, 'p0')?.type).toBe('TAKE');
  });
});

describe('화면용 파생값', () => {
  it('칸 목록은 보드 칸 수와 같고, 입구에는 자리가 표시된다', () => {
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
    const s = twoPlayers();
    const action = autoAction(s, 'p0')!;
    if (action.type !== 'PLANT') throw new Error('심기가 아님');
    const pv = previewPlant(s, 'p0', action.species, action.pos, action.rotation ?? 0, null)!;
    const before = computeScores(s);
    const next = applyAction(s, action).state;
    const after = computeScores(next);
    expect(pv.scoreDelta[0]).toBe(after['p0']!.total - before['p0']!.total);
    expect(pv.landDelta[0]).toBe(after['p0']!.land - before['p0']!.land);
    // 바뀌는 칸의 고양이 수가 엔진 결과와 같다
    for (const [key, [, n]] of pv.touched) {
      const c = s.board!.cells.findIndex((x) => `${x.q},${x.r}` === key);
      expect(next.rootCount[c]).toBe(n);
    }
  });

  it('명당 부르기 미리보기: 결과가 엔진 CALL 결과와 같다', () => {
    const s = withPlantOnMyLand(twoPlayers());
    const pos = legalCallCells(s, 'p0')[0]!;
    const rotation = 1 as const;
    const r = applyAction(s, { type: 'CALL', playerId: 'p0', pos, rotation });
    expect(r.error).toBeUndefined();
    const pv = previewCall(maskState(s, 'p0'), 'p0', pos, rotation)!;
    expect(pv.scoreDelta[0]).toBe(computeScores(r.state)['p0']!.total - computeScores(s)['p0']!.total);
    expect(pv.landDelta[0]).toBe(computeScores(r.state)['p0']!.land - computeScores(s)['p0']!.land);
  });

  it('단계 이름과 라운드 표기: N/20라운드 · 행동 고르기', () => {
    const s = twoPlayers();
    expect(roundStageLabel(s)).toBe(`1/${rulesFor(2).rounds}라운드 · 행동 고르기`);
    expect(stageName('act')).toBe('행동 고르기');
    expect(stageName('take')).toBe('가져오기');
  });

  it('플레이어 요약: 자리 순, 점수 포함, 가려진 손패는 장수만', () => {
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
  it('maskState(null) 을 거쳐 다시 엔진에 넣어도 카드 더미가 남아 끝까지 둔다', () => {
    let s = maskState(twoPlayers(), null) as unknown as GameState;
    for (let i = 0; i < 1000 && s.phase !== 'finished'; i++) {
      const a = autoAction(s, s.currentPlayerId!)!;
      s = maskState(applyAction(s, a).state, null) as unknown as GameState;
    }
    expect(s.phase).toBe('finished');
    // 라운드 수를 채웠거나 타일을 다 썼다(주머니·펼친 타일이 사라지지 않았다)
    const empty = s.pile.length === 0 && s.players.every((p) => p.hand.length === 0);
    expect(s.round === rulesFor(2).rounds || empty).toBe(true);
    const total = rulesFor(2).gardenSize * rulesFor(2).copies;
    const discards = s.log.filter((e) => e.kind === 'discard').length;
    // 끝나면 펼친 타일은 치운다(finishGame)
    const kept = s.plants.length + discards + s.pile.length + s.players.reduce((n, p) => n + p.hand.length, 0);
    expect(kept).toBeLessThanOrEqual(total);
    expect(kept).toBeGreaterThanOrEqual(total - rulesFor(2).market);
  });
});
