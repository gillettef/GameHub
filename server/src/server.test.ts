import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from './app';
import { RoomManager } from './rooms';
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

  it('채팅: 방 전원(관전자 포함)에게 전달되고, 나중에 들어온 사람도 지난 글을 받으며, 관전자는 쓸 수 없다 (test_insight C9)', async () => {
    const host = await Client.open(url);
    host.send({ type: 'createRoom', name: '호스트' });
    const { code } = await host.next('joined');
    const watcher = await Client.open(url);
    watcher.send({ type: 'spectate', code });
    await watcher.next('spectating');

    host.send({ type: 'chat', text: '  안녕하세요  ' });
    const sent = (m: Extract<ServerMessage, { type: 'chat' }>) => m.messages.length === 1;
    expect((await host.next('chat', sent)).messages[0]).toMatchObject({ name: '호스트', text: '안녕하세요' });
    expect((await watcher.next('chat', sent)).messages[0]!.text).toBe('안녕하세요');

    watcher.send({ type: 'chat', text: '관전자도 한마디' });
    expect((await watcher.next('error')).message).toBe('spectators cannot act');

    const late = await Client.open(url);
    late.send({ type: 'joinRoom', code, name: '늦은 손님' });
    expect((await late.next('chat')).messages.map((m) => m.text)).toEqual(['안녕하세요']);
    for (const c of [host, watcher, late]) c.close();
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
    expect(cards.players).toHaveLength(76);
    expect(cards.opponents).toHaveLength(64);
  });
});

describe('정적 클라이언트 서빙 (배포 모드)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eleven-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Eleven</title>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  const { server } = createApp(new RoomManager(), { staticDir: dir });
  let base = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('index.html 과 assets 를 내려주고, API 경로는 그대로 동작한다', async () => {
    const index = await fetch(`${base}/`);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('Eleven');
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(await js.text()).toBe('console.log(1)');
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
  });

  it('파일이 아닌 경로는 SPA 진입점으로, 없는 파일과 경로 탈출은 404', async () => {
    expect(await (await fetch(`${base}/room/ABCDE`)).text()).toContain('Eleven');
    expect((await fetch(`${base}/missing.png`)).status).toBe(404);
    expect((await fetch(`${base}/assets/..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  it('잘못된 % 인코딩 주소는 400 으로 답하고 서버는 살아 있다 (예외로 프로세스가 죽지 않게)', async () => {
    expect((await fetch(`${base}/%`)).status).toBe(400);
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(400);
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
  });

  it('정적 디렉터리가 없으면 404 (개발 모드)', async () => {
    const { server: bare } = createApp(new RoomManager(), { staticDir: join(dir, 'nope') });
    await new Promise<void>((resolve) => bare.listen(0, resolve));
    const res = await fetch(`http://localhost:${(bare.address() as AddressInfo).port}/`);
    expect(res.status).toBe(404);
    bare.close();
  });
});
