import { beforeEach, describe, expect, it } from 'vitest';
import { CLOSE_ERROR, CLOSE_REPLACED, ROOM_TTL_MS, type ServerMsg } from '../src/net/protocol';
import { connect, resetRooms, roomCount, sweep, type Sock } from '../server/hub';

class FakeSock implements Sock {
  readyState = 1;
  sent: ServerMsg[] = [];
  closed: number | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data) as ServerMsg);
  }
  close(code?: number) {
    this.closed = code ?? 1000;
    this.readyState = 3;
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

describe('hub (메모리 방)', () => {
  beforeEach(() => resetRooms());

  it('방을 만들고 참가하면 둘 다 welcome 과 접속 상태를 받는다', () => {
    const a = new FakeSock();
    const b = new FakeSock();
    expect(connect('ABCD', a, 'host', true, 1)).not.toBeNull();
    expect(a.sent[0]).toMatchObject({ t: 'welcome', seat: 1, full: false });
    expect(connect('ABCD', b, 'guest', false, 0)).not.toBeNull();
    expect(b.sent[0]).toMatchObject({ t: 'welcome', seat: 0, full: true, online: [true, true] });
    expect(a.last()).toEqual({ t: 'presence', online: [true, true] });
    expect(roomCount()).toBe(1);
  });

  it('없는 방 참가·가득 찬 방은 오류 후 닫는다', () => {
    const x = new FakeSock();
    expect(connect('ZZZZ', x, 'x', false, 0)).toBeNull();
    expect(x.sent[0]).toEqual({ t: 'error', code: 'notFound' });
    expect(x.closed).toBe(CLOSE_ERROR);
    expect(roomCount()).toBe(0);

    connect('ABCD', new FakeSock(), 'h', true, 0);
    connect('ABCD', new FakeSock(), 'g', false, 0);
    const third = new FakeSock();
    expect(connect('ABCD', third, 't', false, 0)).toBeNull();
    expect(third.sent[0]).toEqual({ t: 'error', code: 'full' });
  });

  it('같은 자리로 다시 들어오면 예전 연결을 밀어낸다', () => {
    const old = new FakeSock();
    const oldEv = connect('ABCD', old, 'h', true, 0)!;
    const fresh = new FakeSock();
    connect('ABCD', fresh, 'h', false, 0);
    expect(old.closed).toBe(CLOSE_REPLACED);
    expect(fresh.sent[0]).toMatchObject({ t: 'welcome', seat: 0 });
    oldEv.onClose(); // 밀려난 소켓의 close 는 무시
    expect(fresh.sent.some((m) => m.t === 'presence' && !m.online[0])).toBe(false);
  });

  it('액션은 상대에게만 전달하고, 잘못된 액션은 보낸 쪽을 되돌린다', () => {
    const a = new FakeSock();
    const b = new FakeSock();
    const ea = connect('ABCD', a, 'h', true, 0)!;
    connect('ABCD', b, 'g', false, 0);
    const state = (a.sent[0] as Extract<ServerMsg, { t: 'welcome' }>).state;
    a.sent = [];
    b.sent = [];
    ea.onMessage(JSON.stringify({ t: 'action', action: { type: 'setup', hole: 0 }, from: state.version }));
    expect(a.sent).toEqual([]);
    expect(b.last()).toMatchObject({ t: 'action', from: state.version });
    ea.onMessage(JSON.stringify({ t: 'action', action: { type: 'setup', hole: 0 }, from: state.version }));
    expect(a.last()?.t).toBe('state');
  });

  it('접속자가 없고 TTL 이 지난 방만 지운다', () => {
    const a = new FakeSock();
    const ev = connect('ABCD', a, 'h', true, 0, 0)!;
    sweep(ROOM_TTL_MS * 2);
    expect(roomCount()).toBe(1); // 접속 중
    ev.onClose();
    sweep(Date.now() + ROOM_TTL_MS - 1000);
    expect(roomCount()).toBe(1);
    sweep(Date.now() + ROOM_TTL_MS + 1000);
    expect(roomCount()).toBe(0);
  });
});
