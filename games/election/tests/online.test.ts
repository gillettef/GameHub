import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { applyAction, initialState, legalActions } from '../src/core/rules';
import type { Action, Player } from '../src/core/types';
import { GameController } from '../src/game/controller';
import {
  isRoomCode,
  normalizeRoomCode,
  parseClientMsg,
  parseServerMsg,
  randomRoomCode,
  type ClientMsg,
  type ServerMsg,
} from '../src/net/protocol';
import { socketUrl } from '../src/net/online';
import { emptyRoom, handleMessage, joinRoom, type RoomData } from '../server/room';

const instant = () => Promise.resolve();
const tick = () => new Promise((r) => setTimeout(r, 0));

async function idle(...cs: GameController[]) {
  for (let k = 0; k < 10000 && cs.some((c) => c.view.busy); k++) await tick();
  for (const c of cs) expect(c.view.busy).toBe(false);
}

function joined(): RoomData {
  const a = joinRoom(emptyRoom(), 'host', true);
  if (!a.ok) throw new Error();
  const b = joinRoom(a.data, 'guest', false);
  if (!b.ok) throw new Error();
  return b.data;
}

describe('방 접속 (server/room)', () => {
  it('만들기 → 참가 → 재접속은 원래 자리', () => {
    const a = joinRoom(emptyRoom(), 'host', true);
    expect(a).toMatchObject({ ok: true, seat: 0 });
    if (!a.ok) return;
    expect(a.data.state).toEqual(initialState());
    const b = joinRoom(a.data, 'guest', false);
    expect(b).toMatchObject({ ok: true, seat: 1 });
    if (!b.ok) return;
    expect(joinRoom(b.data, 'guest', false)).toMatchObject({ ok: true, seat: 1 });
    expect(joinRoom(b.data, 'host', false)).toMatchObject({ ok: true, seat: 0 });
    // 방장이 create=1로 다시 와도(첫 welcome 전에 끊긴 경우) 자기 자리
    expect(joinRoom(b.data, 'host', true)).toMatchObject({ ok: true, seat: 0 });
  });

  it('방장이 🔴(seat 1)로 정해지면 참가자는 🔵(seat 0)', () => {
    const a = joinRoom(emptyRoom(), 'host', true, 1);
    expect(a).toMatchObject({ ok: true, seat: 1 });
    if (!a.ok) return;
    expect(a.data.seats).toEqual([null, 'host']);
    const b = joinRoom(a.data, 'guest', false);
    expect(b).toMatchObject({ ok: true, seat: 0 });
    if (!b.ok) return;
    expect(b.data.seats).toEqual(['guest', 'host']);
    expect(joinRoom(b.data, 'host', true)).toMatchObject({ ok: true, seat: 1 });
    expect(joinRoom(b.data, 'third', false)).toEqual({ ok: false, error: 'full' });
  });

  it('없는 방·가득 찬 방·겹치는 코드·잘못된 식별자', () => {
    expect(joinRoom(emptyRoom(), 'x', false)).toEqual({ ok: false, error: 'notFound' });
    expect(joinRoom(joined(), 'third', false)).toEqual({ ok: false, error: 'full' });
    expect(joinRoom(joined(), 'third', true)).toEqual({ ok: false, error: 'taken' });
    expect(joinRoom(emptyRoom(), '', true)).toEqual({ ok: false, error: 'badRequest' });
    expect(joinRoom(emptyRoom(), 'x'.repeat(65), true)).toEqual({ ok: false, error: 'badRequest' });
  });
});

describe('방 메시지 처리 (server/room)', () => {
  it('차례인 쪽의 합법 수만 적용하고 상대에게 전달', () => {
    const d = joined();
    const a: Action = { type: 'setup', hole: 2 };
    const r = handleMessage(d, 0, { t: 'action', action: a, from: 0 });
    expect(r.changed).toBe(true);
    expect(r.data.state).toEqual(applyAction(initialState(), a));
    expect(r.out).toEqual([{ to: 'others', msg: { t: 'action', action: a, from: 0 } }]);
  });

  it('남의 차례·오래된 version·불법 수는 보낸 쪽을 서버 상태로 되돌린다', () => {
    const d = joined();
    const back = [{ to: 'self', msg: { t: 'state', state: d.state } }];
    for (const [seat, msg] of [
      [1, { t: 'action', action: { type: 'setup', hole: 0 }, from: 0 }],
      [0, { t: 'action', action: { type: 'setup', hole: 0 }, from: 3 }],
      [0, { t: 'action', action: { type: 'pick', hole: 0 }, from: 0 }],
    ] as [Player, ClientMsg][]) {
      const r = handleMessage(d, seat, msg);
      expect(r.changed).toBe(false);
      expect(r.out).toEqual(back);
    }
    expect(handleMessage(d, 1, { t: 'sync' }).out).toEqual(back);
  });

  it('새 판은 끝난 뒤에만', () => {
    const d = joined();
    expect(handleMessage(d, 0, { t: 'again' }).changed).toBe(false);
    let s = d.state!;
    const rng = mulberry32(1);
    while (s.phase !== 'over') {
      const legal = legalActions(s);
      s = applyAction(s, legal[Math.floor(rng() * legal.length)]);
    }
    const r = handleMessage({ ...d, state: s }, 1, { t: 'again' });
    expect(r.changed).toBe(true);
    expect(r.data.state).toEqual(initialState());
    expect(r.out).toEqual([{ to: 'all', msg: { t: 'state', state: initialState() } }]);
  });
});

describe('프로토콜', () => {
  it('방 코드', () => {
    const code = randomRoomCode(mulberry32(5));
    expect(isRoomCode(code)).toBe(true);
    expect(normalizeRoomCode(' k7q-m ')).toBe('K7QM');
    expect(isRoomCode('K7QM')).toBe(true);
    expect(isRoomCode('K0QM')).toBe(false); // 0은 쓰지 않는다
    expect(isRoomCode('K7Q')).toBe(false);
  });

  it('메시지 검사', () => {
    expect(parseClientMsg('{"t":"action","action":{"type":"drop","color":1},"from":4}')).toEqual({
      t: 'action',
      action: { type: 'drop', color: 1 },
      from: 4,
    });
    expect(parseClientMsg('{"t":"action","action":{"type":"place","hole":6},"from":0}')).toBeNull();
    expect(parseClientMsg('{"t":"action","action":{"type":"endPlace"},"from":-1}')).toBeNull();
    expect(parseClientMsg('not json')).toBeNull();
    expect(parseClientMsg('{"t":"again","x":1}')).toEqual({ t: 'again' });
    expect(parseClientMsg('x'.repeat(5000))).toBeNull();

    const welcome: ServerMsg = { t: 'welcome', seat: 1, state: initialState(), online: [true, false], full: true };
    expect(parseServerMsg(JSON.stringify(welcome))).toEqual(welcome);
    expect(parseServerMsg(JSON.stringify({ ...welcome, state: { ...initialState(), current: 2 } }))).toBeNull();
    expect(parseServerMsg('{"t":"error","code":"full"}')).toEqual({ t: 'error', code: 'full' });
    expect(parseServerMsg('{"t":"error","code":"boom"}')).toBeNull();
  });

  it('접속 주소', () => {
    const loc = { protocol: 'https:', host: 'game.example' };
    expect(socketUrl({ code: 'K7QM', clientId: 'abc', create: true }, loc)).toBe(
      'wss://game.example/api/room/K7QM?id=abc&create=1',
    );
    expect(
      socketUrl({ code: 'K7QM', clientId: 'abc', create: false, origin: 'http://localhost:38637' }, loc),
    ).toBe('ws://localhost:38637/api/room/K7QM?id=abc');
    // 게임 허브가 /election/ 아래로 프록시할 때는 페이지 디렉터리를 붙인다
    const hub = { protocol: 'http:', host: 'hub.example', pathname: '/election/' };
    expect(socketUrl({ code: 'K7QM', clientId: 'abc', create: false }, hub)).toBe(
      'ws://hub.example/election/api/room/K7QM?id=abc',
    );
    expect(
      socketUrl({ code: 'K7QM', clientId: 'abc', create: false }, { ...hub, pathname: '/election/index.html' }),
    ).toBe('ws://hub.example/election/api/room/K7QM?id=abc');
    expect(socketUrl({ code: 'K7QM', clientId: 'abc', create: false }, { ...hub, pathname: '/' })).toBe(
      'ws://hub.example/api/room/K7QM?id=abc',
    );
  });
});

describe('온라인 컨트롤러', () => {
  it('내 수는 적용 전 version과 함께 보낸다', async () => {
    const sent: [Action, number][] = [];
    const c = new GameController({ mode: 'online', seat: 0, sleep: instant, sendAction: (a, f) => sent.push([a, f]) });
    c.start();
    expect(c.canAct()).toBe(true);
    c.act({ type: 'setup', hole: 1 });
    await idle(c);
    expect(sent).toEqual([[{ type: 'setup', hole: 1 }, 0]]);
    expect(c.canAct()).toBe(false); // 이제 상대 차례
    expect(c.act({ type: 'setup', hole: 2 })).toBe(false);
  });

  it('상대 수가 어긋나면 재생하지 않고 재동기화를 요청한다', async () => {
    let desync = 0;
    const c = new GameController({ mode: 'online', seat: 1, sleep: instant, onDesync: () => desync++ });
    c.start();
    c.remoteAction({ type: 'setup', hole: 0 }, 5); // version이 틀림
    await idle(c);
    expect(desync).toBe(1);
    expect(c.state.version).toBe(0);
    c.remoteAction({ type: 'setup', hole: 0 }, 0);
    await idle(c);
    expect(c.state.version).toBe(1);
    expect(c.canAct()).toBe(true);
    c.remoteAction({ type: 'setup', hole: 1 }, 1); // 내 차례인데 상대 수
    await idle(c);
    expect(desync).toBe(2);
    expect(c.state.version).toBe(1);
  });

  it('resync는 상태를 바꾸고, 같은 상태면 진행 중 연출을 끊지 않는다', async () => {
    const c = new GameController({ mode: 'online', seat: 0, sleep: instant });
    c.start();
    const s1 = applyAction(initialState(), { type: 'setup', hole: 3 });
    c.resync(s1);
    expect(c.state).toEqual(s1);
    expect(c.canAct()).toBe(false);
    const before = c.view;
    c.resync(structuredClone(s1));
    expect(c.view.state).toBe(before.state);
  });

  it('두 기기 + 서버 로직으로 한 판을 끝까지 두면 세 상태가 같다', async () => {
    let room = joined();
    const devices: GameController[] = [];
    const rng = mulberry32(42);
    const deliver = (from: Player, msg: ClientMsg) => {
      const r = handleMessage(room, from, msg);
      room = r.data;
      for (const o of r.out) {
        const targets = o.to === 'self' ? [from] : o.to === 'others' ? [from === 0 ? 1 : 0] : [0, 1];
        for (const t of targets) {
          const d = devices[t];
          if (o.msg.t === 'action') d.remoteAction(o.msg.action, o.msg.from);
          else if (o.msg.t === 'state') d.resync(o.msg.state);
        }
      }
    };
    for (const seat of [0, 1] as const) {
      devices.push(
        new GameController({
          mode: 'online',
          seat,
          sleep: instant,
          // 실제 네트워크처럼 비동기로 전달
          sendAction: (action, from) => void Promise.resolve().then(() => deliver(seat, { t: 'action', action, from })),
          onDesync: () => deliver(seat, { t: 'sync' }),
        }),
      );
    }
    devices.forEach((d) => d.start());
    for (let k = 0; k < 1000; k++) {
      await idle(...devices); // 서버 전달이 비동기라 기다린 뒤에 끝났는지 본다
      if (room.state!.phase === 'over') break;
      const d = devices[room.state!.current];
      expect(d.canAct()).toBe(true);
      const legal = legalActions(d.state);
      expect(d.act(legal[Math.floor(rng() * legal.length)])).toBe(true);
    }
    await idle(...devices);
    expect(room.state!.phase).toBe('over');
    expect(devices[0].state).toEqual(room.state);
    expect(devices[1].state).toEqual(room.state);

    // 새 판
    deliver(1, { t: 'again' });
    await idle(...devices);
    expect(devices[0].state).toEqual(initialState());
    expect(devices[1].state).toEqual(initialState());
    expect(devices[0].canAct()).toBe(true);
  });
});
