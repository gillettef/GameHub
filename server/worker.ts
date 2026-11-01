/**
 * Cloudflare Worker 진입점.
 * - /api/room/:code  → 방 코드별 Durable Object(Room)로 WebSocket 연결을 넘긴다.
 * - 그 외 경로는 wrangler.jsonc의 assets 설정으로 정적 파일이 바로 응답한다.
 *
 * Room은 WebSocket Hibernation API를 쓴다(접속만 유지되는 동안엔 과금·메모리 없음).
 * 판단 로직은 server/room.ts(순수)에 있고 여기서는 저장·소켓 전달만 한다.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Player } from '../src/core/types';
import {
  CLOSE_ERROR,
  CLOSE_REPLACED,
  ROOM_TTL_MS,
  isRoomCode,
  parseClientMsg,
  type ServerMsg,
} from '../src/net/protocol';
import { emptyRoom, handleMessage, joinRoom, type Outgoing, type RoomData } from './room';

interface Attachment {
  seat: Player;
}

const STORAGE_KEY = 'room';
const seatTag = (p: Player) => `seat${p}`;

export class Room extends DurableObject<Env> {
  private data: RoomData = emptyRoom();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 깨어날 때(하이버네이션 복귀 포함) 저장된 방을 먼저 읽는다
    void ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<RoomData>(STORAGE_KEY)) ?? emptyRoom();
    });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket 연결만 받습니다', { status: 426 });
    const url = new URL(req.url);
    // 방장 자리(🔵 선공 / 🔴 후공)는 무작위
    const hostSeat = Math.random() < 0.5 ? 0 : 1;
    const result = joinRoom(this.data, url.searchParams.get('id') ?? '', url.searchParams.get('create') === '1', hostSeat);
    const { 0: client, 1: server } = new WebSocketPair();

    if (!result.ok) {
      // 브라우저 WebSocket은 HTTP 오류 본문을 읽을 수 없으므로, 연결을 받은 뒤 오류를 알리고 닫는다
      server.accept();
      send(server, { t: 'error', code: result.error });
      server.close(CLOSE_ERROR, result.error);
      return new Response(null, { status: 101, webSocket: client });
    }

    const { seat } = result;
    // 같은 자리의 예전 연결(다른 탭·끊긴 기기)은 정리
    for (const old of this.ctx.getWebSockets(seatTag(seat))) old.close(CLOSE_REPLACED, 'replaced');
    this.ctx.acceptWebSocket(server, [seatTag(seat)]);
    server.serializeAttachment({ seat } satisfies Attachment);

    if (result.data !== this.data) await this.save(result.data);
    else await this.touch();
    const state = this.data.state;
    if (state) send(server, { t: 'welcome', seat, state, online: this.presence(), full: !this.data.seats.includes(null) });
    this.broadcastPresence(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    const msg = parseClientMsg(raw);
    if (!att || !msg) return;
    const r = handleMessage(this.data, att.seat, msg);
    if (r.changed) await this.save(r.data);
    this.dispatch(ws, r.out);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.broadcastPresence(undefined, ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(undefined, ws);
  }

  /** 오래 쓰지 않은 방은 지운다 */
  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      await this.touch();
      return;
    }
    this.data = emptyRoom();
    await this.ctx.storage.deleteAll();
  }

  // ---------- 내부 ----------

  private async save(data: RoomData): Promise<void> {
    this.data = data;
    await this.ctx.storage.put(STORAGE_KEY, data);
    await this.touch();
  }

  private async touch(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  private presence(except?: WebSocket): [boolean, boolean] {
    const on = (p: Player) => this.ctx.getWebSockets(seatTag(p)).some((w) => w !== except && w.readyState === WebSocket.OPEN);
    return [on(0), on(1)];
  }

  /** 접속 상태를 알린다. skip에게는 보내지 않고, closing은 접속자로 세지 않는다 */
  private broadcastPresence(skip?: WebSocket, closing?: WebSocket): void {
    const msg: ServerMsg = { t: 'presence', online: this.presence(closing) };
    for (const w of this.ctx.getWebSockets()) if (w !== skip && w !== closing) send(w, msg);
  }

  private dispatch(self: WebSocket, out: Outgoing[]): void {
    for (const o of out) {
      if (o.to === 'self') send(self, o.msg);
      else for (const w of this.ctx.getWebSockets()) if (o.to === 'all' || w !== self) send(w, o.msg);
    }
  }
}

function send(ws: WebSocket, msg: ServerMsg): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* 이미 닫힌 소켓 */
  }
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    const m = /^\/api\/room\/([^/]+)$/.exec(url.pathname);
    if (m && isRoomCode(m[1])) return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
