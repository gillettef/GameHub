import { describe, expect, it } from 'vitest';
import { tutorialBotAction } from '../../ai/tutorial';
import { def } from '../../def';
import type { ChoreId, GameState, PlayerId } from '../../engine';
import {
  START_HAND,
  applyAction,
  autoAction,
  computeScores,
  legalCallCells,
  legalMoveSources,
  legalMoveTargets,
  legalPlantCells,
  maskState,
  rulesFor,
} from '../../engine';
import { formatRemaining, localDeadline, turnTimeLabel } from '../lib/turnClock';
import type { RoomInfo } from '../store/gameStore';
import { applyMoves, buildCells, buildPlayerSummaries, choicePick, legalKeys, plantBonus, previewCall, previewMoves, previewPlant, roundStageLabel, stageName } from './derived';

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

/** 공개 단계를 모두 확인해 1라운드 일과 고르기 차례(자리 0)에서 시작한 2인 판 */
const twoPlayers = () => confirmAllHotseat(createHotseatGame({ nicknames: ['나', '연습 봇'], seed: 20261007 })).state;

/** 일과 고르기 차례에 이 일과를 고른다. 펼친 일과에 없으면 테스트용으로 펼친 일과에 끼워 넣는다 */
function pick(s: GameState, playerId: PlayerId, chore: ChoreId): GameState {
  const offered: GameState = s.choreOffer.includes(chore) ? s : { ...s, choreOffer: [chore, ...s.choreOffer] };
  const r = applyAction(offered, { type: 'PICK_CHORE', playerId, chore });
  if (r.error) throw new Error(r.error);
  return r.state;
}

/** p0 이 chore 를, 나머지는 남은 다른 일과를 고르게 하고 p0 의 차례(일과 단계가 아닌 첫 단계)까지 자동 수로 진행한다 */
function toMyTurn(start: GameState, chore: ChoreId): GameState {
  let s = start;
  for (let i = 0; i < 400 && !(s.stage !== 'chore' && s.currentPlayerId === 'p0' && s.chores[0] === chore); i++) {
    if (s.phase !== 'playing') throw new Error('판이 끝남');
    if (s.stage === 'chore' && s.currentPlayerId === 'p0') s = pick(s, 'p0', chore);
    else if (s.stage === 'chore') {
      // 상대는 p0 가 원하는 일과를 남겨 둔다
      const other = s.choreOffer.find((c) => c !== chore && !s.chores.includes(c))!;
      s = pick(s, s.currentPlayerId!, other);
    } else s = applyAction(s, autoAction(s, s.currentPlayerId!)!).state;
  }
  return s;
}

/** 자동 수로 p0 의 심기 차례까지 진행한다 (p0 은 기본으로 식빵 굽기) */
function toPlantStage(start: GameState, chore: ChoreId = 'bread'): GameState {
  let s = toMyTurn(start, chore);
  if (s.stage === 'take') s = applyAction(s, autoAction(s, 'p0')!).state;
  return s;
}


describe('한 기기 판 시작 (def.setup)', () => {
  it('2~4명이 앉아 모두 준비하면 이번 판 식물 공개 단계가 되고, 한 번에 모두 확인하면 1라운드 일과 고르기가 시작된다', () => {
    for (const n of [2, 3, 4]) {
      const s = createHotseatGame({ nicknames: Array.from({ length: n }, (_, i) => `P${i}`), seed: n });
      expect(s.phase).toBe('reveal');
      expect(s.currentPlayerId).toBeNull();
      expect(s.players).toHaveLength(n);
      expect(s.players.every((p) => p.hand.length === START_HAND && !p.isReady)).toBe(true);
      const r = confirmAllHotseat(s);
      expect(r.error).toBeUndefined();
      expect(r.state.phase).toBe('playing');
      expect(r.state.stage).toBe('chore');
      expect(r.state.round).toBe(1);
      expect(r.state.currentPlayerId).toBe(hotseatPlayerId(0));
      expect(r.state.market).toHaveLength(rulesFor(n).market);
      // 펼친 일과 = 인원 + 1장, 아직 아무도 안 고름
      expect(r.state.choreOffer).toHaveLength(n + 1);
      expect(r.state.chores.every((c) => c === null)).toBe(true);
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

  it('일과 고르기 차례에는 놓는 일과의 PICK_CHORE, 가져오기 차례에는 TAKE, 심기 차례에는 take 없는 PLANT 를 보낸다', () => {
    let s = twoPlayers();
    const pickAction = tutorialBotAction(s, s.currentPlayerId!);
    expect(pickAction?.type).toBe('PICK_CHORE');
    if (pickAction?.type !== 'PICK_CHORE') throw new Error('일과 고르기가 아님');
    expect(['bread', 'peek', 'roam', 'boss']).toContain(pickAction.chore);
    s = applyAction(s, pickAction).state;
    s = applyAction(s, tutorialBotAction(s, s.currentPlayerId!)!).state;
    expect(s.stage).toBe('take');
    expect(s.currentPlayerId).toBe('p0');
    const action = tutorialBotAction(s, 'p0');
    expect(action?.type).toBe('TAKE');
    expect(applyAction(s, action!).error).toBeUndefined();
    const plant = applyAction(s, action!).state;
    expect(plant.stage).toBe('plant');
    const a2 = tutorialBotAction(plant, 'p0');
    expect(a2?.type).toBe('PLANT');
    expect(a2 && 'take' in a2).toBe(false);
    expect(applyAction(plant, a2!).error).toBeUndefined();
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

  it('미리보기: 심었을 때 점수 변화가 실제 엔진 결과와 같다 (식빵 굽기 +1 포함)', () => {
    for (const chore of ['roam', 'bread'] as const) {
      const s = toPlantStage(twoPlayers(), chore);
      expect(s.stage).toBe('plant');
      const action = autoAction(s, 'p0')!;
      if (action.type !== 'PLANT') throw new Error('심기가 아님');
      expect(plantBonus(s, 'p0')).toBe(chore === 'bread' ? 1 : 0);
      const pv = previewPlant(s, 'p0', action.species, action.pos, action.rotation ?? 0, null, plantBonus(s, 'p0'))!;
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
    }
  });

  it('마실: 심을 칸이 넓어진다(엔진이 state.chores 로 읽는다)', () => {
    const s = toPlantStage(twoPlayers(), 'roam');
    const species = s.players[0]!.hand[0]!;
    const roam = legalPlantCells(s, 'p0', species);
    const plain = legalPlantCells({ ...s, chores: s.chores.map(() => null) }, 'p0', species);
    expect(roam.length).toBeGreaterThan(plain.length);
    expect(legalKeys(maskState(s, 'p0'), 'p0', species).size).toBe(roam.length);
  });

  it('담 넘기 미리보기: 두 번 옮긴 결과가 엔진 MOVE 결과와 같고, 두 번째 이동은 첫 이동 뒤 보드 기준이다', () => {
    const s = toMyTurn(twoPlayers(), 'move');
    expect(s.stage).toBe('move');
    const from = legalMoveSources(s, 'p0')[0]!;
    const to = legalMoveTargets(s, from)[0]!;
    const first = { from, to, count: 1 };
    const base = applyMoves(s, 'p0', [first]);
    const from2 = legalMoveSources(base, 'p0').find((p) => p.q !== from.q || p.r !== from.r)!;
    const second = { from: from2, to: legalMoveTargets(base, from2)[0]!, count: 1 };
    const moves = [first, second];
    const r = applyAction(s, { type: 'MOVE', playerId: 'p0', moves });
    expect(r.error).toBeUndefined();
    const pv = previewMoves(maskState(s, 'p0'), 'p0', moves)!;
    expect(pv.scoreDelta[0]).toBe(computeScores(r.state)['p0']!.total - computeScores(s)['p0']!.total);
    expect(applyMoves(s, 'p0', moves).rootCount).toEqual(r.state.rootCount);
  });

  it('명당 부르기 미리보기: 결과가 엔진 CALL 결과와 같다 (그 칸 +1)', () => {
    // 1라운드에 명당을 놓고, 2라운드에 부른다
    let s = toPlantStage(twoPlayers(), 'bread');
    s = applyAction(s, autoAction(s, 'p0')!).state;
    s = toMyTurn(s, 'call');
    expect(s.stage).toBe('call');
    const pos = legalCallCells(s, 'p0')[0]!;
    const rotation = ((s.plants.find((p) => p.pos.q === pos.q && p.pos.r === pos.r)!.rotation + 1) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
    const r = applyAction(s, { type: 'CALL', playerId: 'p0', pos, rotation, take: 0 });
    expect(r.error).toBeUndefined();
    const pv = previewCall(maskState(s, 'p0'), 'p0', pos, rotation)!;
    expect(pv.scoreDelta[0]).toBe(computeScores(r.state)['p0']!.total - computeScores(s)['p0']!.total);
    expect(pv.landDelta[0]).toBe(computeScores(r.state)['p0']!.land - computeScores(s)['p0']!.land);
  });

  it('단계 이름과 라운드 표기: N/12라운드 · 일과 고르기 · 1번째 선택', () => {
    const s = twoPlayers();
    expect(roundStageLabel(s)).toBe(`1/${rulesFor(2).rounds}라운드 · 일과 고르기 · 1번째 선택`);
    const s2 = pick(s, 'p0', s.choreOffer[0]!);
    expect(choicePick(s2)).toBe(2);
    expect(stageName('move')).toBe('담 넘기');
    expect(stageName('call')).toBe('명당 부르기');
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
  it('maskState(null) 을 거쳐 다시 엔진에 넣어도 카드 더미가 남아 12라운드를 끝까지 둔다', () => {
    let s = maskState(twoPlayers(), null) as unknown as GameState;
    for (let i = 0; i < 600 && s.phase !== 'finished'; i++) {
      const a = autoAction(s, s.currentPlayerId!)!;
      s = maskState(applyAction(s, a).state, null) as unknown as GameState;
    }
    expect(s.phase).toBe('finished');
    expect(s.round).toBe(rulesFor(2).rounds);
    // 놓는 일과 차례마다 놓거나 버렸다(주머니·펼친 타일이 사라지지 않았다)
    const placeTurns = s.log.filter((e) => e.kind === 'turn' && /· (식빵 굽기|생선 냄새|마실|대장 방울)$/.test(e.message)).length;
    expect(s.plants.length + s.log.filter((e) => e.kind === 'discard').length).toBe(placeTurns);
  });
});
