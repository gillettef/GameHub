import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from './app';
import type { ClientMessage, ServerMessage } from './protocol';

// 메시지를 큐에 쌓아두고 조건에 맞는 것을 기다리는 테스트용 클라이언트
class Client {
  private queue: ServerMessage[] = [];
  private waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];
  constructor(private socket: WebSocket) {
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      const i = this.waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(msg);
      else this.queue.push(msg);
    });
  }

  static open(url: string): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(new Client(socket)));
      socket.once('error', reject);
    });
  }

  send(msg: ClientMessage): void {
    this.socket.send(JSON.stringify(msg));
  }

  next<T extends ServerMessage['type']>(type: T, pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true): Promise<Extract<ServerMessage, { type: T }>> {
    const match = (m: ServerMessage): m is Extract<ServerMessage, { type: T }> => m.type === type && pred(m as Extract<ServerMessage, { type: T }>);
    const i = this.queue.findIndex(match);
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve) => this.waiters.push({ pred: match, resolve: (m) => resolve(m as Extract<ServerMessage, { type: T }>) }));
  }

  close(): void {
    this.socket.close();
  }
}

describe('WebSocket 서버', () => {
  const { server, rooms } = createApp();
  let url = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `ws://localhost:${(server.address() as AddressInfo).port}/ws`;
  });
  afterAll(() => server.close());

  it('방 생성 → 입장 → 시작 → 드래프트 액션 → 각자 다른 뷰', async () => {
    const host = await Client.open(url);
    host.send({ type: 'createRoom', name: '호스트', seed: 5 });
    const joined = await host.next('joined');
    expect(joined.code).toHaveLength(5);

    const guest = await Client.open(url);
    guest.send({ type: 'joinRoom', code: joined.code, name: '손님' });
    const guestJoined = await guest.next('joined');
    const room = await host.next('room', (m) => m.room.players.length === 2);
    expect(room.room.players.map((p) => p.name)).toEqual(['호스트', '손님']);

    guest.send({ type: 'startGame' });
    expect((await guest.next('error')).message).toBe('host only');

    host.send({ type: 'startGame' });
    const hostState = await host.next('state');
    const guestState = await guest.next('state');
    expect(hostState.view.me).toBe(joined.playerId);
    expect(guestState.view.me).toBe(guestJoined.playerId);
    if (hostState.view.phase.kind !== 'setup.draft' || guestState.view.phase.kind !== 'setup.draft') throw new Error();
    expect(hostState.view.phase.hand).toHaveLength(4);
    expect(hostState.view.phase.hand).not.toEqual(guestState.view.phase.hand);

    host.send({ type: 'action', action: { type: 'draftPick', cardId: hostState.view.phase.hand[0]! } });
    const after = await guest.next('state', (m) => m.view.phase.kind === 'setup.draft' && m.view.phase.picked[joined.playerId] === true);
    expect(after.view.phase.kind).toBe('setup.draft');

    guest.send({ type: 'action', action: { type: 'draftPick', cardId: 'ex-99' } });
    expect((await guest.next('error')).message).toBe('card not in hand');

    host.close();
    const gone = await guest.next('room', (m) => m.room.players[0]!.connected === false);
    expect(gone.room.players[0]!.name).toBe('호스트');

    const back = await Client.open(url);
    back.send({ type: 'rejoin', code: joined.code, playerId: joined.playerId, token: joined.token });
    await back.next('joined');
    const restored = await back.next('state');
    expect(restored.view.me).toBe(joined.playerId);
    expect(rooms.get(joined.code).players[0]!.connected).toBe(true);
    back.close();
    guest.close();
  });

  it('잘못된 메시지는 error 로 응답', async () => {
    const c = await Client.open(url);
    c.send({ type: 'startGame' });
    expect((await c.next('error')).message).toBe('join a room first');
    c.send({ type: 'joinRoom', code: 'NOPE1', name: 'x' });
    expect((await c.next('error')).message).toBe('room not found');
    c.close();
  });

  it('/health 와 /api/cards', async () => {
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
    const cards = (await (await fetch(`${base}/api/cards`)).json()) as { players: unknown[]; opponents: unknown[] };
    expect(cards.players).toHaveLength(62);
    expect(cards.opponents).toHaveLength(64);
  });
});
