import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOTAL_ROUNDS } from '../src/core';
import type { RoomView, ServerMsg } from '../src/online/protocol';
import { Hub, type Conn } from './hub';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  send(m: ServerMsg) {
    this.msgs.push(m);
  }
  get room(): RoomView {
    const r = [...this.msgs].reverse().find((m) => m.t === 'room');
    if (!r || r.t !== 'room') throw new Error('no room');
    return r.room;
  }
  get token(): string {
    const j = [...this.msgs].reverse().find((m) => m.t === 'joined');
    if (!j || j.t !== 'joined') throw new Error('not joined');
    return j.token;
  }
  lastError(): string | undefined {
    const e = [...this.msgs].reverse().find((m) => m.t === 'error');
    return e?.t === 'error' ? e.msg : undefined;
  }
}

let seed = 1;
const makeHub = () => new Hub({ randInt: (n) => (seed = (seed * 48271) % 2147483647) % n });

/** 방장 + 친구 1명 + AI 1명 방을 만들고 시작 */
function startedRoom() {
  const hub = makeHub();
  const a = new FakeConn();
  const b = new FakeConn();
  hub.handle(a, { t: 'create', name: '방장' });
  hub.handle(b, { t: 'join', code: a.room.code, name: '친구' });
  hub.handle(a, { t: 'add-ai' });
  hub.handle(a, { t: 'start' });
  return { hub, a, b };
}

const passBid = { first: null, second: null };

/** 두 사람 모두 패스로 한 라운드 진행 */
function playRound(hub: Hub, a: FakeConn, b: FakeConn, round: number) {
  hub.handle(a, { t: 'bid', round, bid: passBid });
  hub.handle(b, { t: 'bid', round, bid: passBid });
  expect(a.room.game!.phase).toBe('result');
  hub.handle(a, { t: 'ready', round });
  hub.handle(b, { t: 'ready', round });
}

function guessAll(hub: Hub, a: FakeConn, b: FakeConn) {
  hub.handle(a, { t: 'guess', picks: { 1: a.room.game!.clubs[0]! } });
  hub.handle(b, { t: 'guess', picks: {} });
}

afterEach(() => vi.useRealTimers());

describe('온라인 방', () => {
  it('방을 만들고 코드로 참가한다', () => {
    const hub = makeHub();
    const a = new FakeConn();
    const b = new FakeConn();
    hub.handle(a, { t: 'create', name: '방장' });
    const code = a.room.code;
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    hub.handle(b, { t: 'join', code: code.toLowerCase(), name: '방장' });
    expect(b.room.seats.map((s) => s.name)).toEqual(['방장', '방장2']);
    expect(a.room.host).toBe(a.room.me);
    expect(b.room.me).not.toBe(b.room.host);
  });

  it('3명 미만이면 시작할 수 없고, 방장만 시작할 수 있다', () => {
    const hub = makeHub();
    const a = new FakeConn();
    const b = new FakeConn();
    hub.handle(a, { t: 'create', name: '방장' });
    hub.handle(b, { t: 'join', code: a.room.code, name: '친구' });
    hub.handle(a, { t: 'start' });
    expect(a.lastError()).toContain('3명 이상');
    hub.handle(a, { t: 'add-ai' });
    hub.handle(b, { t: 'start' });
    expect(b.lastError()).toContain('방장');
    expect(a.room.game).toBeNull();
  });

  it('자리가 꽉 차면 AI 자리를 사람에게 내주고, 시작한 방에는 들어갈 수 없다', () => {
    const hub = makeHub();
    const a = new FakeConn();
    hub.handle(a, { t: 'create', name: '방장' });
    for (let i = 0; i < 3; i++) hub.handle(a, { t: 'add-ai' });
    expect(a.room.seats).toHaveLength(4);
    const b = new FakeConn();
    hub.handle(b, { t: 'join', code: a.room.code, name: '친구' });
    expect(b.room.seats.map((s) => s.kind)).toEqual(['human', 'ai', 'ai', 'human']);
    hub.handle(a, { t: 'start' });
    const c = new FakeConn();
    hub.handle(c, { t: 'join', code: a.room.code, name: '늦은사람' });
    expect(c.lastError()).toContain('이미 게임이 시작');
  });

  it('다른 사람의 비밀 구단·이후 이벤트·난수 상태는 가려서 보낸다', () => {
    const { a, b } = startedRoom();
    const ga = a.room.game!;
    const gb = b.room.game!;
    expect(ga.agents[0]!.secret).toBeGreaterThanOrEqual(0);
    expect(ga.agents[1]!.secret).toBe(-1);
    expect(ga.agents[2]!.secret).toBe(-1);
    expect(gb.agents[1]!.secret).toBeGreaterThanOrEqual(0);
    expect(gb.agents[0]!.secret).toBe(-1);
    expect(ga.rng).toBe(0);
    expect(ga.events).toHaveLength(2);
  });

  it('모두 제출하면 정산하고, 끝까지 진행하면 비밀 구단이 공개된다', () => {
    const { hub, a, b } = startedRoom();
    for (let round = 1; round <= TOTAL_ROUNDS; round++) playRound(hub, a, b, round);
    expect(a.room.game!.phase).toBe('guess');
    guessAll(hub, a, b);
    const g = a.room.game!;
    expect(g.phase).toBe('done');
    expect(g.agents.every((x) => x.secret >= 0 && x.final)).toBe(true);
  });

  it('제출 현황(done)에는 누가 냈는지만 보이고 내용은 내 것만 보인다', () => {
    const { hub, a, b } = startedRoom();
    hub.handle(a, { t: 'bid', round: 1, bid: { first: { playerId: a.room.game!.market[0]!, clubId: a.room.game!.clubs[0]!, demand: 1 }, second: null } });
    expect(b.room.done).toEqual([0]);
    expect(b.room.myBid).toBeNull();
    expect(a.room.myBid?.first?.demand).toBe(1);
    // 같은 라운드 중복 제출은 무시
    hub.handle(a, { t: 'bid', round: 1, bid: passBid });
    expect(a.room.myBid?.first?.demand).toBe(1);
  });

  it('게임 중 나가면 그 자리는 AI가 이어받고 남은 사람만 기다린다', () => {
    const { hub, a, b } = startedRoom();
    hub.handle(b, { t: 'leave' });
    expect(a.room.seats[1]!.kind).toBe('ai');
    expect(a.room.game!.agents[1]!.kind).toBe('ai');
    hub.handle(a, { t: 'bid', round: 1, bid: passBid });
    expect(a.room.game!.phase).toBe('result');
  });

  it('끊긴 사람은 다음 라운드 준비를 막지 않고, 토큰으로 같은 자리에 돌아온다', () => {
    const { hub, a, b } = startedRoom();
    hub.handle(a, { t: 'bid', round: 1, bid: passBid });
    hub.handle(b, { t: 'bid', round: 1, bid: passBid });
    const code = a.room.code;
    const token = b.token;
    hub.disconnect(b);
    expect(a.room.seats[1]!.online).toBe(false);
    hub.handle(a, { t: 'ready', round: 1 });
    expect(a.room.game!.round).toBe(2);
    expect(a.room.game!.phase).toBe('bid');
    const b2 = new FakeConn();
    hub.handle(b2, { t: 'rejoin', code, token: 'wrong' });
    expect(b2.msgs.at(-1)).toEqual({ t: 'rejoin-failed' });
    hub.handle(b2, { t: 'rejoin', code, token });
    expect(b2.room.mySeat).toBe(1);
    expect(b2.room.game!.agents[1]!.secret).toBeGreaterThanOrEqual(0);
    expect(a.room.seats[1]!.online).toBe(true);
  });

  it('방장이 끊긴 채 시간이 지나면 접속 중인 사람에게 방장을 넘긴다', () => {
    vi.useFakeTimers();
    const { hub, a, b } = startedRoom();
    hub.disconnect(a);
    vi.advanceTimersByTime(31_000);
    expect(b.room.host).toBe(b.room.me);
  });

  it('방장은 사람 자리를 AI에게 넘길 수 있고, 다른 사람은 못 한다', () => {
    const { hub, a, b } = startedRoom();
    const pidA = a.room.me;
    hub.handle(b, { t: 'kick', pid: pidA });
    expect(b.lastError()).toContain('방장');
    hub.handle(a, { t: 'kick', pid: b.room.me });
    expect(b.msgs.at(-1)).toEqual({ t: 'kicked' });
    expect(a.room.game!.agents[1]!.kind).toBe('ai');
  });

  it('끝난 뒤 다시 하기를 누르면 같은 멤버로 대기실에 돌아간다', () => {
    const { hub, a, b } = startedRoom();
    for (let round = 1; round <= TOTAL_ROUNDS; round++) playRound(hub, a, b, round);
    guessAll(hub, a, b);
    hub.handle(a, { t: 'rematch' });
    expect(a.room.game).toBeNull();
    expect(b.room.seats.map((s) => s.kind)).toEqual(['human', 'human', 'ai']);
  });

  it('모두 끊긴 방은 시간이 지나면 지운다', () => {
    vi.useFakeTimers();
    const { hub, a, b } = startedRoom();
    hub.disconnect(a);
    hub.disconnect(b);
    expect(hub.roomCount).toBe(1);
    vi.advanceTimersByTime(31 * 60_000);
    expect(hub.roomCount).toBe(0);
  });

});
