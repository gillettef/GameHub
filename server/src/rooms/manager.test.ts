import { describe, expect, it } from 'vitest';
import type { Action, GameState, PlayerId } from '@astraltab/shared';
import { canPlay, getMap, legalCells, maskState } from '@astraltab/shared';
import { createAiRunner } from '../game/aiTurn.js';
import { RoomError, RoomManager } from './manager.js';

function makeManager(): RoomManager {
  let n = 0;
  return new RoomManager({ seed: () => 42, now: () => 1000, roomId: () => `room${++n}` });
}

/** 사람 플레이어가 첫 합법 카드를 놓고 턴을 마친다 (배치는 더 이상 턴을 끝내지 않으므로 PASS 로 넘긴다) */
function placeFirst(m: RoomManager, roomId: string, id: PlayerId): void {
  const state = m.get(roomId)?.state as GameState;
  const player = state.players.find((p) => p.id === id);
  for (const card of player?.hand ?? []) {
    const cell = legalCells(state, id, card)[0];
    if (cell && player && player.energy >= 1) {
      const r = m.tryApply(roomId, { type: 'PLACE', playerId: id, cardId: card, pos: cell });
      if (!r.error) {
        const p = m.tryApply(roomId, { type: 'PASS', playerId: id }); // 배치했으므로 패스로는 기록되지 않는다
        if (p.error) throw new Error(p.error);
        return;
      }
    }
  }
  throw new Error('놓을 카드가 없습니다');
}

function readyAll(m: RoomManager, roomId: string, ids: PlayerId[]): void {
  for (const id of ids) {
    m.act(roomId, id, { type: 'SELECT_RACE', playerId: id, race: 'coalition' });
    m.act(roomId, id, { type: 'READY', playerId: id });
  }
}

describe('RoomManager 생성·입장·퇴장 (F001, F002, F003)', () => {
  it('방을 만들면 방장이 좌석 0에 앉고 초대용 id 가 나온다', () => {
    const m = makeManager();
    const { room, playerId } = m.create({ playerToken: 't1', nickname: '갑' });
    expect(room.roomId).toBe('room1');
    expect(room.hostId).toBe(playerId);
    expect(room.state.players[0]).toMatchObject({ id: playerId, nickname: '갑', seat: 0 });
    expect(m.peek('room1')).toMatchObject({ hasPassword: false, phase: 'lobby', players: 1, capacity: 2 });
  });

  it('비밀번호는 숫자 4자리, 입장 시 검증한다', () => {
    const m = makeManager();
    expect(() => m.create({ playerToken: 't1', nickname: '갑', password: 'abc' })).toThrow(RoomError);
    m.create({ playerToken: 't1', nickname: '갑', password: '1234' });
    expect(m.peek('room1').hasPassword).toBe(true);
    expect(() => m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' })).toThrow(/비밀번호가 필요/);
    expect(() => m.join({ roomId: 'room1', playerToken: 't2', nickname: '을', password: '0000' })).toThrow(/다릅니다/);
    const { playerId } = m.join({ roomId: 'room1', playerToken: 't2', nickname: '을', password: '1234' });
    expect(playerId).toBe('p2');
  });

  it('정원(항상 최대 4명, 맵과 무관)이 차면 거부, 같은 토큰은 재접속으로 처리', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' }); // 기본 맵은 2인용
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    m.join({ roomId: 'room1', playerToken: 't3', nickname: '병' });
    m.join({ roomId: 'room1', playerToken: 't4', nickname: '정' });
    expect(() => m.join({ roomId: 'room1', playerToken: 't5', nickname: '무' })).toThrow(/정원/);
    const again = m.join({ roomId: 'room1', playerToken: 't2', nickname: '무시됨' });
    expect(again).toMatchObject({ playerId: 'p2', reconnected: true });
    expect(m.get('room1')?.state.players).toHaveLength(4);
    // 좌석이 2인용 기본 맵 정원을 넘어서면 정원에 맞는 맵으로 자동 전환된다
    expect(getMap(m.get('room1')!.state.mapId).players).toBeGreaterThanOrEqual(4);
  });

  it('없는 방·잘못된 닉네임은 거부', () => {
    const m = makeManager();
    expect(() => m.join({ roomId: 'nope', playerToken: 't', nickname: '갑' })).toThrow(/없는 방/);
    expect(() => m.create({ playerToken: 't', nickname: '   ' })).toThrow(/닉네임/);
  });

  it('방장이 나가면 남은 사람에게 넘어가고, 아무도 없으면 방이 사라진다', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    const room = m.leave('room1', 'p1');
    expect(room?.hostId).toBe('p2');
    expect(room?.state.players.map((p) => [p.id, p.seat])).toEqual([['p2', 0]]);
    expect(m.playerIdOf('room1', 't1')).toBeNull();
    expect(m.leave('room1', 'p2')).toBeNull();
    expect(m.get('room1')).toBeUndefined();
  });
});

describe('로비 설정 · AI 좌석 (F026, F030)', () => {
  it('방장만 맵을 바꾸고 AI 를 넣고 뺀다', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    expect(() => m.setMap('room1', 'p2', 'quadrant')).toThrow(/방장만/);
    m.setMap('room1', 'p1', 'quadrant');
    expect(m.get('room1')?.state.board.width).toBe(getMap('quadrant').size);
    const { playerId: ai1 } = m.addAi('room1', 'p1');
    const { playerId: ai2 } = m.addAi('room1', 'p1');
    expect(m.get('room1')?.state.players.filter((p) => p.kind === 'ai').map((p) => p.nickname)).toEqual(['AI 1', 'AI 2']);
    expect(() => m.addAi('room1', 'p1')).toThrow(/정원/);
    expect(() => m.removeAi('room1', 'p1', 'p2')).toThrow(/AI 좌석이 아닙니다/);
    m.removeAi('room1', 'p1', ai1);
    expect(m.get('room1')?.state.players.map((p) => p.id)).toEqual(['p1', 'p2', ai2]);
    // AI 는 준비 완료로 들어온다 (F026)
    expect(m.get('room1')?.state.players.find((p) => p.id === ai2)).toMatchObject({ isReady: true, kind: 'ai' });
  });

  it('AI 로 기본 맵(2인용) 정원을 넘기면 맵이 자동으로 커진다(2026-09-28)', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    expect(m.get('room1')?.state.mapId).toBe('binary-star');
    m.addAi('room1', 'p1');
    expect(getMap(m.get('room1')!.state.mapId).players).toBe(2);
    m.addAi('room1', 'p1');
    expect(getMap(m.get('room1')!.state.mapId).players).toBeGreaterThanOrEqual(3);
    m.addAi('room1', 'p1');
    expect(getMap(m.get('room1')!.state.mapId).players).toBe(4);
    expect(() => m.addAi('room1', 'p1')).toThrow(/정원/);
  });

  it('전원 준비되면 게임이 시작되고 AI 좌석을 사람이 조작할 수 없다', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    const { playerId: aiId } = m.addAi('room1', 'p1');
    readyAll(m, 'room1', ['p1']);
    const state = m.get('room1')?.state as GameState;
    expect(state.phase).toBe('playing');
    expect(state.currentPlayerId).toBe('p1');
    expect(() => m.act('room1', 'p1', { type: 'PASS', playerId: aiId })).toThrow(/다른 플레이어/);
    expect(() => m.act('room1', aiId, { type: 'PASS', playerId: aiId })).toThrow(/AI 좌석/);
    expect(() => m.join({ roomId: 'room1', playerToken: 't9', nickname: '늦음' })).toThrow(/이미 시작/);
  });
});

describe('손패 비공개 (F004)', () => {
  it('타인 손패는 장수만, 덱·시드는 누구에게도 보내지 않는다', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    readyAll(m, 'room1', ['p1', 'p2']);
    const state = m.get('room1')?.state as GameState;
    const forP1 = maskState(state, 'p1');
    const me = forP1.players.find((p) => p.id === 'p1');
    const other = forP1.players.find((p) => p.id === 'p2');
    expect(me?.hand).toEqual(state.players[0]?.hand);
    expect(me?.deck).toEqual([]);
    expect(me?.deckCount).toBe(state.players[0]?.deck.length);
    expect(other?.hand).toEqual([]);
    expect(other?.handCount).toBe(state.players[1]?.hand.length);
    expect(forP1.rngSeed).toBe(0);
    // 엔진 함수에 그대로 넣을 수 있다
    expect(legalCells(forP1, 'p1', me?.hand[0] as string).length).toBeGreaterThan(0);
  });
});

describe('AI 턴 실행기 (F027)', () => {
  it('AI 턴이 오면 결정을 받아 적용하고, 불법 응답은 PASS 로 폴백한다', async () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    const { playerId: aiId } = m.addAi('room1', 'p1');
    readyAll(m, 'room1', ['p1']);
    const changes: string[] = [];
    let calls = 0;
    const runner = createAiRunner({
      manager: m,
      thinkDelayMs: 0,
      onChange: (room) => changes.push(`${room.state.turn}:${room.state.currentPlayerId}`),
      decide: async (state, playerId): Promise<Action> => {
        calls++;
        if (calls === 1) return { type: 'PLACE', playerId, cardId: 'nope', pos: { x: 0, y: 0 } }; // 불법 → PASS 폴백
        const card = state.players.find((p) => p.id === playerId)?.hand.find((c) => canPlay(state, playerId, c));
        const cell = card ? legalCells(state, playerId, card)[0] : undefined;
        return card && cell ? { type: 'PLACE', playerId, cardId: card, pos: cell } : { type: 'PASS', playerId };
      },
    });

    // 사람이 배치 → 턴 종료 → AI 턴: 첫 응답이 불법이라 PASS 로 폴백하고 AI 턴이 끝난다
    placeFirst(m, 'room1', 'p1');
    runner.maybeRun('room1');
    expect(runner.isRunning('room1')).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(runner.isRunning('room1')).toBe(false);
    expect(calls).toBe(1);
    expect(m.get('room1')?.state.currentPlayerId).toBe('p1');
    expect(m.get('room1')?.state.log.some((e) => e.kind === 'pass' && e.playerId === aiId)).toBe(true);

    // 두 번째 AI 턴: 에너지가 허락하는 한 배치를 반복하다 더 놓을 수 없으면 스스로 PASS 로 턴을 마친다
    placeFirst(m, 'room1', 'p1');
    const callsBefore = calls;
    runner.maybeRun('room1');
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBeGreaterThan(callsBefore + 1); // 최소 한 번은 배치, 마지막엔 PASS 로 턴 종료
    expect(m.get('room1')?.state.currentPlayerId).toBe('p1'); // 턴이 사람에게 돌아왔다
    expect(m.get('room1')?.state.log.some((e) => e.kind === 'place' && e.playerId === aiId)).toBe(true);
    expect(changes.length).toBe(calls); // onChange 는 매 적용마다 한 번씩
  });
});

describe('입력 검증 · 방 정리', () => {
  it('정수가 아닌 좌표·잘못된 모양의 액션은 거부한다', () => {
    const m = makeManager();
    const { room, playerId } = m.create({ playerToken: 't1', nickname: '갑' });
    const bad = { type: 'PLACE', playerId, cardId: 'scout', pos: { x: 1.5, y: 2 } } as unknown as Action;
    expect(() => m.act(room.roomId, playerId, bad)).toThrow(RoomError);
    expect(() => m.act(room.roomId, playerId, { type: 'PASS', playerId, discardCardIds: 'abc' } as unknown as Action)).toThrow(RoomError);
    expect(() => m.act(room.roomId, playerId, null as unknown as Action)).toThrow(RoomError);
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

  it('지형 필드가 없는 옛 스냅샷은 불러올 때 board 를 다시 만든다', () => {
    const m = makeManager();
    const { room } = m.create({ playerToken: 't1', nickname: '갑' });
    const old = JSON.parse(JSON.stringify(room));
    delete old.state.board.nebulas;
    delete old.state.board.ionStorms;
    m.load(old);
    expect(m.get(room.roomId)?.state.board.nebulas).toBeDefined();
  });
});

describe('턴 제한 시간 · AI 대리 (Rules.md 5.4)', () => {
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

  it('마감 전에는 아무 일도 없고, 지나면 자동 패스 후 다음 사람 시계가 새로 시작한다', () => {
    const { m, advance, at } = setup();
    readyAll(m, 'room1', ['p1', 'p2']);
    const room = m.get('room1')!;
    const first = room.state.currentPlayerId as string;
    expect(m.deadline(room)).toBe(at() + 90_000);
    advance(89_000);
    expect(m.timeoutTurn('room1')).toBeNull();
    advance(1_000);
    expect(m.timeoutTurn('room1')).not.toBeNull();
    expect(room.state.currentPlayerId).not.toBe(first);
    expect(room.state.log.some((e) => e.kind === 'system' && e.playerId === first && /제한 시간 1분 30초|자동으로 턴을 넘깁니다/.test(e.message))).toBe(true);
    expect(room.afkStrikes?.[first]).toBe(1);
    expect(m.deadline(room)).toBe(at() + 90_000);
  });

  it('연속 2번 시간 초과하면 AI 대리, 직접 두기·받아들여진 행동으로만 되찾는다', () => {
    const { m, advance } = setup();
    readyAll(m, 'room1', ['p1', 'p2']);
    const room = m.get('room1')!;
    const afk = room.state.currentPlayerId as string;
    const other = afk === 'p1' ? 'p2' : 'p1';
    // afk 시간 초과 → other 는 배치 후 턴 종료(둘 다 패스면 전원 연속 패스로 끝나 버린다) → afk 다시 시간 초과
    advance(90_000);
    m.timeoutTurn('room1');
    placeFirst(m, 'room1', other);
    expect(room.autopilot).toEqual([]);
    advance(90_000);
    m.timeoutTurn('room1');
    expect(room.autopilot).toEqual([afk]);
    expect(room.state.log.some((e) => e.message.includes('AI가 대신 둡니다'))).toBe(true);

    // 상대 턴 뒤 afk 턴이 오면 서버가 대신 두는 턴이고 마감이 없다
    placeFirst(m, 'room1', other);
    expect(m.isAutoTurn(room)).toBe(true);
    expect(m.deadline(room)).toBeNull();
    expect(m.info(room, []).autopilot).toEqual([afk]);

    // 재접속(소켓 자동 재연결 포함)만으로는 풀리지 않는다
    m.join({ roomId: 'room1', playerToken: afk === 'p1' ? 't1' : 't2', nickname: 'x' });
    expect(room.autopilot).toEqual([afk]);

    // 거부된 액션은 대리를 풀지 않는다 (풀리면 아무도 그 턴을 진행하지 않아 방이 멈춘다)
    expect(() => m.act('room1', afk, { type: 'PLACE', playerId: afk, cardId: 'nope', pos: { x: 0, y: 0 } })).toThrow(RoomError);
    expect(room.autopilot).toEqual([afk]);

    // 직접 두기로 되찾으면 시계가 지금부터 다시 시작한다
    m.resume('room1', afk);
    expect(room.autopilot).toEqual([]);
    expect(m.isAutoTurn(room)).toBe(false);
    expect(room.afkStrikes?.[afk]).toBe(0);
    expect(m.deadline(room)).not.toBeNull();

    // 받아들여진 직접 행동도 대리를 푼다
    room.autopilot = [afk];
    m.act('room1', afk, { type: 'PASS', playerId: afk });
    expect(room.autopilot).toEqual([]);
  });

  it('스냅샷 복원 시 진행 중인 턴은 시계를 새로 잰다 (서버가 내려가 있던 시간은 플레이어 책임이 아니다)', () => {
    const { m, advance, at } = setup();
    readyAll(m, 'room1', ['p1', 'p2']);
    const saved = JSON.parse(JSON.stringify(m.get('room1')));
    advance(10 * 60_000); // 10분 동안 서버가 꺼져 있었다
    m.load(saved);
    expect(m.deadline(m.get('room1')!)).toBe(at() + 90_000);
    expect(m.timeoutTurn('room1')).toBeNull();
  });

  it('제한 없음(비동기 턴)이면 마감이 없다', () => {
    const { m, advance } = setup();
    m.setTurnTime('room1', 'p1', null);
    readyAll(m, 'room1', ['p1', 'p2']);
    advance(10 * 24 * 60 * 60 * 1000);
    expect(m.deadline(m.get('room1')!)).toBeNull();
    expect(m.timeoutTurn('room1')).toBeNull();
  });

  it('타이머가 생기기 전 스냅샷은 제한 없음으로 이어 간다', () => {
    const { m } = setup();
    const old = JSON.parse(JSON.stringify(m.get('room1')));
    delete old.turnTimeLimitSec;
    delete old.autopilot;
    delete old.afkStrikes;
    m.load(old);
    expect(m.get('room1')?.turnTimeLimitSec).toBeNull();
    expect(m.get('room1')?.autopilot).toEqual([]);
  });
});

describe('판 요약 기록', () => {
  it('끝난 판은 한 번만 기록되고, 기권·시간 초과·순위·해시된 토큰을 담는다', () => {
    let now = 1000;
    const m = new RoomManager({ seed: () => 42, now: () => now, roomId: () => 'room1', hashToken: (t) => `h:${t}` });
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    readyAll(m, 'room1', ['p1', 'p2']);
    const room = m.get('room1')!;
    expect(m.takeRecord(room)).toBeNull(); // 아직 진행 중
    const first = room.state.currentPlayerId as string;
    now += 90_000;
    m.timeoutTurn('room1');
    const loser = room.state.currentPlayerId as string;
    now += 30_000;
    m.act('room1', loser, { type: 'SURRENDER', playerId: loser });
    expect(room.state.phase).toBe('finished');
    const rec = m.takeRecord(room)!;
    expect(rec).toMatchObject({ outcome: 'finished', reason: 'last-survivor', durationMs: 120_000, players: 2, turnTimeLimitSec: 90 });
    const seatOf = (id: string) => rec.seats.find((s) => s.seat === room.state.players.find((p) => p.id === id)!.seat)!;
    expect(seatOf(loser)).toMatchObject({ surrendered: true, rank: 2 });
    expect(seatOf(first)).toMatchObject({ timeouts: 1, rank: 1, playerHash: first === 'p1' ? 'h:t1' : 'h:t2' });
    expect(m.takeRecord(room)).toBeNull();
  });

  it('진행 중에 방치되어 정리된 판은 abandoned 로 남는다', () => {
    let now = 1000;
    const m = new RoomManager({ seed: () => 42, now: () => now, roomId: () => 'room1' });
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    m.setTurnTime('room1', 'p1', null);
    readyAll(m, 'room1', ['p1', 'p2']);
    now += 8 * 24 * 60 * 60 * 1000;
    const [pruned] = m.pruneStale();
    expect(pruned?.record).toMatchObject({ outcome: 'abandoned', reason: null });
  });
});

describe('AI 실행기 · AI 대리 경합', () => {
  it('대리 좌석 사람이 AI 결정 도중 직접 PASS 해도 다음 AI 좌석 턴은 멈추지 않는다', async () => {
    const m = new RoomManager({ seed: () => 42, now: () => 1000, roomId: () => 'room1' });
    m.create({ playerToken: 't1', nickname: '갑' });
    m.addAi('room1', 'p1');
    readyAll(m, 'room1', ['p1']);
    const room = m.get('room1')!;
    const human = 'p1';
    // 사람 차례로 맞추고 대리 상태로 만든다
    if (room.state.currentPlayerId !== human) {
      const ai = room.state.currentPlayerId as string;
      m.tryApply('room1', { type: 'PASS', playerId: ai });
    }
    room.autopilot = [human];
    let release: () => void = () => undefined;
    const decided: string[] = [];
    const runner = createAiRunner({
      manager: m,
      thinkDelayMs: 0,
      onChange: () => runner.maybeRun('room1'),
      decide: async (state, playerId): Promise<Action> => {
        decided.push(playerId);
        if (playerId === human) await new Promise<void>((r) => (release = r)); // 사람 좌석 결정은 느리다
        return { type: 'PASS', playerId };
      },
    });
    runner.maybeRun('room1');
    await new Promise((r) => setTimeout(r, 5));
    // 결정 도중 사람이 직접 PASS → 턴이 AI 좌석으로 넘어감. commit 의 maybeRun 은 run 중이라 무시된다
    m.act('room1', human, { type: 'PASS', playerId: human });
    runner.maybeRun('room1');
    release();
    await new Promise((r) => setTimeout(r, 20));
    // 같은 run 이 다시 확인해 AI 좌석 턴을 진행했어야 한다
    expect(decided.filter((id) => id !== human).length).toBeGreaterThan(0);
  });
});
