import { describe, expect, it } from 'vitest';
import { RoomError, RoomManager, roomView } from './rooms';

describe('RoomManager', () => {
  it('채팅: 참가자만, 공백 정리·길이 제한·빈 글 거부·연속 전송 간격, 최근 100개만 보관 (test_insight C9)', () => {
    const rm = new RoomManager();
    const { room, player: host } = rm.create('a');
    const { player: b } = rm.join(room.code, 'b');
    rm.chat(room.code, host.id, '  안녕 \n  하세요  ', 1000);
    expect(room.chat).toMatchObject([{ id: 1, playerId: host.id, name: 'a', text: '안녕 하세요', at: 1000 }]);
    expect(() => rm.chat(room.code, host.id, '   ', 2000)).toThrow(RoomError);
    expect(() => rm.chat(room.code, host.id, 42, 2000)).toThrow(RoomError);
    expect(() => rm.chat(room.code, 'nobody', 'hi', 2000)).toThrow(RoomError);
    expect(() => rm.chat(room.code, host.id, '도배', 1100)).toThrow(RoomError); // 300ms 안의 연속 전송
    rm.chat(room.code, b.id, 'x'.repeat(500), 1100); // 다른 참가자는 바로 가능, 200자로 자름
    expect(room.chat[1]!.text).toHaveLength(200);
    for (let i = 0; i < 120; i++) rm.chat(room.code, host.id, `m${i}`, 10_000 + i * 1000);
    expect(room.chat).toHaveLength(100);
    expect(room.chat.at(-1)).toMatchObject({ id: 122, text: 'm119' });
  });

  it('방 생성/입장: 코드 5자, 호스트, 최대 4명, 이름 중복 불가', () => {
    const rm = new RoomManager();
    const { room, player: host } = rm.create('  호스트  ');
    expect(room.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(host.name).toBe('호스트');
    expect(room.hostId).toBe(host.id);
    rm.join(room.code.toLowerCase(), 'b');
    expect(() => rm.join(room.code, 'b')).toThrow(RoomError);
    rm.join(room.code, 'c');
    rm.join(room.code, 'd');
    expect(() => rm.join(room.code, 'e')).toThrow(RoomError);
    expect(() => rm.join('ZZZZZ', 'x')).toThrow(RoomError);
    expect(() => rm.create('   ')).toThrow(RoomError);
    expect(roomView(room).players.map((p) => p.isHost)).toEqual([true, false, false, false]);
  });

  it('재접속은 토큰이 맞아야 하고 연결 상태를 복구한다', () => {
    const rm = new RoomManager();
    const { room, player } = rm.create('a');
    rm.disconnect(room.code, player.id);
    expect(room.players[0]!.connected).toBe(false);
    expect(() => rm.rejoin(room.code, player.id, 'wrong')).toThrow(RoomError);
    rm.rejoin(room.code, player.id, player.token);
    expect(room.players[0]!.connected).toBe(true);
  });

  it('호스트만 부 변경·시작, 시작 후 입장 불가, 액션은 엔진으로 전달', () => {
    const rm = new RoomManager();
    const { room, player: host } = rm.create('a', 7);
    const { player: b } = rm.join(room.code, 'b');
    expect(() => rm.setDivision(room.code, b.id, 1)).toThrow(RoomError);
    rm.setDivision(room.code, host.id, 2);
    expect(() => rm.start(room.code, b.id)).toThrow(RoomError);
    rm.start(room.code, host.id);
    expect(room.status).toBe('playing');
    expect(room.game?.division).toBe(2);
    expect(() => rm.join(room.code, 'c')).toThrow(RoomError);
    expect(() => rm.start(room.code, host.id)).toThrow(RoomError);

    if (room.game?.phase.kind !== 'setup.draft') throw new Error();
    const card = room.game.phase.hands[host.id]![0]!;
    rm.act(room.code, host.id, { type: 'draftPick', cardId: card });
    if (room.game.phase.kind !== 'setup.draft') throw new Error();
    expect(room.game.phase.picked[host.id]).toBe(card);
    expect(() => rm.act(room.code, host.id, { type: 'draftPick', cardId: card })).toThrow(RoomError);
    expect(() => rm.act(room.code, 'nobody', { type: 'pass' })).toThrow(RoomError);
  });

  it('같은 시드면 같은 게임', () => {
    const make = () => {
      const rm = new RoomManager();
      const { room, player } = rm.create('a', 99);
      rm.join(room.code, 'b');
      rm.start(room.code, player.id);
      return room.game!;
    };
    const g1 = make();
    const g2 = make();
    expect(g1.market).toEqual(g2.market);
    expect(g1.decks.starters).toEqual(g2.decks.starters);
  });

  it('오래된 방 정리', () => {
    const rm = new RoomManager();
    const { room } = rm.create('a');
    expect(rm.sweep(room.updatedAt + 1000)).toBe(0);
    expect(rm.sweep(room.updatedAt + 7 * 60 * 60 * 1000)).toBe(1);
    expect(() => rm.get(room.code)).toThrow(RoomError);
  });
});
