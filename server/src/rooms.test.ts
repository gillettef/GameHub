import { describe, expect, it } from 'vitest';
import { EMBLEM_IDS } from './protocol';
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

  it('구단 엠블럼: 입장하면 안 쓰는 것을 받고, 대기실에서만 바꾸며, 다른 참가자(봇 포함)의 것은 못 고른다', () => {
    const rm = new RoomManager();
    const { room, player: host } = rm.create('a');
    const { player: b } = rm.join(room.code, 'b');
    rm.addBot(room.code, host.id);
    expect(new Set(room.players.map((p) => p.emblem)).size).toBe(3);
    // 처음 엠블럼은 무작위라 'castle'을 누가 받았을 수 있다 — 그러면 먼저 비워 둔다
    for (const p of room.players) {
      if (p.id !== b.id && p.emblem === 'castle') rm.setEmblem(room.code, p.id, EMBLEM_IDS.find((e) => !room.players.some((q) => q.emblem === e))!);
    }
    rm.setEmblem(room.code, b.id, 'castle');
    expect(roomView(room).players.find((p) => p.id === b.id)!.emblem).toBe('castle');
    expect(() => rm.setEmblem(room.code, host.id, 'castle')).toThrow(RoomError); // 이미 쓰는 엠블럼
    expect(() => rm.setEmblem(room.code, host.id, room.players.find((p) => p.isBot)!.emblem)).toThrow(RoomError);
    expect(() => rm.setEmblem(room.code, host.id, 'nope' as never)).toThrow(RoomError);
    expect(() => rm.setEmblem(room.code, 'nobody', 'sun')).toThrow(RoomError);
    rm.setEmblem(room.code, b.id, 'castle'); // 같은 것을 다시 골라도 된다
    rm.start(room.code, host.id);
    expect(() => rm.setEmblem(room.code, host.id, 'sun')).toThrow(RoomError); // 시작한 뒤에는 불가
    expect(roomView(room).players.find((p) => p.id === b.id)!.emblem).toBe('castle'); // 게임 중에도 방 정보로 내려간다
  });

  it('구단 엠블럼: 처음 받는 것은 무작위다 (사람·봇 모두, 프리셋 순서대로가 아님)', () => {
    const rm = new RoomManager();
    const hosts = new Set<string>();
    const bots = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { room, player: host } = rm.create('a');
      rm.addBot(room.code, host.id);
      hosts.add(host.emblem);
      bots.add(room.players.find((p) => p.isBot)!.emblem);
    }
    expect(hosts.size).toBeGreaterThan(1);
    expect(bots.size).toBeGreaterThan(1);
  });

  it('강퇴: 호스트만, 대기실에서만, 자기 자신은 안 되고, 봇·사람 모두 내보낼 수 있다. 내보낸 뒤에는 재접속도 안 된다', () => {
    const rm = new RoomManager();
    const { room, player: host } = rm.create('a');
    const { player: b } = rm.join(room.code, 'b');
    rm.addBot(room.code, host.id);
    const bot = room.players.find((p) => p.isBot)!;
    expect(() => rm.kick(room.code, b.id, host.id)).toThrow(RoomError); // 호스트만
    expect(() => rm.kick(room.code, host.id, host.id)).toThrow(RoomError); // 자기 자신
    expect(() => rm.kick(room.code, host.id, 'nobody')).toThrow(RoomError);
    expect(rm.kick(room.code, host.id, b.id).kicked.id).toBe(b.id);
    expect(rm.kick(room.code, host.id, bot.id).kicked.isBot).toBe(true);
    expect(room.players.map((p) => p.id)).toEqual([host.id]);
    expect(() => rm.rejoin(room.code, b.id, b.token)).toThrow(RoomError);
    const again = rm.join(room.code, 'b').player; // 같은 이름으로 다시 들어올 수는 있다
    rm.start(room.code, host.id);
    expect(() => rm.kick(room.code, host.id, again.id)).toThrow(RoomError); // 시작한 뒤에는 불가
  });

  it('시작 순서는 항상 무작위: 자리 순서를 섞고(같은 참가자 집합, 첫 자리가 선 참가자) 기록에 남긴다', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const rm = new RoomManager();
      const { room, player: host } = rm.create('a', seed);
      for (const n of ['b', 'c', 'd']) rm.join(room.code, n);
      const before = room.players.map((p) => p.id);
      rm.start(room.code, host.id);
      const seats = room.game!.seats;
      expect([...seats].sort()).toEqual([...before].sort());
      expect(room.game!.firstPlayer).toBe(seats[0]);
      expect(room.players.map((p) => p.id)).toEqual(seats);
      expect(room.game!.log.some((e) => e.text.startsWith('[준비] 시작 순서를 무작위로 정함'))).toBe(true);
      orders.add(seats.map((id) => before.indexOf(id)).join(''));
    }
    expect(orders.size).toBeGreaterThan(3); // 시드에 따라 순서가 달라진다
  });

  it('다시 하기: 호스트만, 끝난 게임에서만 같은 멤버로 대기실로 돌아가고 다시 시작할 수 있다', () => {
    const rm = new RoomManager();
    const { room, player: host } = rm.create('a');
    const { player: b } = rm.join(room.code, 'b');
    rm.addBot(room.code, host.id);
    rm.start(room.code, host.id);
    expect(() => rm.rematch(room.code, host.id)).toThrow(RoomError); // 진행 중에는 불가
    room.status = 'over';
    expect(() => rm.rematch(room.code, b.id)).toThrow(RoomError); // 호스트만
    rm.rematch(room.code, host.id);
    expect(room.status).toBe('lobby');
    expect(room.game).toBeUndefined();
    expect(room.players).toHaveLength(3); // 참가자·봇 그대로
    rm.start(room.code, host.id);
    expect(room.game?.week).toBe(1);
  });

  it('경기 보기 완료 표시: 참가자만, 주차·차례가 바뀌면 새로 센다', () => {
    const rm = new RoomManager();
    const { room, player: host } = rm.create('a');
    const { player: b } = rm.join(room.code, 'b');
    rm.markWatched(room.code, host.id, 1, 'x');
    rm.markWatched(room.code, host.id, 1, 'x');
    rm.markWatched(room.code, b.id, 1, 'x');
    expect(room.watched).toEqual({ key: '1:x', ids: [host.id, b.id] });
    rm.markWatched(room.code, b.id, 1, 'y');
    expect(room.watched).toEqual({ key: '1:y', ids: [b.id] });
    expect(() => rm.markWatched(room.code, 'nobody', 1, 'y')).toThrow(RoomError);
    expect(() => rm.markWatched(room.code, host.id, '1', 'y')).toThrow(RoomError);
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
