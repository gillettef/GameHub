import { describe, expect, it } from 'vitest';
import type { Action, GameState, PlayerId } from '@rootbound/shared';
import { autoAction, legalPlantCells, maskState } from '@rootbound/shared';
import { createAiRunner } from '../game/aiTurn.js';
import { RoomError, RoomManager, isCurrentFormat } from './manager.js';

function makeManager(): RoomManager {
  let n = 0;
  return new RoomManager({ seed: () => 42, now: () => 1000, roomId: () => `room${++n}` });
}

/** 지금 차례(또는 드래프트 픽)인 사람이 엔진 자동 수를 둔다 */
function autoStep(m: RoomManager, roomId: string): void {
  const state = m.get(roomId)!.state;
  const pid = state.currentPlayerId as PlayerId;
  const r = m.tryApply(roomId, autoAction(state, pid)!);
  if (r.error) throw new Error(r.error);
}

function readyAll(m: RoomManager, roomId: string, ids: PlayerId[]): void {
  for (const id of ids) m.act(roomId, id, { type: 'READY', playerId: id });
}

/** 드래프트를 자동 픽으로 끝낸다 */
function finishDraft(m: RoomManager, roomId: string): void {
  while (m.get(roomId)!.state.phase === 'drafting') autoStep(m, roomId);
}

describe('RoomManager 생성·입장·퇴장 (F001, F002, F003)', () => {
  it('방을 만들면 방장이 좌석 0에 앉고 초대용 id 가 나온다', () => {
    const m = makeManager();
    const { room, playerId } = m.create({ playerToken: 't1', nickname: '갑' });
    expect(room.roomId).toBe('room1');
    expect(room.hostId).toBe(playerId);
    expect(room.state.players[0]).toMatchObject({ id: playerId, nickname: '갑', seat: 0 });
    expect(m.peek('room1')).toMatchObject({ hasPassword: false, phase: 'lobby', players: 1, capacity: 4 });
  });

  it('비밀번호는 숫자 4자리, 입장 시 검증한다', () => {
    const m = makeManager();
    expect(() => m.create({ playerToken: 't1', nickname: '갑', password: 'abc' })).toThrow(RoomError);
    m.create({ playerToken: 't1', nickname: '갑', password: '1234' });
    expect(() => m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' })).toThrow(/비밀번호가 필요/);
    expect(() => m.join({ roomId: 'room1', playerToken: 't2', nickname: '을', password: '0000' })).toThrow(/다릅니다/);
    expect(m.join({ roomId: 'room1', playerToken: 't2', nickname: '을', password: '1234' }).playerId).toBe('p2');
  });

  it('정원 4명, 같은 토큰은 재접속으로 처리', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    for (const t of ['t2', 't3', 't4']) m.join({ roomId: 'room1', playerToken: t, nickname: t });
    expect(() => m.join({ roomId: 'room1', playerToken: 't5', nickname: '무' })).toThrow(/정원/);
    expect(m.join({ roomId: 'room1', playerToken: 't2', nickname: 'x' })).toMatchObject({ playerId: 'p2', reconnected: true });
  });

  it('방장이 나가면 남은 사람에게 넘어가고, 아무도 없으면 방이 사라진다', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    expect(m.leave('room1', 'p1')?.hostId).toBe('p2');
    expect(m.leave('room1', 'p2')).toBeNull();
    expect(m.get('room1')).toBeUndefined();
  });
});

describe('로비 · AI 좌석 · 시작 (F002, F026)', () => {
  it('방장만 AI 를 넣고 뺀다', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    expect(() => m.addAi('room1', 'p2')).toThrow(/방장/);
    const { playerId: aiId } = m.addAi('room1', 'p1');
    expect(m.get('room1')?.state.players.find((p) => p.id === aiId)).toMatchObject({ kind: 'ai', isReady: true });
    m.removeAi('room1', 'p1', aiId);
    expect(m.get('room1')?.state.players).toHaveLength(2);
  });

  it('전원 준비되면 드래프트가 시작되고, AI 좌석을 사람이 조작할 수 없다', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    const { playerId: aiId } = m.addAi('room1', 'p1');
    readyAll(m, 'room1', ['p1']);
    const state = m.get('room1')!.state;
    expect(state.phase).toBe('drafting');
    expect(state.board?.cells).toHaveLength(49);
    expect(() => m.act('room1', 'p1', { type: 'DRAFT', playerId: aiId, species: 'oak' })).toThrow(/다른 플레이어/);
    expect(() => m.act('room1', aiId, { type: 'DRAFT', playerId: aiId, species: 'oak' })).toThrow(/AI 좌석/);
  });
});

describe('손패 비공개 (F004)', () => {
  it('타인 손패는 장수만, 덱·시드는 누구에게도 보내지 않는다. 고른 종은 공개', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    readyAll(m, 'room1', ['p1', 'p2']);
    finishDraft(m, 'room1');
    const state = m.get('room1')!.state;
    const forP1 = maskState(state, 'p1');
    const me = forP1.players.find((p) => p.id === 'p1')!;
    const other = forP1.players.find((p) => p.id === 'p2')!;
    expect(me.hand).toHaveLength(3);
    expect(me.deck).toEqual([]);
    expect(other.hand).toEqual([]);
    expect(other.handCount).toBe(3);
    expect(other.drafted).toHaveLength(5);
    expect(forP1.rngSeed).toBe(0);
    // 엔진 함수에 그대로 넣을 수 있다
    expect(legalPlantCells(forP1 as unknown as GameState, 'p1', me.hand[0]!).length).toBeGreaterThan(0);
  });
});

describe('AI 턴 실행기 (F027)', () => {
  it('AI 차례마다 결정을 받아 적용하고, 불법 응답은 자동 수로 폴백한다', async () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    const { playerId: aiId } = m.addAi('room1', 'p1');
    readyAll(m, 'room1', ['p1']);
    let calls = 0;
    const runner = createAiRunner({
      manager: m,
      thinkDelayMs: 0,
      onChange: () => runner.maybeRun('room1'),
      decide: async (state, playerId): Promise<Action | null> => {
        calls++;
        if (calls === 1) return { type: 'DRAFT', playerId, species: 'nope' as never }; // 불법 → 자동 수
        return autoAction(state, playerId);
      },
    });
    // 2인 드래프트 첫 픽은 좌석 1(AI)
    expect(m.get('room1')!.state.currentPlayerId).toBe(aiId);
    runner.maybeRun('room1');
    await new Promise((r) => setTimeout(r, 20));
    const s = m.get('room1')!.state;
    expect(s.players.find((p) => p.id === aiId)!.drafted).toHaveLength(1);
    expect(s.currentPlayerId).toBe('p1'); // 사람 차례에서 멈춘다
    expect(calls).toBe(1);
  });

  it('대리 좌석 사람이 AI 결정 도중 직접 두어도 다음 AI 좌석 차례는 멈추지 않는다', async () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.addAi('room1', 'p1');
    readyAll(m, 'room1', ['p1']);
    const room = m.get('room1')!;
    // 2인 뱀 순서는 AI → 사람 → 사람 → AI. 사람의 둘째 픽(다음이 AI)에서 경합을 만든다
    autoStep(m, 'room1');
    autoStep(m, 'room1');
    expect(room.state.currentPlayerId).toBe('p1');
    expect(room.state.draftOrder[room.state.draftIndex + 1]).not.toBe('p1');
    room.autopilot = ['p1'];
    let release: () => void = () => undefined;
    const decided: string[] = [];
    const runner = createAiRunner({
      manager: m,
      thinkDelayMs: 0,
      onChange: () => runner.maybeRun('room1'),
      decide: async (state, playerId) => {
        decided.push(playerId);
        if (playerId === 'p1') await new Promise<void>((r) => (release = r));
        return autoAction(state, playerId);
      },
    });
    runner.maybeRun('room1');
    await new Promise((r) => setTimeout(r, 5));
    m.act('room1', 'p1', autoAction(room.state, 'p1')!); // 사람이 직접 픽 → 대리 해제, 다음은 AI
    runner.maybeRun('room1'); // run 중이라 무시된다
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(decided.filter((id) => id !== 'p1').length).toBeGreaterThan(0);
  });
});

describe('입력 검증 · 방 정리', () => {
  it('잘못된 모양의 액션은 거부한다', () => {
    const m = makeManager();
    const { room, playerId } = m.create({ playerToken: 't1', nickname: '갑' });
    const bad = (a: unknown) => () => m.act(room.roomId, playerId, a as Action);
    expect(bad({ type: 'PLANT', playerId, species: 'oak', pos: { q: 1.5, r: 2 } })).toThrow(RoomError);
    expect(bad({ type: 'PLANT', playerId, species: 'tree', pos: { q: 1, r: 2 } })).toThrow(RoomError);
    expect(bad({ type: 'PLANT', playerId, species: 'vine', pos: { q: 1, r: 2 }, direction: 7 })).toThrow(RoomError);
    expect(bad({ type: 'PLACE', playerId })).toThrow(RoomError);
    expect(bad(null)).toThrow(RoomError);
  });

  it('오래 방치된 방만 정리한다', () => {
    let now = 1000;
    const m = new RoomManager({ seed: () => 42, now: () => now, roomId: (() => { let n = 0; return () => `room${++n}`; })() });
    const a = m.create({ playerToken: 't1', nickname: '갑' }).room;
    now += 2 * 24 * 60 * 60 * 1000;
    const b = m.create({ playerToken: 't2', nickname: '을' }).room;
    expect(m.pruneStale().map((r) => r.roomId)).toEqual([a.roomId]);
    expect(m.get(b.roomId)).toBeDefined();
  });

  it('예전 게임(우주 전투판) 형식 스냅샷은 지금 형식이 아니다', () => {
    const m = makeManager();
    const { room } = m.create({ playerToken: 't1', nickname: '갑' });
    expect(isCurrentFormat(room)).toBe(true);
    const old = JSON.parse(JSON.stringify(room));
    delete old.state.plants;
    old.state.markers = [];
    old.state.board = { width: 10, height: 10, asteroids: [] };
    expect(isCurrentFormat(old)).toBe(false);
  });
});

describe('제한 시간 · AI 대리 (Rules.md 6.3)', () => {
  function setup() {
    let now = 1000;
    const m = new RoomManager({ seed: () => 42, now: () => now, roomId: () => 'room1', hashToken: (t) => `h:${t}` });
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    return { m, advance: (ms: number) => (now += ms), at: () => now };
  }

  it('새 방은 기본 90초, 방장만 로비에서 정해진 선택지로 바꿀 수 있다', () => {
    const { m } = setup();
    expect(m.get('room1')?.turnTimeLimitSec).toBe(90);
    expect(() => m.setTurnTime('room1', 'p2', 60)).toThrow(/방장만/);
    expect(() => m.setTurnTime('room1', 'p1', 45)).toThrow(RoomError);
    m.setTurnTime('room1', 'p1', null);
    expect(m.info(m.get('room1')!, []).turnTimeLimitSec).toBeNull();
    m.setTurnTime('room1', 'p1', 60);
    readyAll(m, 'room1', ['p1', 'p2']);
    expect(() => m.setTurnTime('room1', 'p1', 90)).toThrow(/시작 전에만/);
  });

  it('드래프트 픽 제한은 차례 제한의 1/3 (최소 20초), 지나면 자동 픽', () => {
    const { m, advance, at } = setup();
    readyAll(m, 'room1', ['p1', 'p2']);
    const room = m.get('room1')!;
    expect(room.state.phase).toBe('drafting');
    expect(m.deadline(room)).toBe(at() + 30_000);
    const picker = room.state.currentPlayerId as string;
    advance(29_000);
    expect(m.timeoutTurn('room1')).toBeNull();
    advance(1_000);
    expect(m.timeoutTurn('room1')).not.toBeNull();
    expect(room.state.players.find((p) => p.id === picker)!.drafted).toEqual(['grass']); // 표 순서 첫 종
    expect(m.deadline(room)).toBe(at() + 30_000); // 다음 픽 시계
  });

  it('차례 제한이 지나면 자동으로 심고, 다음 사람 시계가 새로 시작한다', () => {
    const { m, advance, at } = setup();
    readyAll(m, 'room1', ['p1', 'p2']);
    finishDraft(m, 'room1');
    const room = m.get('room1')!;
    const first = room.state.currentPlayerId as string;
    expect(m.deadline(room)).toBe(at() + 90_000);
    advance(90_000);
    expect(m.timeoutTurn('room1')).not.toBeNull();
    expect(room.state.plants).toHaveLength(1);
    expect(room.state.currentPlayerId).not.toBe(first);
    expect(room.state.log.some((e) => e.kind === 'system' && e.playerId === first && e.message.includes('자동으로 둡니다'))).toBe(true);
    expect(room.afkStrikes?.[first]).toBe(1);
    expect(m.deadline(room)).toBe(at() + 90_000);
  });

  it('연속 2번 시간 초과하면 AI 대리, 직접 두기·받아들여진 행동으로만 되찾는다', () => {
    const { m, advance } = setup();
    readyAll(m, 'room1', ['p1', 'p2']);
    finishDraft(m, 'room1');
    const room = m.get('room1')!;
    const afk = room.state.currentPlayerId as string;
    const other = afk === 'p1' ? 'p2' : 'p1';
    advance(90_000);
    m.timeoutTurn('room1');
    m.act('room1', other, autoAction(room.state, other)!);
    expect(room.autopilot).toEqual([]);
    advance(90_000);
    m.timeoutTurn('room1');
    expect(room.autopilot).toEqual([afk]);

    m.act('room1', other, autoAction(room.state, other)!);
    expect(m.isAutoTurn(room)).toBe(true);
    expect(m.deadline(room)).toBeNull();

    // 재접속만으로는 풀리지 않는다
    m.join({ roomId: 'room1', playerToken: afk === 'p1' ? 't1' : 't2', nickname: 'x' });
    expect(room.autopilot).toEqual([afk]);
    // 거부된 액션은 대리를 풀지 않는다
    expect(() => m.act('room1', afk, { type: 'PLANT', playerId: afk, species: 'oak', pos: { q: 99, r: 99 } })).toThrow(RoomError);
    expect(room.autopilot).toEqual([afk]);
    // 직접 두기
    m.resume('room1', afk);
    expect(room.autopilot).toEqual([]);
    expect(room.afkStrikes?.[afk]).toBe(0);
    expect(m.deadline(room)).not.toBeNull();
  });

  it('스냅샷 복원 시 진행 중인 차례는 시계를 새로 잰다', () => {
    const { m, advance, at } = setup();
    readyAll(m, 'room1', ['p1', 'p2']);
    finishDraft(m, 'room1');
    const saved = JSON.parse(JSON.stringify(m.get('room1')));
    advance(10 * 60_000);
    m.load(saved);
    expect(m.deadline(m.get('room1')!)).toBe(at() + 90_000);
  });

  it('제한 없음이면 마감이 없다 (드래프트 포함)', () => {
    const { m, advance } = setup();
    m.setTurnTime('room1', 'p1', null);
    readyAll(m, 'room1', ['p1', 'p2']);
    advance(10 * 24 * 60 * 60 * 1000);
    expect(m.deadline(m.get('room1')!)).toBeNull();
    expect(m.timeoutTurn('room1')).toBeNull();
  });
});

describe('판 요약 기록', () => {
  it('끝난 판은 한 번만 기록되고, 기권·시간 초과·순위·고른 종·해시된 토큰을 담는다', () => {
    let now = 1000;
    const m = new RoomManager({ seed: () => 42, now: () => now, roomId: () => 'room1', hashToken: (t) => `h:${t}` });
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    readyAll(m, 'room1', ['p1', 'p2']);
    finishDraft(m, 'room1');
    const room = m.get('room1')!;
    expect(m.takeRecord(room)).toBeNull();
    const first = room.state.currentPlayerId as string;
    now += 90_000;
    m.timeoutTurn('room1');
    const loser = room.state.currentPlayerId as string;
    now += 30_000;
    m.act('room1', loser, { type: 'SURRENDER', playerId: loser });
    expect(room.state.phase).toBe('finished');
    const rec = m.takeRecord(room)!;
    expect(rec).toMatchObject({ outcome: 'finished', reason: 'last-standing', durationMs: 120_000, players: 2, turnTimeLimitSec: 90 });
    const seatOf = (id: string) => rec.seats.find((s) => s.seat === room.state.players.find((p) => p.id === id)!.seat)!;
    expect(seatOf(loser)).toMatchObject({ surrendered: true, rank: 2 });
    expect(seatOf(first)).toMatchObject({ timeouts: 1, rank: 1, playerHash: first === 'p1' ? 'h:t1' : 'h:t2' });
    expect(seatOf(first).drafted).toHaveLength(5);
    expect(m.takeRecord(room)).toBeNull();
  });

  it('진행 중에 방치되어 정리된 판은 abandoned 로 남는다', () => {
    let now = 1000;
    const m = new RoomManager({ seed: () => 42, now: () => now, roomId: () => 'room1' });
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    m.setTurnTime('room1', 'p1', null);
    readyAll(m, 'room1', ['p1', 'p2']);
    finishDraft(m, 'room1');
    now += 8 * 24 * 60 * 60 * 1000;
    const [pruned] = m.pruneStale();
    expect(pruned?.record).toMatchObject({ outcome: 'abandoned', reason: null });
  });
});
