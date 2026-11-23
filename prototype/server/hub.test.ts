import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hub, redact, type Conn } from './hub';
import type { RoomView, ServerMsg } from '../src/online/protocol';

function client() {
  const got: ServerMsg[] = [];
  const conn: Conn = { send: (m) => got.push(m) };
  return {
    conn,
    got,
    room: () => [...got].reverse().find((m): m is { t: 'room'; room: RoomView } => m.t === 'room')?.room,
    err: () => [...got].reverse().find((m) => m.t === 'error'),
  };
}

afterEach(() => vi.useRealTimers());

describe('온라인 방', () => {
  it('방 만들기 → 참가 → 봇 추가 → 시작 → 설계 → 실행이 끝까지 진행된다', () => {
    vi.useFakeTimers();
    const hub = new Hub({ botDelayMs: 10 });
    const a = client();
    const b = client();
    hub.handle(a.conn, { t: 'create', name: '앨리스' });
    const code = a.room()!.code;
    hub.handle(b.conn, { t: 'join', code, name: '밥' });
    hub.handle(b.conn, { t: 'start' });
    expect(b.err()).toMatchObject({ msg: '방장만 할 수 있습니다.' });
    hub.handle(a.conn, { t: 'start' });
    expect(a.err()).toBeTruthy(); // 2명이라 시작 불가
    hub.handle(a.conn, { t: 'add-bot' });
    hub.handle(a.conn, { t: 'start' });
    let view = a.room()!;
    expect(view.game?.phase).toBe('design');
    expect(view.mySeat).toBe(0);
    // 다른 사람 손패는 가려진다
    expect(view.game!.players[1]!.hand.every((h) => h === -1)).toBe(true);
    expect(view.game!.players[0]!.hand.every((h) => h >= 0)).toBe(true);

    for (let guard = 0; guard < 2000 && a.room()!.game!.phase !== 'done'; guard++) {
      for (const c of [a, b]) {
        const v = c.room()!;
        const g = v.game!;
        const s = v.mySeat!;
        if (g.phase === 'design' && !g.players[s]!.pending) hub.handle(c.conn, { t: 'design', round: g.round, slots: g.players[s]!.hand.slice(0, 3) });
        const g2 = c.room()!.game!;
        if (g2.phase === 'exec' && (g2.first + g2.turn) % g2.n === s) hub.handle(c.conn, { t: 'intervene', round: g2.round, turn: g2.turn, iv: { k: 'none' } });
      }
      vi.advanceTimersByTime(20);
    }
    view = a.room()!;
    expect(view.game!.phase).toBe('done');
    expect(view.game!.round).toBe(8);
  });

  it('게임 중 나간 사람 자리는 봇이 이어받는다', () => {
    vi.useFakeTimers();
    const hub = new Hub({ botDelayMs: 10 });
    const a = client();
    const b = client();
    hub.handle(a.conn, { t: 'create', name: 'A' });
    hub.handle(b.conn, { t: 'join', code: a.room()!.code, name: 'B' });
    hub.handle(a.conn, { t: 'add-bot' });
    hub.handle(a.conn, { t: 'start' });
    hub.handle(b.conn, { t: 'leave' });
    expect(a.room()!.seats[1]!.kind).toBe('bot');
    expect(a.room()!.game!.players[1]!.kind).toBe('bot');
  });

  it('redact 는 공개 전 배치와 주머니를 가린다', () => {
    const hub = new Hub();
    const a = client();
    hub.handle(a.conn, { t: 'create', name: 'A' });
    hub.handle(a.conn, { t: 'add-bot' });
    hub.handle(a.conn, { t: 'add-bot' });
    hub.handle(a.conn, { t: 'start' });
    const g = a.room()!.game!;
    expect(g.bag.every((x) => x === -1)).toBe(true);
    expect(g.rng).toBe(0);
    // 봇 설계자는 이미 놓았지만 앞면은 가려진다
    expect(g.players[1]!.pending).toEqual([-1, -1, -1]);
    expect(redact(g, null).players[0]!.hand.every((x) => x === -1)).toBe(true);
  });
});
