import { describe, expect, it } from 'vitest';
import type { Action, GameState, PlayerId } from '@astraltab/shared';
import { DEFAULT_DECK_CHOICE, canPlay, getMap, legalCells, maskState } from '@astraltab/shared';
import { createAiRunner } from '../game/aiTurn.js';
import { RoomError, RoomManager } from './manager.js';

function makeManager(): RoomManager {
  let n = 0;
  return new RoomManager({ seed: () => 42, now: () => 1000, roomId: () => `room${++n}` });
}

/** 사람 플레이어가 첫 합법 카드를 놓는다 (패스로 게임이 끝나지 않게) */
function placeFirst(m: RoomManager, roomId: string, id: PlayerId): void {
  const state = m.get(roomId)?.state as GameState;
  const player = state.players.find((p) => p.id === id);
  for (const card of player?.hand ?? []) {
    const cell = legalCells(state, id, card)[0];
    if (cell && player && player.energy >= 1) {
      const r = m.tryApply(roomId, { type: 'PLACE', playerId: id, cardId: card, pos: cell });
      if (!r.error) return;
    }
  }
  throw new Error('놓을 카드가 없습니다');
}

function readyAll(m: RoomManager, roomId: string, ids: PlayerId[]): void {
  for (const id of ids) {
    m.act(roomId, id, { type: 'SELECT_DECK', playerId: id, choice: DEFAULT_DECK_CHOICE });
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

  it('정원이 차면 거부, 같은 토큰은 재접속으로 처리', () => {
    const m = makeManager();
    m.create({ playerToken: 't1', nickname: '갑' });
    m.join({ roomId: 'room1', playerToken: 't2', nickname: '을' });
    expect(() => m.join({ roomId: 'room1', playerToken: 't3', nickname: '병' })).toThrow(/정원/);
    const again = m.join({ roomId: 'room1', playerToken: 't2', nickname: '무시됨' });
    expect(again).toMatchObject({ playerId: 'p2', reconnected: true });
    expect(m.get('room1')?.state.players).toHaveLength(2);
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

    // 사람이 배치 → AI 턴
    placeFirst(m, 'room1', 'p1');
    runner.maybeRun('room1');
    expect(runner.isRunning('room1')).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(runner.isRunning('room1')).toBe(false);
    expect(calls).toBe(1);
    expect(m.get('room1')?.state.currentPlayerId).toBe('p1');
    expect(m.get('room1')?.state.log.some((e) => e.kind === 'pass' && e.playerId === aiId)).toBe(true);

    // 두 번째 AI 턴은 배치
    placeFirst(m, 'room1', 'p1');
    runner.maybeRun('room1');
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(2);
    expect(m.get('room1')?.state.log.some((e) => e.kind === 'place' && e.playerId === aiId)).toBe(true);
    expect(changes.length).toBe(2);
  });
});
